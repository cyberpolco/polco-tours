import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatPackageReference } from '@modules/catalog';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';
import { generateBookingReference } from '../src/modules/booking';

/** Extends the RLS proof to the `booking_addons` table added in DR-015
 * (priced add-on selections, snapshotted from addon_services). */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithBookingAddon(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const tourist = await admin.user.create({
    data: { email: `${name.toLowerCase()}@example.test`, role: 'TOURIST', organizationId: org.id },
  });
  await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        packageReference: formatPackageReference(Date.now()),
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
    const addonService = await tx.addonService.create({
      data: {
        organizationId: org.id,
        code: 'TRANSLATOR',
        name: 'Translator',
        description: 'Fixture add-on.',
        priceMinor: 3000,
        currency: 'USD',
      },
    });
    await tx.bookingAddon.create({
      data: { organizationId: org.id, bookingId: booking.id, addonServiceId: addonService.id, priceMinor: 3000, currency: 'USD' },
    });
  });
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithBookingAddon(`RLS-BA-A-${Date.now()}`);
  orgB = await seedOrgWithBookingAddon(`RLS-BA-B-${Date.now()}`);
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
    await withOrg(id, (tx) => tx.bookingAddon.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.addonService.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.booking.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.departure.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: id } }));
  }
  await admin.user.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: booking_addons tenant isolation', () => {
  it('org A sees only its own booking add-ons', async () => {
    const rows = await withOrg(orgA, (tx) => tx.bookingAddon.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A booking add-ons', async () => {
    const rows = await withOrg(orgB, (tx) => tx.bookingAddon.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.bookingAddon.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a booking add-on into another tenant (WITH CHECK)', async () => {
    const [orgABooking, orgAAddon] = await Promise.all([
      withOrg(orgA, (tx) => tx.booking.findFirstOrThrow()),
      withOrg(orgA, (tx) => tx.addonService.findFirstOrThrow()),
    ]);
    await expect(
      withOrg(orgB, (tx) =>
        tx.bookingAddon.create({
          data: {
            organizationId: orgA,
            bookingId: orgABooking.id,
            addonServiceId: orgAAddon.id,
            priceMinor: 100,
            currency: 'USD',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
