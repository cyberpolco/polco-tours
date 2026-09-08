import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '../src/modules/auth';
import type { DashboardSummary } from '../src/modules/insights/domain';

/**
 * insightsService's business logic was exercised only via insights.api.test.ts/
 * insights.security.test.ts (route-level, real DB, one big fixture) --
 * never a direct service-layer test (found by an architecture audit).
 * getDashboardSummary's Redis caching wrapper (DR-155) is the one piece of
 * its own logic genuinely untestable that way: this sandbox's CI has no
 * Upstash Redis configured at all (getCached/setCached always no-op, see
 * @lib/cache's own comment), so the cache-hit short-circuit never actually
 * engages during a real API-level test run either -- it has never been
 * exercised anywhere. Mocking `@lib/cache` directly (not the underlying
 * Redis client) lets this test prove the contract without needing real
 * Redis or the heavy 9-module fixture computeDashboardSummary composes --
 * a cache hit must return the cached value verbatim and skip computation
 * entirely, which no other test in this suite can currently prove.
 */
const { getCachedMock, setCachedMock } = vi.hoisted(() => ({
  getCachedMock: vi.fn(),
  setCachedMock: vi.fn(),
}));
vi.mock('@lib/cache', () => ({ getCached: getCachedMock, setCached: setCachedMock }));

const { insightsService } = await import('../src/modules/insights');

function ctxWith(roles: AuthContext['roles'], organizationId: string): AuthContext {
  return {
    userId: 'staff-1',
    roles,
    permissions: new Set() as AuthContext['permissions'],
    organizationId,
    sessionId: 'session-1',
    mustChangePassword: false,
  };
}

const FAKE_SUMMARY = { bookings: {}, revenue: {}, operations: {} } as unknown as DashboardSummary;

beforeEach(() => {
  getCachedMock.mockReset();
  setCachedMock.mockReset();
});

describe('insightsService.getDashboardSummary caching (DR-155)', () => {
  it('a cache hit returns the cached summary verbatim and never writes back', async () => {
    getCachedMock.mockResolvedValueOnce(FAKE_SUMMARY);
    const result = await insightsService.getDashboardSummary(ctxWith(['SUPERADMIN'], 'org-a'));
    expect(result).toBe(FAKE_SUMMARY);
    expect(setCachedMock).not.toHaveBeenCalled();
  });

  it('the cache key is scoped per-organization -- two orgs never collide on the same entry', async () => {
    getCachedMock.mockResolvedValueOnce(FAKE_SUMMARY);
    await insightsService.getDashboardSummary(ctxWith(['SUPERADMIN'], 'org-a'), { from: null, to: null });
    const keyA = getCachedMock.mock.calls[0]![0] as string;
    expect(keyA).toContain('org-a');

    getCachedMock.mockResolvedValueOnce(FAKE_SUMMARY);
    await insightsService.getDashboardSummary(ctxWith(['SUPERADMIN'], 'org-b'), { from: null, to: null });
    const keyB = getCachedMock.mock.calls[1]![0] as string;
    expect(keyB).toContain('org-b');
    expect(keyA).not.toBe(keyB);
  });

  it('a role outside isInsightsViewer is rejected before the cache is ever consulted', async () => {
    await expect(insightsService.getDashboardSummary(ctxWith(['TOUR_GUIDE'], 'org-a'))).rejects.toThrow();
    expect(getCachedMock).not.toHaveBeenCalled();
  });
});
