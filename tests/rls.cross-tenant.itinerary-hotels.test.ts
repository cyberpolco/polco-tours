import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { generateConfirmationCode } from '@modules/booking';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `itinerary_hotels` join table added in DR-033. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithItineraryHotel(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const tourist = await admin.user.create({
    data: { email: `tourist-${Date.now()}-${Math.random()}@example.test`, role: 'TOURIST', organizationId: org.id },
  });
  await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        packageReference: formatPackageReference(Date.now()),
        title: 'Itinerary Hotel RLS Fixture',
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
    const hotel = await tx.hotel.create({ data: { organizationId: org.id, name: 'Fixture Hotel', country: 'NA' } });
    await tx.itineraryHotel.create({ data: { organizationId: org.id, itineraryId: itinerary.id, hotelId: hotel.id } });
  });
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithItineraryHotel(`RLS-ITINHOTEL-A-${Date.now()}`);
  orgB = await seedOrgWithItineraryHotel(`RLS-ITINHOTEL-B-${Date.now()}`);
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgA/orgB were assigned, Prisma silently
  // drops the undefined where-clause value, turning this into an unscoped
  // deleteMany that wipes the whole table -- this has hit real production
  // data twice. Skip cleanup entirely rather than risk it.
  if (!orgA || !orgB) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.itineraryHotel.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.hotel.deleteMany({ where: { organizationId: id } }));
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

describe('Row-Level Security: itinerary_hotels tenant isolation', () => {
  it('org A sees only its own itinerary-hotel assignment', async () => {
    const rows = await withOrg(orgA, (tx) => tx.itineraryHotel.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A itinerary-hotel assignments', async () => {
    const rows = await withOrg(orgB, (tx) => tx.itineraryHotel.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.itineraryHotel.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write an itinerary-hotel assignment into another tenant (WITH CHECK)', async () => {
    const itineraryA = await withOrg(orgA, (tx) => tx.itinerary.findFirstOrThrow({ where: { organizationId: orgA } }));
    const hotelA = await withOrg(orgA, (tx) => tx.hotel.findFirstOrThrow({ where: { organizationId: orgA } }));
    await expect(
      withOrg(orgA, (tx) =>
        tx.itineraryHotel.create({ data: { organizationId: orgB, itineraryId: itineraryA.id, hotelId: hotelA.id } }),
      ),
    ).rejects.toThrow();
  });
});
