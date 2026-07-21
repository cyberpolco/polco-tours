import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/** RLS proof for `hotel_ratings` (DR-060 follow-up: staff-only hotel/restaurant rating). */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithHotelRating(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const rater = await admin.user.create({
    data: { email: `rater-${Date.now()}-${Math.random()}@example.test`, role: 'TOUR_GUIDE', organizationId: org.id },
  });
  await withOrg(org.id, async (tx) => {
    const hotel = await tx.hotel.create({ data: { organizationId: org.id, name: 'Fixture Hotel', country: 'NA' } });
    await tx.hotelRating.create({ data: { organizationId: org.id, hotelId: hotel.id, raterUserId: rater.id, rating: 4 } });
  });
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithHotelRating(`RLS-HOTELRATING-A-${Date.now()}`);
  orgB = await seedOrgWithHotelRating(`RLS-HOTELRATING-B-${Date.now()}`);
});

afterAll(async () => {
  if (!orgA || !orgB) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.hotelRating.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.hotel.deleteMany({ where: { organizationId: id } }));
    await admin.user.deleteMany({ where: { organizationId: id } });
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: hotel_ratings tenant isolation', () => {
  it('org A sees only its own hotel rating', async () => {
    const rows = await withOrg(orgA, (tx) => tx.hotelRating.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A hotel ratings', async () => {
    const rows = await withOrg(orgB, (tx) => tx.hotelRating.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.hotelRating.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a hotel rating into another tenant (WITH CHECK)', async () => {
    const hotelA = await withOrg(orgA, (tx) => tx.hotel.findFirstOrThrow({ where: { organizationId: orgA } }));
    const raterA = await withOrg(orgA, (tx) => tx.hotelRating.findFirstOrThrow({ where: { organizationId: orgA } }));
    await expect(
      withOrg(orgA, (tx) =>
        tx.hotelRating.create({
          data: { organizationId: orgB, hotelId: hotelA.id, raterUserId: raterA.raterUserId, rating: 3 },
        }),
      ),
    ).rejects.toThrow();
  });
});
