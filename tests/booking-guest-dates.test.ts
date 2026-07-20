import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatPackageReference } from '@modules/catalog';
import { bookingService } from '@modules/booking';
import type { AuthContext } from '@modules/auth';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../src/lib/db';

/**
 * DR-054: a guest booking a PREDEFINED_PACKAGE now picks their own travel
 * dates instead of joining a staff-pre-scheduled Departure --
 * bookingService.createHoldWithDates creates a fresh Departure (scoped to
 * exactly this booking, capacity == seats) via
 * catalogService.createDepartureForBooking, then holds it exactly like the
 * existing departureId-based createHold. Seeds into the real seeded primary
 * org (Lam), same rationale as tests/catalog-public.test.ts.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let touristId: string;
let publishedPackageId: string;
let draftPackageId: string;
const createdDepartureIds: string[] = [];
const createdBookingIds: string[] = [];

const ctx: AuthContext = {
  userId: '',
  roles: ['TOURIST'],
  permissions: new Set(['booking.create', 'catalog.read']),
  organizationId: '',
  sessionId: 'session-fixture',
  mustChangePassword: false,
};

beforeAll(async () => {
  const primary = await admin.organization.findFirstOrThrow({ where: { isPrimary: true } });
  orgId = primary.id;
  ctx.organizationId = orgId;

  const tourist = await admin.user.create({
    data: { email: `guest-dates-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId },
  });
  touristId = tourist.id;
  ctx.userId = touristId;

  await withOrg(orgId, async (tx) => {
    const published = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: `TEST-GUEST-DATES-${suffix}`,
        description: 'Fixture for guest-chosen-dates booking tests.',
        country: 'NA',
        priceMinor: 40000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    publishedPackageId = published.id;

    const draft = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: `TEST-GUEST-DATES-DRAFT-${suffix}`,
        description: 'Should never be bookable.',
        country: 'NA',
        priceMinor: 40000,
        currency: 'USD',
        status: 'DRAFT',
      },
    });
    draftPackageId = draft.id;
  });
});

afterAll(async () => {
  // Guard: skip cleanup entirely if beforeAll didn't fully succeed -- an
  // undefined-id scoped deleteMany can silently become an unscoped one
  // (Prisma drops undefined where-clause keys), and orgId here is the real
  // shared PRIMARY organization, not a throwaway fixture org. This has hit
  // production data before; skipping cleanup is always safe, an unscoped
  // delete is not.
  if (!orgId || !touristId || !publishedPackageId || !draftPackageId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  if (createdBookingIds.length > 0) {
    await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { id: { in: createdBookingIds } } }));
  }
  if (createdDepartureIds.length > 0) {
    await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { id: { in: createdDepartureIds } } }));
  }
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { id: { in: [publishedPackageId, draftPackageId] } } }));
  await admin.user.delete({ where: { id: touristId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('bookingService.createHoldWithDates (DR-054)', () => {
  it('creates a fresh Departure scoped to the guest-chosen dates and a matching booking', async () => {
    const booking = await bookingService.createHoldWithDates(ctx, {
      packageId: publishedPackageId,
      startDate: new Date('2027-05-01'),
      endDate: new Date('2027-05-08'),
      seats: 2,
    });
    createdBookingIds.push(booking.id);
    if (booking.departureId) createdDepartureIds.push(booking.departureId);

    expect(booking.origin).toBe('PREDEFINED_PACKAGE');
    expect(booking.status).toBe('AWAITING_DEPOSIT');
    expect(booking.seats).toBe(2);
    expect(booking.priceMinor).toBe(80000); // 40000/seat * 2
    expect(booking.currency).toBe('USD');
    expect(booking.departureId).toBeTruthy();

    const departure = await withOrg(orgId, (tx) => tx.departure.findUniqueOrThrow({ where: { id: booking.departureId! } }));
    expect(departure.tourPackageId).toBe(publishedPackageId);
    expect(departure.capacity).toBe(2); // capacity == this booking's seat count, not shared
    expect(departure.startDate.toISOString().slice(0, 10)).toBe('2027-05-01');
    expect(departure.endDate?.toISOString().slice(0, 10)).toBe('2027-05-08');
    expect(departure.priceOverrideMinor).toBeNull(); // inherits the package's price, doesn't snapshot its own
  });

  it('two guests booking the same package with different dates get two different Departures', async () => {
    const first = await bookingService.createHoldWithDates(ctx, {
      packageId: publishedPackageId,
      startDate: new Date('2027-06-01'),
      endDate: new Date('2027-06-05'),
      seats: 1,
    });
    const second = await bookingService.createHoldWithDates(ctx, {
      packageId: publishedPackageId,
      startDate: new Date('2027-07-01'),
      endDate: new Date('2027-07-05'),
      seats: 3,
    });
    createdBookingIds.push(first.id, second.id);
    if (first.departureId) createdDepartureIds.push(first.departureId);
    if (second.departureId) createdDepartureIds.push(second.departureId);

    expect(first.departureId).not.toBe(second.departureId);
  }, 40_000); // two sequential createHoldWithDates calls, each several round trips; this sandbox's Neon latency can exceed the 20s default

  it('rejects a DRAFT (unpublished) package', async () => {
    await expect(
      bookingService.createHoldWithDates(ctx, {
        packageId: draftPackageId,
        startDate: new Date('2027-05-01'),
        endDate: new Date('2027-05-08'),
        seats: 1,
      }),
    ).rejects.toThrow();
  });

  it('rejects an end date on or before the start date', async () => {
    await expect(
      bookingService.createHoldWithDates(ctx, {
        packageId: publishedPackageId,
        startDate: new Date('2027-05-08'),
        endDate: new Date('2027-05-01'),
        seats: 1,
      }),
    ).rejects.toThrow();
  });
});
