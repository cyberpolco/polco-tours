import { getRedisClient } from './rate-limit';

/**
 * Generic short-TTL JSON cache (DR-155), reusing rate-limit.ts's Upstash
 * Redis client rather than opening a second one -- @upstash/redis is a
 * stateless REST client, so sharing it costs nothing. Not insights-specific
 * despite its first caller: any read-heavy, poll-driven endpoint that can
 * tolerate a few seconds of staleness can reuse this.
 *
 * Graceful degradation, same posture as every other Upstash-gated helper in
 * this codebase: unconfigured, getCached always misses and setCached is a
 * no-op -- callers always recompute fresh instead of failing.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  return (await redis.get<T>(key)) ?? null;
}

export async function setCached<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  await redis.set(key, value, { ex: ttlSeconds });
}
