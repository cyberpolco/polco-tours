import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { generateConfirmationCode } from '@modules/booking';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `itineraries` table added in DR-033. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithItinerary(name: string): Promise<{ orgId: string; bookingId: string; touristId: string }> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const tourist = await admin.user.create({
    data: { email: `tourist-${Date.now()}-${Math.random()}@example.test`, role: 'TOURIST', organizationId: org.id },
  });
  const bookingId = await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        packageReference: formatPackageReference(Date.now()),
        title: 'Itinerary RLS Fixture',
        description: 'Fixture for itinerary RLS tests.',
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
    await tx.itinerary.create({ data: { organizationId: org.id, bookingId: booking.id } });
    return booking.id;
  });
  return { orgId: org.id, bookingId, touristId: tourist.id };
}

beforeAll(async () => {
  const a = await seedOrgWithItinerary(`RLS-ITINERARY-A-${Date.now()}`);
  orgA = a.orgId;

  const b = await seedOrgWithItinerary(`RLS-ITINERARY-B-${Date.now()}`);
  orgB = b.orgId;
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgA/orgB were assigned, Prisma silently
  // drops the undefined where-clause value, turning cleanup into an unscoped
  // deleteMany that wipes the whole table -- this has hit real production
  // data twice. Skip cleanup entirely rather than risk it.
  if (!orgA || !orgB) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  for (const id of [orgA, orgB]) {
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

describe('Row-Level Security: itineraries tenant isolation', () => {
  it('org A sees only its own itinerary', async () => {
    const rows = await withOrg(orgA, (tx) => tx.itinerary.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A itineraries', async () => {
    const rows = await withOrg(orgB, (tx) => tx.itinerary.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.itinerary.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write an itinerary into another tenant (WITH CHECK)', async () => {
    // A fresh, itinerary-less booking (bookingAId already has one from
    // beforeAll -- reusing it would 400 on the bookingId @unique constraint,
    // not the RLS check this test targets).
    const freshBookingId = await withOrg(orgA, async (tx) => {
      const pkg = await tx.tourPackage.findFirstOrThrow({ where: { organizationId: orgA } });
      const departure = await tx.departure.findFirstOrThrow({ where: { organizationId: orgA } });
      const tourist = await admin.user.findFirstOrThrow({ where: { organizationId: orgA, role: 'TOURIST' } });
      const booking = await tx.booking.create({
        data: {
          organizationId: orgA,
          departureId: departure.id,
          touristUserId: tourist.id,
          confirmationCode: generateConfirmationCode(),
          bookingReference: generateConfirmationCode(),
          seats: 1,
          priceMinor: pkg.priceMinor,
          currency: pkg.currency,
        },
      });
      return booking.id;
    });

    // organizationId mismatches the session's app.org_id (set to orgA via
    // withOrg) -- RLS's WITH CHECK on itineraries' own organizationId column
    // blocks this regardless of the FK'd booking being a valid orgA row.
    await expect(
      withOrg(orgA, (tx) => tx.itinerary.create({ data: { organizationId: orgB, bookingId: freshBookingId } })),
    ).rejects.toThrow();
  });
});
