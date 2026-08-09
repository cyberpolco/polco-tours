import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { generateBookingReference } from '@modules/booking';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `booking_cost_line_items` table added in DR-092. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithLineItem(name: string): Promise<{ orgId: string; breakdownId: string }> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const tourist = await admin.user.create({ data: { email: `${name.toLowerCase()}@example.test`, role: 'TOURIST', organizationId: org.id } });
  let breakdownId = '';
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
    const breakdown = await tx.bookingCostBreakdown.create({
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
    breakdownId = breakdown.id;
    const foodRate = await admin.foodBeverageRate.create({
      data: { country: 'NA', category: 'WATER', perUnitMinor: 200, currency: 'USD' },
    });
    await tx.bookingCostLineItem.create({
      data: {
        organizationId: org.id,
        bookingCostBreakdownId: breakdown.id,
        foodBeverageRateId: foodRate.id,
        quantityPerPerson: 2,
      },
    });
  });
  return { orgId: org.id, breakdownId };
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    seedOrgWithLineItem(`RLS-BCLI-A-${Date.now()}`),
    seedOrgWithLineItem(`RLS-BCLI-B-${Date.now()}`),
  ]);
  orgA = a.orgId;
  orgB = b.orgId;
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
    await withOrg(id, (tx) => tx.bookingCostLineItem.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.bookingCostBreakdown.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.booking.deleteMany({ where: { organizationId: id } }));
  }
  await admin.foodBeverageRate.deleteMany({ where: { country: 'NA', category: 'WATER', perUnitMinor: 200 } });
  await admin.user.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: booking_cost_line_items tenant isolation', () => {
  it('org A sees only its own line item', async () => {
    const rows = await withOrg(orgA, (tx) => tx.bookingCostLineItem.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A line item', async () => {
    const rows = await withOrg(orgB, (tx) => tx.bookingCostLineItem.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.bookingCostLineItem.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a line item into another tenant (WITH CHECK)', async () => {
    const breakdownInOrgA = await withOrg(orgA, (tx) => tx.bookingCostBreakdown.findFirstOrThrow());
    await expect(
      withOrg(orgA, (tx) =>
        tx.bookingCostLineItem.create({
          data: {
            organizationId: orgB,
            bookingCostBreakdownId: breakdownInOrgA.id,
            quantityPerPerson: 1,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
