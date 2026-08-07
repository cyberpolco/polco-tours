import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { generateBookingReference } from '@modules/booking';
import { prisma, withOrg } from '../src/lib/db';
import { assertClientDeletable } from '../src/lib/client-deletion';
import { DEFAULT_PERMISSIONS } from '../src/lib/rbac';
import type { AuthContext } from '../src/modules/auth';

/**
 * A client may only be deleted once every one of their non-deleted
 * bookings is COMPLETED and reviewed (a booking the superadmin already
 * soft-deleted doesn't count against them at all). Builds RatingCode/
 * Review fixtures directly rather than through ratingsService.submitRating
 * -- that public guest flow is hardcoded to getPrimaryOrgId(), which a
 * fresh test-fixture org isn't.
 */
const admin = new PrismaClient();

let orgId: string;
let operatorId: string;
let ctx: AuthContext;

async function createTourist(email: string): Promise<string> {
  const user = await admin.user.create({ data: { email, role: 'TOURIST', organizationId: orgId } });
  return user.id;
}

async function createBooking(touristUserId: string, status: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED', deleted = false) {
  return withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now() + Math.random()),
        title: 'Client Deletion Fixture Safari',
        description: 'Fixture.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-01-01'), capacity: 5, status: 'SCHEDULED' },
    });
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId: departure.id,
        touristUserId,
        bookingReference: generateBookingReference(),
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
        status,
        deletedAt: deleted ? new Date() : null,
      },
    });
    return booking.id;
  });
}

async function markReviewed(bookingId: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    const ratingCode = await tx.ratingCode.create({
      data: {
        organizationId: orgId,
        bookingId,
        code: `R${Date.now()}${Math.floor(Math.random() * 1000)}`,
        issuedByUserId: operatorId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        usedAt: new Date(),
      },
    });
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    await tx.review.create({
      data: {
        organizationId: orgId,
        bookingId,
        ratingCodeId: ratingCode.id,
        touristUserId: booking.touristUserId,
        overallRating: 5,
      },
    });
  });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `CLIENT-DELETE-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;
  const operator = await admin.user.create({
    data: { email: `op-clientdel-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId },
  });
  operatorId = operator.id;
  ctx = {
    userId: operatorId,
    roles: ['TOUR_OPERATOR'],
    permissions: new Set(DEFAULT_PERMISSIONS.TOUR_OPERATOR),
    organizationId: orgId,
    sessionId: 's1',
    mustChangePassword: false,
  };
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.review.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.ratingCode.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('assertClientDeletable', () => {
  it('resolves for a client with no bookings at all', async () => {
    const touristId = await createTourist(`t-none-${Date.now()}@example.test`);
    await expect(assertClientDeletable(ctx, orgId, touristId)).resolves.toBeUndefined();
  });

  it('rejects a client with an active (CONFIRMED) booking', async () => {
    const touristId = await createTourist(`t-active-${Date.now()}@example.test`);
    await createBooking(touristId, 'CONFIRMED');
    await expect(assertClientDeletable(ctx, orgId, touristId)).rejects.toThrow(/active or upcoming/);
  });

  it('rejects a client with a COMPLETED but unreviewed booking', async () => {
    const touristId = await createTourist(`t-unreviewed-${Date.now()}@example.test`);
    await createBooking(touristId, 'COMPLETED');
    await expect(assertClientDeletable(ctx, orgId, touristId)).rejects.toThrow(/not been reviewed/);
  });

  it('resolves for a client whose only booking is COMPLETED and reviewed', async () => {
    const touristId = await createTourist(`t-reviewed-${Date.now()}@example.test`);
    const bookingId = await createBooking(touristId, 'COMPLETED');
    await markReviewed(bookingId);
    await expect(assertClientDeletable(ctx, orgId, touristId)).resolves.toBeUndefined();
  });

  it('resolves for a client whose only booking was already soft-deleted by a superadmin, regardless of status', async () => {
    const touristId = await createTourist(`t-deletedbooking-${Date.now()}@example.test`);
    await createBooking(touristId, 'CONFIRMED', true);
    await expect(assertClientDeletable(ctx, orgId, touristId)).resolves.toBeUndefined();
  });
});
