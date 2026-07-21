import { Redis } from '@upstash/redis';
import { countRecentAuditEvents } from './audit';
import { Errors } from './errors';

/**
 * Real Upstash Redis-backed rate limiting (DR-066) -- env-gated behind
 * UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN (OI-10, no account
 * provisioned yet). Same "real adapter, graceful degradation" precedent as
 * the notification gateways (DR-013, charter rule 8): unconfigured, every
 * function below falls back to a pre-existing, infra-free behavior instead
 * of throwing, so nothing regresses while OI-10 stays open.
 *
 * The client is constructed fresh per call rather than cached at module
 * load -- @upstash/redis is a stateless REST client (no connection to
 * pool, unlike ioredis), so there's no cost to this, and it lets tests
 * stub the env vars per case the same way the notification gateways do.
 */
function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

export function isUpstashConfigured(): boolean {
  return getRedisClient() !== null;
}

function failureKey(organizationId: string, action: string, ip: string): string {
  return `polco:rl:${organizationId}:${action}:${ip}`;
}

export interface RecordLookupFailureParams {
  organizationId: string;
  action: string;
  ip: string;
  windowMinutes: number;
}

/**
 * Call this alongside (never instead of) the existing
 * audit({action: '*.lookup_failed', ...}) call in booking/service.ts and
 * ratings/service.ts -- deliberately only increments on a FAILED attempt,
 * not every call, so a legitimate guest retrying after a typo is never
 * penalized for their own eventual success. No-op when Upstash isn't
 * configured; the audit-log write alongside it is what the fallback
 * counter in assertLookupNotRateLimited reads from instead.
 */
export async function recordLookupFailure(params: RecordLookupFailureParams): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  const key = failureKey(params.organizationId, params.action, params.ip);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, params.windowMinutes * 60);
  }
}

export interface LookupRateLimitParams {
  organizationId: string;
  action: string;
  ip: string;
  windowMinutes: number;
  maxAttempts: number;
}

/**
 * Guards a public, no-session lookup (find-booking DR-016/052/053, rating-
 * code lookup DR-037) against automated guessing -- throws
 * Errors.rateLimited once the caller's IP has too many recent FAILED
 * attempts within the window. Real Redis-backed count when Upstash is
 * configured; otherwise falls back to counting audit_logs entries
 * (DR-016's original, infra-free approach) with identical semantics.
 */
export async function assertLookupNotRateLimited(params: LookupRateLimitParams): Promise<void> {
  const { organizationId, action, ip, windowMinutes, maxAttempts } = params;
  const redis = getRedisClient();
  const recentFailures = redis
    ? ((await redis.get<number>(failureKey(organizationId, action, ip))) ?? 0)
    : await countRecentAuditEvents({ organizationId, action, ip, sinceMinutes: windowMinutes });

  if (recentFailures >= maxAttempts) {
    throw Errors.rateLimited('Too many attempts -- try again later');
  }
}

/**
 * better-auth's own sign-in/sign-up rate limiting (closes the STRIDE
 * "Spoofing -> add auth rate-limit/lockout" gap CLAUDE.md has flagged since
 * Phase 1). Returns undefined (better-auth falls back to its own
 * in-memory default) when Upstash isn't configured -- in-memory still works
 * for a single local dev server, just not across Vercel's many serverless
 * instances, which is exactly why this matters once OI-10 is resolved.
 *
 * `consume` is better-auth's preferred, atomic increment+check primitive --
 * it closes the concurrent-bypass gap the plain get/set path has (N
 * simultaneous requests all reading a stale count before any increment
 * lands), per BetterAuthRateLimitStorage's own doc comment. `get`/`set` are
 * still implemented for interface completeness/back-compat, even though
 * better-auth prefers `consume` whenever present.
 */
export function getAuthRateLimitStorage() {
  const redis = getRedisClient();
  if (!redis) return undefined;

  const keyOf = (key: string) => `polco:auth-rl:${key}`;

  return {
    async get(key: string) {
      return (await redis.get<{ key: string; count: number; lastRequest: number }>(keyOf(key))) ?? null;
    },
    async set(key: string, value: { key: string; count: number; lastRequest: number }) {
      await redis.set(keyOf(key), value);
    },
    async consume(key: string, rule: { window: number; max: number }) {
      const redisKey = keyOf(key);
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.expire(redisKey, rule.window);
      }
      if (count > rule.max) {
        const ttl = await redis.ttl(redisKey);
        return { allowed: false, retryAfter: ttl > 0 ? ttl : rule.window };
      }
      return { allowed: true, retryAfter: null };
    },
  };
}
