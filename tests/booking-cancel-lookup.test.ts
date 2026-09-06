import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPackageReference } from './helpers/package-reference';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../src/lib/db';
import { bookingService, generateBookingReference } from '../src/modules/booking';

/**
 * DR-207: guest self-service cancellation via /find-booking. No ctx/session
 * -- bookingReference + tour lead last name + tour lead email, all three
 * re-verified server-side. Same "seed into the real shared primary org"
 * convention as tests/booking-lookup.test.ts, which this file otherwise
 * mirrors closely.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let bookingId: string;
let bookingReference: string;
let touristId: string;
let departureId: string;
let tourPackageId: string;
const tourLeadEmail = `cancel-lookup-${suffix}@example.test`;

beforeAll(async () => {
  const primary = await admin.organization.findFirstOrThrow({ where: { isPrimary: true } });
  orgId = primary.id;

  const tourist = await admin.user.create({
    data: { email: `cancel-lookup-owner-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId },
  });
  touristId = tourist.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: `TEST-CANCEL-LOOKUP-${suffix}`,
        description: 'Fixture for guest self-service cancellation tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED_AVAILABLE',
      },
    });
    tourPackageId = pkg.id;
    // Far enough out (150 days) to land in the FULL_MINUS_DEPOSIT tier --
    // not the point of this file (that's booking.domain.test.ts's job),
    // just needs to be a real, resolvable date.
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date(Date.now() + 150 * 86_400_000), capacity: 5 },
    });
    departureId = departure.id;

    bookingReference = generateBookingReference();
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId: departure.id,
        touristUserId: touristId,
        seats: 1,
        // DR-261: a refund tier only ever resolves above NONE once the
        // booking has actually reached full payment (see
        // FULLY_PAID_CANCELLATION_STATUSES) -- FULLY_PAID here, not
        // AWAITING_DEPOSIT, is what actually exercises the far-out
        // FULL_MINUS_DEPOSIT tier below.
        status: 'FULLY_PAID',
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
        firstName: 'Cancel',
        lastName: 'LookupFixture',
        age: 30,
        sex: 'X',
        nationality: 'NA',
        idOrPassportNumber: `CANCELLOOKUP-${suffix}`,
        email: tourLeadEmail,
        isTourLead: true,
      },
    });
  });
});

afterAll(async () => {
  // Same guard as booking-lookup.test.ts's own afterAll -- never risk an
  // unscoped deleteMany against the real shared primary org.
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

describe('bookingService.cancelForBookingLookup', () => {
  it('rejects the right reference + last name but the wrong email (no leak of which part was wrong)', async () => {
    await expect(
      bookingService.cancelForBookingLookup({
        bookingReference,
        lastName: 'LookupFixture',
        email: 'not-the-real-email@example.test',
        reason: 'Change of plans',
        ip: '203.0.113.40',
      }),
    ).rejects.toThrow();
  });

  it('rejects the right reference + email but the wrong last name', async () => {
    await expect(
      bookingService.cancelForBookingLookup({
        bookingReference,
        lastName: 'SomeoneElse',
        email: tourLeadEmail,
        reason: 'Change of plans',
        ip: '203.0.113.41',
      }),
    ).rejects.toThrow();
  });

  it('rejects a made-up reference entirely', async () => {
    await expect(
      bookingService.cancelForBookingLookup({
        bookingReference: 'NOTREAL1',
        lastName: 'LookupFixture',
        email: tourLeadEmail,
        reason: 'Change of plans',
        ip: '203.0.113.42',
      }),
    ).rejects.toThrow();
  });

  it('cancels the booking and snapshots reason/email/tier on the right reference+lastName+email, matched case-insensitively', async () => {
    const { booking, refundTier } = await bookingService.cancelForBookingLookup({
      bookingReference,
      lastName: 'lookupfixture',
      email: tourLeadEmail.toUpperCase(),
      reason: 'Change of plans',
      ip: '203.0.113.43',
    });
    expect(booking.status).toBe('CANCELLED');
    expect(booking.cancellationReason).toBe('Change of plans');
    expect(booking.cancellationContactEmail?.toLowerCase()).toBe(tourLeadEmail.toLowerCase());
    expect(refundTier).toBe('FULL_MINUS_DEPOSIT');
    expect(booking.cancellationRefundTier).toBe('FULL_MINUS_DEPOSIT');

    // A second attempt fails -- CANCELLED is no longer in
    // CANCELLABLE_BOOKING_STATUSES, so this is treated as "no matching
    // booking found" like any other invalid attempt (same anti-enumeration
    // posture, not a distinct "already cancelled" error).
    await expect(
      bookingService.cancelForBookingLookup({
        bookingReference,
        lastName: 'LookupFixture',
        email: tourLeadEmail,
        reason: 'Trying again',
        ip: '203.0.113.44',
      }),
    ).rejects.toThrow();
  });
});

// Rate-limit *mechanism* coverage (assertWriteNotRateLimited itself,
// including the 429 it throws) lives in tests/lib/rate-limit.test.ts with a
// mocked Redis client -- this integration file's own environment has no
// Upstash credentials configured (same as CI, see .github/workflows/*.yml),
// so assertWriteNotRateLimited silently no-ops here by design (graceful
// degradation, OI-10) rather than actually throwing 429. Asserting a real
// 429 in this file would be flaky/environment-dependent for no added
// coverage over the mocked suite.
