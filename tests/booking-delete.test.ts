import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../src/lib/db';
import { bookingService, generateBookingReference } from '../src/modules/booking';
import { ApiError } from '../src/lib/errors';
import type { AuthContext } from '../src/modules/auth/domain';
import type { Permission } from '../src/lib/rbac';

/**
 * DR-058: SUPERADMIN-only, real (soft-then-purged) booking deletion --
 * any status, not just CANCELLED (explicit user choice). Own throwaway org
 * (not the shared primary org) since this test creates/soft-deletes/
 * backdates bookings directly via raw Prisma, which would be too invasive
 * to do against real shared data.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let superadminId: string;
let operatorId: string;
let touristId: string;

function ctxFor(userId: string, roles: AuthContext['roles'], permissions: Permission[] = []): AuthContext {
  return {
    userId,
    roles,
    permissions: new Set(permissions),
    organizationId: orgId,
    sessionId: 'test-session',
    mustChangePassword: false,
  };
}

async function createRawBooking(status: string, deletedAt: Date | null = null): Promise<string> {
  return withOrg(orgId, async (tx) => {
    const b = await tx.booking.create({
      data: {
        organizationId: orgId,
        origin: 'TAILOR_MADE',
        touristUserId: touristId,
        seats: 1,
        status: status as never,
        customCountry: 'NA',
        preferredCountries: ['NA'],
        bookingReference: generateBookingReference(),
        deletedAt,
      },
    });
    return b.id;
  });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `BOOKING-DELETE-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [superadmin, operator, tourist] = await Promise.all([
    admin.user.create({ data: { email: `delete-superadmin-${suffix}@example.test`, role: 'SUPERADMIN', organizationId: orgId } }),
    admin.user.create({ data: { email: `delete-operator-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `delete-tourist-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  superadminId = superadmin.id;
  operatorId = operator.id;
  touristId = tourist.id;
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('bookingService.deleteBooking (DR-058)', () => {
  it('rejects a non-SUPERADMIN caller even with booking.delete somehow in their permission set', async () => {
    const bookingId = await createRawBooking('CANCELLED');
    const ctx = ctxFor(operatorId, ['TOUR_OPERATOR'], ['booking.delete']);
    await expect(bookingService.deleteBooking(ctx, bookingId)).rejects.toThrow();

    // Confirmed still present, not soft-deleted, via a raw read.
    const row = await withOrg(orgId, (tx) => tx.booking.findUnique({ where: { id: bookingId } }));
    expect(row?.deletedAt).toBeNull();
  });

  it('rejects a caller with no booking.delete permission at all (assertCan itself fails first)', async () => {
    const bookingId = await createRawBooking('CANCELLED');
    const ctx = ctxFor(operatorId, ['TOUR_OPERATOR'], []);
    const err = await bookingService.deleteBooking(ctx, bookingId).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
  });

  it('SUPERADMIN can soft-delete a booking in ANY status, not just CANCELLED', async () => {
    const bookingId = await createRawBooking('AWAITING_QUOTATION');
    const ctx = ctxFor(superadminId, ['SUPERADMIN']);
    await bookingService.deleteBooking(ctx, bookingId);

    const row = await withOrg(orgId, (tx) => tx.booking.findUnique({ where: { id: bookingId } }));
    expect(row).not.toBeNull();
    expect(row?.deletedAt).not.toBeNull();
  });

  it('a soft-deleted booking disappears from every staff read path immediately', async () => {
    const bookingId = await createRawBooking('CONFIRMED');
    const staffCtx = ctxFor(operatorId, ['TOUR_OPERATOR'], ['booking.read']);

    const before = await bookingService.list(staffCtx);
    expect(before.some((b) => b.id === bookingId)).toBe(true);

    await bookingService.deleteBooking(ctxFor(superadminId, ['SUPERADMIN']), bookingId);

    const after = await bookingService.list(staffCtx);
    expect(after.some((b) => b.id === bookingId)).toBe(false);
  });

  it('deleting an already-nonexistent booking 404s', async () => {
    const ctx = ctxFor(superadminId, ['SUPERADMIN']);
    await expect(bookingService.deleteBooking(ctx, '00000000-0000-4000-8000-000000000000')).rejects.toThrow();
  });
});

describe('retention-purge sweep (DR-058, 90 days)', () => {
  it('permanently removes a booking soft-deleted more than 90 days ago the next time anything reads this org', async () => {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 91);
    const bookingId = await createRawBooking('CANCELLED', staleDate);

    // Any read path runs sweepLifecycle first (bookingRepository.listForOrg,
    // called via bookingService.list) -- no separate purge entry point exists.
    await bookingService.list(ctxFor(operatorId, ['TOUR_OPERATOR'], ['booking.read']));

    const row = await withOrg(orgId, (tx) => tx.booking.findUnique({ where: { id: bookingId } }));
    expect(row).toBeNull();
  });

  it('does NOT purge a booking soft-deleted within the retention window', async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);
    const bookingId = await createRawBooking('CANCELLED', recentDate);

    await bookingService.list(ctxFor(operatorId, ['TOUR_OPERATOR'], ['booking.read']));

    const row = await withOrg(orgId, (tx) => tx.booking.findUnique({ where: { id: bookingId } }));
    expect(row).not.toBeNull();
    expect(row?.deletedAt).not.toBeNull();
  });
});
