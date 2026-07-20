import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatPackageReference } from '@modules/catalog';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../src/lib/db';
import { bookingService, generateBookingReference } from '../src/modules/booking';
import { ApiError } from '../src/lib/errors';

/**
 * Public "find my booking" lookup (DR-016, DR-052) -- no ctx/session,
 * bookingReference + tour lead last name instead. Seeds into the real
 * seeded primary org (Lam), same rationale as tests/catalog-public.test.ts.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let bookingId: string;
let bookingReference: string;
let touristId: string;
let departureId: string;
let tourPackageId: string;

beforeAll(async () => {
  const primary = await admin.organization.findFirstOrThrow({ where: { isPrimary: true } });
  orgId = primary.id;

  const tourist = await admin.user.create({
    data: { email: `lookup-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId },
  });
  touristId = tourist.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: `TEST-LOOKUP-${suffix}`,
        description: 'Fixture for booking lookup tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    tourPackageId = pkg.id;
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2027-03-01'), capacity: 5 },
    });
    departureId = departure.id;

    bookingReference = generateBookingReference();
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId: departure.id,
        touristUserId: touristId,
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
        bookingReference,
      },
    });
    bookingId = booking.id;

    await tx.traveler.create({
      data: {
        organizationId: orgId,
        bookingId: booking.id,
        firstName: 'Lookup',
        lastName: 'Fixture',
        age: 30,
        sex: 'X',
        nationality: 'NA',
        idOrPassportNumber: `LOOKUP-${suffix}`,
        isTourLead: true,
      },
    });
  });
});

afterAll(async () => {
  // Guard: if beforeAll failed before these ids were all assigned, Prisma
  // silently drops the undefined where-clause value, turning these into
  // unscoped deleteMany calls -- and since orgId here is the real shared
  // PRIMARY organization (not a throwaway fixture org), that would wipe
  // every traveler/booking/departure/package belonging to it. This has hit
  // real production data twice already. Skip cleanup entirely rather than
  // risk it.
  if (!orgId || !bookingId || !departureId || !tourPackageId || !touristId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.traveler.deleteMany({ where: { bookingId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { id: bookingId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { id: departureId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { id: tourPackageId } }));
  await admin.user.delete({ where: { id: touristId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('bookingService.lookupByBookingReference', () => {
  it('returns the booking + travelers on a correct reference + last name', async () => {
    const result = await bookingService.lookupByBookingReference(
      { bookingReference, lastName: 'Fixture' },
      '203.0.113.10',
    );
    expect(result.booking.id).toBe(bookingId);
    expect(result.travelers).toHaveLength(1);
  });

  it('matches the last name case-insensitively', async () => {
    const result = await bookingService.lookupByBookingReference(
      { bookingReference, lastName: 'fixture' },
      '203.0.113.11',
    );
    expect(result.booking.id).toBe(bookingId);
  });

  it('rejects a correct reference with the wrong last name (no leak of which part was wrong)', async () => {
    await expect(
      bookingService.lookupByBookingReference({ bookingReference, lastName: 'Someone Else' }, '203.0.113.12'),
    ).rejects.toThrow();
  });

  it('rejects a made-up reference', async () => {
    await expect(
      bookingService.lookupByBookingReference({ bookingReference: 'NOTREAL1', lastName: 'Fixture' }, '203.0.113.13'),
    ).rejects.toThrow();
  });

  it('rate-limits repeated failures from the same IP', async () => {
    const ip = '203.0.113.99';
    // Exhaust the limit with wrong-answer attempts...
    for (let i = 0; i < 10; i++) {
      await expect(
        bookingService.lookupByBookingReference({ bookingReference, lastName: 'Wrong' }, ip),
      ).rejects.toThrow();
    }
    // ...then even a CORRECT attempt from that same IP is rejected (429).
    const err = await bookingService
      .lookupByBookingReference({ bookingReference, lastName: 'Fixture' }, ip)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
  }, 40_000); // 11 sequential lookups, each running the 3-statement lifecycle sweep (DR-027); this sandbox's Neon latency can exceed the 20s default
});
