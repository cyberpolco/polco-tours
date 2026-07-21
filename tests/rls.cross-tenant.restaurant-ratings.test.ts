import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/** RLS proof for `restaurant_ratings` -- mirrors hotel_ratings exactly. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithRestaurantRating(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const rater = await admin.user.create({
    data: { email: `rater-${Date.now()}-${Math.random()}@example.test`, role: 'TOUR_GUIDE', organizationId: org.id },
  });
  await withOrg(org.id, async (tx) => {
    const restaurant = await tx.restaurant.create({ data: { organizationId: org.id, name: 'Fixture Grill', country: 'NA' } });
    await tx.restaurantRating.create({
      data: { organizationId: org.id, restaurantId: restaurant.id, raterUserId: rater.id, rating: 4 },
    });
  });
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithRestaurantRating(`RLS-RESTRATING-A-${Date.now()}`);
  orgB = await seedOrgWithRestaurantRating(`RLS-RESTRATING-B-${Date.now()}`);
});

afterAll(async () => {
  if (!orgA || !orgB) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.restaurantRating.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.restaurant.deleteMany({ where: { organizationId: id } }));
    await admin.user.deleteMany({ where: { organizationId: id } });
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: restaurant_ratings tenant isolation', () => {
  it('org A sees only its own restaurant rating', async () => {
    const rows = await withOrg(orgA, (tx) => tx.restaurantRating.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A restaurant ratings', async () => {
    const rows = await withOrg(orgB, (tx) => tx.restaurantRating.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.restaurantRating.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a restaurant rating into another tenant (WITH CHECK)', async () => {
    const restaurantA = await withOrg(orgA, (tx) => tx.restaurant.findFirstOrThrow({ where: { organizationId: orgA } }));
    const raterA = await withOrg(orgA, (tx) => tx.restaurantRating.findFirstOrThrow({ where: { organizationId: orgA } }));
    await expect(
      withOrg(orgA, (tx) =>
        tx.restaurantRating.create({
          data: { organizationId: orgB, restaurantId: restaurantA.id, raterUserId: raterA.raterUserId, rating: 3 },
        }),
      ),
    ).rejects.toThrow();
  });
});
