import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../src/lib/db';
import { purgeStaleTestOrganizations } from '../src/lib/test-org-purge';

/**
 * DR-235: unlike authRepository.markDormantUsers (deliberately NOT
 * integration-tested against the shared DB, see tests/auth-dormancy.test.ts's
 * trailing comment -- that sweep has no scoping at all), this function is
 * safe to actually run for real here: it only ever touches a non-primary
 * org whose name matches the exact synthetic test-fixture naming
 * convention (`SEGMENT-...-<13-digit-timestamp>`) AND is over an hour old.
 * A real operator's org can never accidentally match both conditions.
 */
const admin = new PrismaClient();
const staleTestOrgId: { current?: string } = {};
const freshTestOrgId: { current?: string } = {};
const realLookingOrgId: { current?: string } = {};

afterAll(async () => {
  // staleTestOrgId is expected to already be gone (purged by the function
  // under test) -- .catch(() => {}) so a leftover row (e.g. the purge
  // itself failed) doesn't fail teardown.
  for (const ref of [staleTestOrgId, freshTestOrgId, realLookingOrgId]) {
    if (ref.current) await admin.organization.delete({ where: { id: ref.current } }).catch(() => {});
  }
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('purgeStaleTestOrganizations', () => {
  it('deletes a stale test-fixture org, but leaves a fresh one and a real-looking one alone', async () => {
    const suffix = Date.now();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const [stale, fresh, realLooking] = await Promise.all([
      admin.organization.create({
        data: { name: `ORGPURGE-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED', createdAt: twoHoursAgo },
      }),
      admin.organization.create({
        data: { name: `ORGPURGE-TEST-FRESH-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
      }),
      admin.organization.create({
        data: { name: 'Acme Tours Namibia', countries: ['NA'], status: 'VERIFIED', createdAt: twoHoursAgo },
      }),
    ]);
    staleTestOrgId.current = stale.id;
    freshTestOrgId.current = fresh.id;
    realLookingOrgId.current = realLooking.id;

    const result = await purgeStaleTestOrganizations();

    expect(result.failedIds).not.toContain(stale.id);
    expect(await admin.organization.findUnique({ where: { id: stale.id } })).toBeNull();
    expect(await admin.organization.findUnique({ where: { id: fresh.id } })).not.toBeNull();
    expect(await admin.organization.findUnique({ where: { id: realLooking.id } })).not.toBeNull();
  });

  it('never touches the primary organization even if it were somehow old and misnamed', async () => {
    const primary = await prisma.organization.findFirst({ where: { isPrimary: true } });
    expect(primary).not.toBeNull();

    await purgeStaleTestOrganizations();

    expect(await prisma.organization.findUnique({ where: { id: primary!.id } })).not.toBeNull();
  });
});
