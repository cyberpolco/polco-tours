import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { generateConfirmationCode } from '@modules/booking';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `itinerary_restaurants` join table added in DR-033. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithItineraryRestaurant(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const tourist = await admin.user.create({
    data: { email: `tourist-${Date.now()}-${Math.random()}@example.test`, role: 'TOURIST', organizationId: org.id },
  });
  await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        packageReference: formatPackageReference(Date.now()),
        title: 'Itinerary Restaurant RLS Fixture',
        description: 'Fixture.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: org.id, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), capacity: 2, status: 'SCHEDULED' },
    });
    const booking = await tx.booking.create({
      data: {
        organizationId: org.id,
        departureId: departure.id,
        touristUserId: tourist.id,
        confirmationCode: generateConfirmationCode(),
        bookingReference: generateConfirmationCode(),
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
      },
    });
    const itinerary = await tx.itinerary.create({ data: { organizationId: org.id, bookingId: booking.id } });
    const restaurant = await tx.restaurant.create({ data: { organizationId: org.id, name: 'Fixture Restaurant', country: 'NA' } });
    await tx.itineraryRestaurant.create({ data: { organizationId: org.id, itineraryId: itinerary.id, restaurantId: restaurant.id } });
  });
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithItineraryRestaurant(`RLS-ITINREST-A-${Date.now()}`);
  orgB = await seedOrgWithItineraryRestaurant(`RLS-ITINREST-B-${Date.now()}`);
});

afterAll(async () => {
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.itineraryRestaurant.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.restaurant.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.itinerary.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.booking.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.departure.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: id } }));
    await admin.user.deleteMany({ where: { organizationId: id } });
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: itinerary_restaurants tenant isolation', () => {
  it('org A sees only its own itinerary-restaurant assignment', async () => {
    const rows = await withOrg(orgA, (tx) => tx.itineraryRestaurant.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A itinerary-restaurant assignments', async () => {
    const rows = await withOrg(orgB, (tx) => tx.itineraryRestaurant.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.itineraryRestaurant.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write an itinerary-restaurant assignment into another tenant (WITH CHECK)', async () => {
    const itineraryA = await withOrg(orgA, (tx) => tx.itinerary.findFirstOrThrow({ where: { organizationId: orgA } }));
    const restaurantA = await withOrg(orgA, (tx) => tx.restaurant.findFirstOrThrow({ where: { organizationId: orgA } }));
    await expect(
      withOrg(orgA, (tx) =>
        tx.itineraryRestaurant.create({ data: { organizationId: orgB, itineraryId: itineraryA.id, restaurantId: restaurantA.id } }),
      ),
    ).rejects.toThrow();
  });
});
