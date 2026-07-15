import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatPackageReference } from '@modules/catalog';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/**
 * PHASE 0 EXIT CRITERION — Row-Level Security proven by a cross-tenant test.
 *
 * Two organizations each own a tour package. We assert that a query scoped to
 * one org (via `withOrg`, which sets `app.org_id`) can never see the other
 * org's rows, and that with no scope set the deny-by-default policy returns
 * nothing. This exercises the real policies in prisma/rls.sql against a real
 * Postgres — not a mock.
 *
 * Requires: DATABASE_URL pointing at a DB where `npm run db:setup` has run
 * (schema pushed + RLS applied). CI provisions a postgres service for this.
 */
const admin = new PrismaClient(); // used only for setup/teardown (still RLS-forced)

let orgA: string;
let orgB: string;

async function seedOrg(name: string): Promise<string> {
  const org = await admin.organization.create({
    data: { name, countries: ['NA'], status: 'VERIFIED' },
  });
  // Insert the tenant's package within that tenant's scope (WITH CHECK passes).
  await withOrg(org.id, (tx) =>
    tx.tourPackage.create({
      data: {
        organizationId: org.id,
        packageReference: formatPackageReference(Date.now()),
        title: `${name} Safari`,
        description: 'Cross-tenant RLS fixture package.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
      },
    }),
  );
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrg(`RLS-A-${Date.now()}`);
  orgB = await seedOrg(`RLS-B-${Date.now()}`);
});

afterAll(async () => {
  // Cleanup must also be tenant-scoped because RLS is FORCED.
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: id } }));
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: tenant isolation', () => {
  it('org A sees only its own packages', async () => {
    const rows = await withOrg(orgA, (tx) => tx.tourPackage.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A packages', async () => {
    const rows = await withOrg(orgB, (tx) =>
      tx.tourPackage.findMany({ where: { organizationId: orgA } }),
    );
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    // Query outside withOrg -> app.org_id unset -> policy fails closed.
    const rows = await prisma.tourPackage.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a package into another tenant (WITH CHECK)', async () => {
    await expect(
      withOrg(orgB, (tx) =>
        tx.tourPackage.create({
          data: {
            organizationId: orgA,
        packageReference: formatPackageReference(Date.now()),
            title: 'smuggled',
            description: 'n/a',
            country: 'NA',
            priceMinor: 100,
            currency: 'USD',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
