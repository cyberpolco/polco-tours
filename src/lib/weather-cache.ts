import { Redis } from '@upstash/redis';

/**
 * Cache for the Weather feature's external API responses (DR-113) -- reuses
 * rate-limit.ts's getRedisClient() construction pattern (fresh client per
 * call, env-gated; @upstash/redis is a stateless REST client so there's no
 * pooling cost to this, and it lets tests stub env vars per case). This is
 * the feature's real abuse/cost protection: it bounds how often the billed
 * Google Weather API actually gets called, regardless of visitor count,
 * rather than per-IP rate-limiting (see weather/service.ts for why).
 *
 * Skips caching entirely (callers fall back to calling the gateway live
 * every time) when Upstash isn't configured -- graceful degrade, not a
 * crash, same fallback precedent as rate-limit.ts's audit-log fallback. In
 * production this is live for real (OI-10, resolved 2026-07-22); CI does
 * not provision Upstash secrets, so CI/e2e always exercise the no-cache
 * path.
 */
function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

export async function getCachedWeather<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  return (await redis.get<T>(key)) ?? null;
}

export async function setCachedWeather<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  await redis.set(key, value, { ex: ttlSeconds });
}
