import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';
import { generateConfirmationCode } from '../src/modules/booking';

/**
 * Extends the Phase 0 RLS proof to the `bookings` table added in Phase 1
 * Increment 1. Same contract: a query scoped to one org can never see another
 * org's rows, and deny-by-default holds with no scope set. This does NOT
 * cover tourist-vs-tourist ownership within the same org -- RLS only
 * isolates by organizationId; that anti-BOLA check lives in
 * booking/service.ts and is covered by tests/api/bookings.security.test.ts.
 */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithBooking(name: string): Promise<string> {
  const org = await admin.organization.create({
    data: { name, countries: ['NA'], status: 'VERIFIED' },
  });
  const tourist = await admin.user.create({
    data: { email: `${name.toLowerCase()}@example.test`, role: 'TOURIST', organizationId: org.id },
  });
  await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        title: `${name} Safari`,
        description: 'Cross-tenant RLS fixture package.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: org.id, tourPackageId: pkg.id, startDate: new Date('2026-08-01'), capacity: 10 },
    });
    await tx.booking.create({
      data: {
        organizationId: org.id,
        departureId: departure.id,
        touristUserId: tourist.id,
        confirmationCode: generateConfirmationCode(),
        seats: 2,
        priceMinor: 20000,
        currency: 'USD',
      },
    });
  });
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithBooking(`RLS-BK-A-${Date.now()}`);
  orgB = await seedOrgWithBooking(`RLS-BK-B-${Date.now()}`);
});

afterAll(async () => {
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.booking.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.departure.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: id } }));
  }
  await admin.user.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: bookings tenant isolation', () => {
  it('org A sees only its own bookings', async () => {
    const rows = await withOrg(orgA, (tx) => tx.booking.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A bookings', async () => {
    const rows = await withOrg(orgB, (tx) => tx.booking.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.booking.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a booking into another tenant (WITH CHECK)', async () => {
    const [orgADeparture, orgATourist] = await Promise.all([
      withOrg(orgA, (tx) => tx.departure.findFirstOrThrow()),
      admin.user.findFirstOrThrow({ where: { organizationId: orgA } }),
    ]);
    await expect(
      withOrg(orgB, (tx) =>
        tx.booking.create({
          data: {
            organizationId: orgA,
            departureId: orgADeparture.id,
            touristUserId: orgATourist.id,
            confirmationCode: generateConfirmationCode(),
            seats: 1,
            priceMinor: 100,
            currency: 'USD',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
