import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { testPackageReference } from './helpers/package-reference';
import { generateBookingReference, bookingService } from '@modules/booking';
import type { AuthContext } from '@modules/auth';
import { prisma, withOrg } from '../src/lib/db';

/**
 * DR-194, follow-up to DR-191: the admin Clients directory's real-email
 * resolution (bookingService.listLatestContactEmailsForTourists) only ever
 * checked Booking.contactEmail, which is TAILOR_MADE-only (DR-047) -- a
 * tourist whose only booking is PREDEFINED_PACKAGE always fell back to the
 * anonymous User.email placeholder, real bookings included, not just
 * legacy ones. Covers both resolution paths plus the genuine-fallback case.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let operatorId: string;
let tailorMadeTouristId: string;
let predefinedTouristId: string;
let unresolvedTouristId: string;

function ctxFor(): AuthContext {
  return {
    userId: operatorId,
    roles: ['TOUR_OPERATOR'],
    permissions: new Set(['booking.read']),
    organizationId: orgId,
    sessionId: 'session-fixture',
    mustChangePassword: false,
  };
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `CONTACT-EMAIL-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, tailorMadeTourist, predefinedTourist, unresolvedTourist] = await Promise.all([
    admin.user.create({ data: { email: `op-contact-email-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `tourist-tm-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `tourist-pp-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `tourist-none-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  tailorMadeTouristId = tailorMadeTourist.id;
  predefinedTouristId = predefinedTourist.id;
  unresolvedTouristId = unresolvedTourist.id;

  // Split across several smaller `withOrg` transactions rather than one
  // giant one -- Prisma's default interactive-transaction timeout (5000ms)
  // is measurably too short for this sandbox's real network path to Neon
  // for many sequential creates in a single transaction (documented gotcha,
  // hit and fixed the same way in tests/api/insights.api.test.ts, DR-037).

  // TAILOR_MADE: real email lives directly on Booking.contactEmail.
  await withOrg(orgId, async (tx) => {
    await tx.booking.create({
      data: {
        organizationId: orgId,
        origin: 'TAILOR_MADE',
        touristUserId: tailorMadeTouristId,
        seats: 1,
        status: 'AWAITING_QUOTATION',
        customCountry: 'NA',
        bookingReference: generateBookingReference(),
        contactEmail: 'real-tailor-made@example.test',
      },
    });
  });

  // PREDEFINED_PACKAGE: no Booking.contactEmail of its own -- the real
  // email lives on the tour lead Traveler instead.
  let departureId: string;
  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: `TEST-CONTACT-EMAIL-${suffix}`,
        description: 'Fixture.',
        country: 'NA',
        priceMinor: 100000,
        currency: 'USD',
        status: 'PUBLISHED_AVAILABLE',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date(), capacity: 4 },
    });
    departureId = departure.id;
  });

  await withOrg(orgId, async (tx) => {
    const predefinedBooking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId,
        touristUserId: predefinedTouristId,
        seats: 1,
        status: 'DEPOSIT_PAID',
        priceMinor: 100000,
        currency: 'USD',
        bookingReference: generateBookingReference(),
      },
    });
    await tx.traveler.create({
      data: {
        organizationId: orgId,
        bookingId: predefinedBooking.id,
        firstName: 'Real',
        lastName: 'Guest',
        sex: 'F',
        isTourLead: true,
        email: 'real-predefined-package@example.test',
      },
    });
  });

  // Neither a TAILOR_MADE contactEmail nor a resolvable tour lead email --
  // stays unresolved, must still fall back to the caller's own placeholder.
  await withOrg(orgId, async (tx) => {
    const unresolvedBooking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId,
        touristUserId: unresolvedTouristId,
        seats: 1,
        status: 'DEPOSIT_PAID',
        priceMinor: 100000,
        currency: 'USD',
        bookingReference: generateBookingReference(),
      },
    });
    await tx.traveler.create({
      data: {
        organizationId: orgId,
        bookingId: unresolvedBooking.id,
        firstName: 'No',
        lastName: 'Email',
        sex: 'M',
        isTourLead: true,
        email: null,
      },
    });
  });
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, async (tx) => {
    await tx.traveler.deleteMany({ where: { organizationId: orgId } });
    await tx.booking.deleteMany({ where: { organizationId: orgId } });
    await tx.departure.deleteMany({ where: { organizationId: orgId } });
    await tx.tourPackage.deleteMany({ where: { organizationId: orgId } });
  });
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('bookingService.listLatestContactEmailsForTourists', () => {
  it(
    'resolves a TAILOR_MADE booking from Booking.contactEmail',
    async () => {
      const result = await bookingService.listLatestContactEmailsForTourists(ctxFor(), [
        tailorMadeTouristId,
        predefinedTouristId,
        unresolvedTouristId,
      ]);
      expect(result.get(tailorMadeTouristId)).toBe('real-tailor-made@example.test');
    },
    30_000,
  );

  it(
    'falls back to the tour lead Traveler.email for a PREDEFINED_PACKAGE booking (DR-194)',
    async () => {
      const result = await bookingService.listLatestContactEmailsForTourists(ctxFor(), [
        tailorMadeTouristId,
        predefinedTouristId,
        unresolvedTouristId,
      ]);
      expect(result.get(predefinedTouristId)).toBe('real-predefined-package@example.test');
    },
    30_000,
  );

  it(
    'leaves a tourist with neither source unresolved (caller falls back to its own placeholder)',
    async () => {
      const result = await bookingService.listLatestContactEmailsForTourists(ctxFor(), [
        tailorMadeTouristId,
        predefinedTouristId,
        unresolvedTouristId,
      ]);
      expect(result.has(unresolvedTouristId)).toBe(false);
    },
    30_000,
  );
});
