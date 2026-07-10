import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above top-level const declarations, so the
// mock fn itself must be created via vi.hoisted() to be safely referenced
// from inside them (same pattern as tests/staff-guard.test.ts). Mocking
// @lib/db instead of touching the real seeded primary org (Lam) -- that row
// is shared by the whole app/test suite and toggling its isPrimary flag,
// even temporarily, is too risky to do against a real database.
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock('@lib/db', () => ({
  prisma: { organization: { findFirst } },
}));

import { getPrimaryOrgId } from '../src/lib/primary-org';

describe('getPrimaryOrgId', () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it('resolves the primary organization id when one exists', async () => {
    findFirst.mockResolvedValue({ id: 'org-primary' });
    await expect(getPrimaryOrgId()).resolves.toBe('org-primary');
    expect(findFirst).toHaveBeenCalledWith({ where: { isPrimary: true } });
  });

  it('throws when no primary organization is configured', async () => {
    findFirst.mockResolvedValue(null);
    await expect(getPrimaryOrgId()).rejects.toThrow('No primary organization configured');
  });
});
