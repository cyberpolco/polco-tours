import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { generateBookingReference } from '@modules/booking';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `itinerary_day_sites` table added in DR-088
 * (replaces the old free-text ItineraryDay.plannedSites). Same shape as
 * tests/rls.cross-tenant.itinerary-days.test.ts. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithDaySite(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const tourist = await admin.user.create({
    data: { email: `tourist-${Date.now()}-${Math.random()}@example.test`, role: 'TOURIST', organizationId: org.id },
  });
  let bookingId: string;
  await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        packageReference: formatPackageReference(Date.now()),
        title: 'Itinerary Day Site RLS Fixture',
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
        bookingReference: generateBookingReference(),
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
      },
    });
    bookingId = booking.id;
  });

  // Split into a second withOrg call -- Prisma's 5000ms interactive-
  // transaction timeout is measurably too short for this sandbox's real
  // network path to Neon once a beforeAll does this much sequential work in
  // one transaction (documented gotcha, CLAUDE.md; same fix as
  // tests/api/itinerary.security.test.ts).
  await withOrg(org.id, async (tx) => {
    const itinerary = await tx.itinerary.create({ data: { organizationId: org.id, bookingId } });
    const day = await tx.itineraryDay.create({
      data: { organizationId: org.id, itineraryId: itinerary.id, dayNumber: 1, date: new Date('2026-09-01') },
    });
    const site = await tx.site.create({
      data: { organizationId: org.id, name: `Fixture Site ${Date.now()}`, country: 'NA', province: 'Khomas' },
    });
    await tx.itineraryDaySite.create({ data: { organizationId: org.id, itineraryDayId: day.id, siteId: site.id, sequence: 1 } });
  });
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithDaySite(`RLS-ITINDAYSITE-A-${Date.now()}`);
  orgB = await seedOrgWithDaySite(`RLS-ITINDAYSITE-B-${Date.now()}`);
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
    await withOrg(id, (tx) => tx.itineraryDaySite.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.site.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.itineraryDay.deleteMany({ where: { organizationId: id } }));
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

describe('Row-Level Security: itinerary_day_sites tenant isolation', () => {
  it('org A sees only its own itinerary day site', async () => {
    const rows = await withOrg(orgA, (tx) => tx.itineraryDaySite.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A itinerary day sites', async () => {
    const rows = await withOrg(orgB, (tx) => tx.itineraryDaySite.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.itineraryDaySite.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write an itinerary day site into another tenant (WITH CHECK)', async () => {
    const dayA = await withOrg(orgA, (tx) => tx.itineraryDay.findFirstOrThrow({ where: { organizationId: orgA } }));
    const siteA = await withOrg(orgA, (tx) => tx.site.findFirstOrThrow({ where: { organizationId: orgA } }));
    await expect(
      withOrg(orgA, (tx) =>
        tx.itineraryDaySite.create({
          data: { organizationId: orgB, itineraryDayId: dayA.id, siteId: siteA.id, sequence: 2 },
        }),
      ),
    ).rejects.toThrow();
  });
});
