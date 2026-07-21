import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from '../../src/lib/errors';

/**
 * Mocks @upstash/redis's Redis class so every `new Redis(...)` call (the
 * module under test constructs one fresh per function call, see its own
 * doc comment) returns the SAME shared mock instance -- lets a test assert
 * on `redisMock.incr` etc. regardless of which call created the client.
 */
const redisMock = {
  incr: vi.fn(),
  expire: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  ttl: vi.fn(),
};
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => redisMock),
}));

const countRecentAuditEventsMock = vi.fn();
vi.mock('@lib/audit', () => ({
  countRecentAuditEvents: (...args: unknown[]) => countRecentAuditEventsMock(...args),
}));

// A single static import is enough -- unlike the notification gateways
// (classes constructed once and reused), every function here reads
// process.env fresh on each call (see rate-limit.ts's own doc comment), so
// vi.stubEnv per test is sufficient with no module-reset dance needed.
import {
  isUpstashConfigured,
  assertLookupNotRateLimited,
  recordLookupFailure,
  getAuthRateLimitStorage,
} from '../../src/lib/rate-limit';

describe('rate-limit (DR-066)', () => {
  beforeEach(() => {
    Object.values(redisMock).forEach((fn) => fn.mockReset());
    countRecentAuditEventsMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('graceful degradation when Upstash is unconfigured (OI-10, no account provisioned yet)', () => {
    it('isUpstashConfigured() is false', async () => {
      expect(isUpstashConfigured()).toBe(false);
    });

    it('assertLookupNotRateLimited falls back to countRecentAuditEvents', async () => {
      countRecentAuditEventsMock.mockResolvedValue(3);

      await assertLookupNotRateLimited({
        organizationId: 'org-1',
        action: 'booking.lookup_failed',
        ip: '1.2.3.4',
        windowMinutes: 15,
        maxAttempts: 10,
      });

      expect(countRecentAuditEventsMock).toHaveBeenCalledWith({
        organizationId: 'org-1',
        action: 'booking.lookup_failed',
        ip: '1.2.3.4',
        sinceMinutes: 15,
      });
      expect(redisMock.get).not.toHaveBeenCalled();
    });

    it('assertLookupNotRateLimited throws once the audit-log count meets the threshold', async () => {
      countRecentAuditEventsMock.mockResolvedValue(10);

      await expect(
        assertLookupNotRateLimited({
          organizationId: 'org-1',
          action: 'booking.lookup_failed',
          ip: '1.2.3.4',
          windowMinutes: 15,
          maxAttempts: 10,
        }),
      ).rejects.toBeInstanceOf(ApiError);
    });

    it('recordLookupFailure is a no-op, never touching Redis', async () => {
      await recordLookupFailure({
        organizationId: 'org-1',
        action: 'booking.lookup_failed',
        ip: '1.2.3.4',
        windowMinutes: 15,
      });
      expect(redisMock.incr).not.toHaveBeenCalled();
    });

    it('getAuthRateLimitStorage() returns undefined', async () => {
      expect(getAuthRateLimitStorage()).toBeUndefined();
    });
  });

  describe('real Redis-backed behavior once UPSTASH_REDIS_REST_URL/TOKEN are set', () => {
    beforeEach(() => {
      vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
    });

    it('isUpstashConfigured() is true', async () => {
      expect(isUpstashConfigured()).toBe(true);
    });

    it('recordLookupFailure increments and sets an expiry only on the first write', async () => {
      redisMock.incr.mockResolvedValue(1);

      await recordLookupFailure({
        organizationId: 'org-1',
        action: 'booking.lookup_failed',
        ip: '1.2.3.4',
        windowMinutes: 15,
      });

      expect(redisMock.incr).toHaveBeenCalledWith('polco:rl:org-1:booking.lookup_failed:1.2.3.4');
      expect(redisMock.expire).toHaveBeenCalledWith('polco:rl:org-1:booking.lookup_failed:1.2.3.4', 15 * 60);
    });

    it('recordLookupFailure does not re-set the expiry on a later increment', async () => {
      redisMock.incr.mockResolvedValue(4);

      await recordLookupFailure({
        organizationId: 'org-1',
        action: 'booking.lookup_failed',
        ip: '1.2.3.4',
        windowMinutes: 15,
      });

      expect(redisMock.expire).not.toHaveBeenCalled();
    });

    it('assertLookupNotRateLimited reads the real count from Redis, not the audit log', async () => {
      redisMock.get.mockResolvedValue(2);

      await assertLookupNotRateLimited({
        organizationId: 'org-1',
        action: 'booking.lookup_failed',
        ip: '1.2.3.4',
        windowMinutes: 15,
        maxAttempts: 10,
      });

      expect(redisMock.get).toHaveBeenCalledWith('polco:rl:org-1:booking.lookup_failed:1.2.3.4');
      expect(countRecentAuditEventsMock).not.toHaveBeenCalled();
    });

    it('assertLookupNotRateLimited throws once the Redis count meets the threshold', async () => {
      redisMock.get.mockResolvedValue(10);

      await expect(
        assertLookupNotRateLimited({
          organizationId: 'org-1',
          action: 'booking.lookup_failed',
          ip: '1.2.3.4',
          windowMinutes: 15,
          maxAttempts: 10,
        }),
      ).rejects.toBeInstanceOf(ApiError);
    });

    it('assertLookupNotRateLimited treats a missing key as zero prior failures', async () => {
      redisMock.get.mockResolvedValue(null);

      await expect(
        assertLookupNotRateLimited({
          organizationId: 'org-1',
          action: 'booking.lookup_failed',
          ip: '1.2.3.4',
          windowMinutes: 15,
          maxAttempts: 10,
        }),
      ).resolves.toBeUndefined();
    });

    describe('getAuthRateLimitStorage()', () => {
      it('consume() allows a request under the limit without setting a new expiry', async () => {
        redisMock.incr.mockResolvedValue(3);
        const storage = getAuthRateLimitStorage();

        const result = await storage!.consume('sign-in:1.2.3.4', { window: 60, max: 5 });

        expect(result).toEqual({ allowed: true, retryAfter: null });
        expect(redisMock.expire).not.toHaveBeenCalled();
      });

      it('consume() sets the expiry on the first request in a window', async () => {
        redisMock.incr.mockResolvedValue(1);
        const storage = getAuthRateLimitStorage();

        await storage!.consume('sign-in:1.2.3.4', { window: 60, max: 5 });

        expect(redisMock.expire).toHaveBeenCalledWith('polco:auth-rl:sign-in:1.2.3.4', 60);
      });

      it('consume() disallows once over the limit, reporting the real remaining TTL', async () => {
        redisMock.incr.mockResolvedValue(6);
        redisMock.ttl.mockResolvedValue(42);
        const storage = getAuthRateLimitStorage();

        const result = await storage!.consume('sign-in:1.2.3.4', { window: 60, max: 5 });

        expect(result).toEqual({ allowed: false, retryAfter: 42 });
      });

      it('get()/set() round-trip through the shared Redis mock', async () => {
        const storage = getAuthRateLimitStorage();
        const value = { key: 'sign-in:1.2.3.4', count: 2, lastRequest: 123 };
        redisMock.get.mockResolvedValue(value);

        await storage!.set('sign-in:1.2.3.4', value);
        const got = await storage!.get('sign-in:1.2.3.4');

        expect(redisMock.set).toHaveBeenCalledWith('polco:auth-rl:sign-in:1.2.3.4', value);
        expect(got).toEqual(value);
      });
    });
  });
});
