import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { generateBookingReference } from '@modules/booking';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `booking_cost_breakdowns` table added in DR-092. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithBreakdown(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const tourist = await admin.user.create({ data: { email: `${name.toLowerCase()}@example.test`, role: 'TOURIST', organizationId: org.id } });
  await withOrg(org.id, async (tx) => {
    const booking = await tx.booking.create({
      data: {
        organizationId: org.id,
        origin: 'TAILOR_MADE',
        touristUserId: tourist.id,
        bookingReference: generateBookingReference(),
        seats: 2,
        customCountry: 'NA',
        status: 'AWAITING_QUOTATION',
      },
    });
    await tx.bookingCostBreakdown.create({
      data: {
        organizationId: org.id,
        bookingId: booking.id,
        currency: 'USD',
        nights: 1,
        driverDays: 0,
        guideDays: 0,
        agencyMarginBp: 0,
      },
    });
  });
  return org.id;
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    seedOrgWithBreakdown(`RLS-BCB-A-${Date.now()}`),
    seedOrgWithBreakdown(`RLS-BCB-B-${Date.now()}`),
  ]);
  orgA = a;
  orgB = b;
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgA/orgB were assigned, Prisma
  // silently drops the undefined where-clause value, turning cleanup into
  // an unscoped deleteMany that wipes the whole table -- this has hit real
  // production data twice. Skip cleanup entirely rather than risk it.
  if (!orgA || !orgB) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.bookingCostBreakdown.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.booking.deleteMany({ where: { organizationId: id } }));
  }
  await admin.user.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: booking_cost_breakdowns tenant isolation', () => {
  it('org A sees only its own cost breakdown', async () => {
    const rows = await withOrg(orgA, (tx) => tx.bookingCostBreakdown.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A cost breakdown', async () => {
    const rows = await withOrg(orgB, (tx) => tx.bookingCostBreakdown.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.bookingCostBreakdown.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a cost breakdown into another tenant (WITH CHECK)', async () => {
    const bookingInOrgA = await withOrg(orgA, (tx) => tx.booking.findFirstOrThrow());
    await expect(
      withOrg(orgA, (tx) =>
        tx.bookingCostBreakdown.create({
          data: {
            organizationId: orgB,
            bookingId: bookingInOrgA.id,
            currency: 'USD',
            nights: 1,
            driverDays: 0,
            guideDays: 0,
            agencyMarginBp: 0,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
