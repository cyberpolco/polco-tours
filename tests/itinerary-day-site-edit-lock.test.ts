import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { generateBookingReference } from '@modules/booking';
import { itineraryService } from '@modules/itinerary';
import { prisma, withOrg } from '../src/lib/db';
import type { AuthContext } from '../src/modules/auth/domain';

/**
 * DR-105: itineraryService.addDaySite/removeDaySite/moveDaySite have no
 * dedicated REST route (staff drives them via Server Actions from the
 * itinerary detail page) -- so, like itinerary-delete.test.ts, this drives
 * the service directly rather than through tests/api/*.api.test.ts.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let operatorId: string;
let touristId: string;

function ctxFor(userId: string): AuthContext {
  return {
    userId,
    roles: ['TOUR_OPERATOR'],
    permissions: new Set(['itinerary.write', 'itinerary.read', 'booking.read']),
    organizationId: orgId,
    sessionId: 'test-session',
    mustChangePassword: false,
  };
}

async function createFixture() {
  return withOrg(orgId, async (tx) => {
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        touristUserId: touristId,
        bookingReference: generateBookingReference(),
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
        status: 'CONFIRMED',
      },
    });
    const itinerary = await tx.itinerary.create({ data: { organizationId: orgId, bookingId: booking.id } });
    const day = await tx.itineraryDay.create({
      data: { organizationId: orgId, itineraryId: itinerary.id, dayNumber: 1, date: new Date('2026-09-01') },
    });
    const siteA = await tx.site.create({
      data: { organizationId: orgId, name: `Day-Site Lock Fixture A ${suffix}`, country: 'NA', province: 'Khomas' },
    });
    const siteB = await tx.site.create({
      data: { organizationId: orgId, name: `Day-Site Lock Fixture B ${suffix}`, country: 'NA', province: 'Khomas' },
    });
    return { bookingId: booking.id, itineraryId: itinerary.id, dayId: day.id, siteAId: siteA.id, siteBId: siteB.id };
  });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `ITIN-DAYSITE-LOCK-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, tourist] = await Promise.all([
    admin.user.create({ data: { email: `itin-daysite-op-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `itin-daysite-tourist-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  touristId = tourist.id;
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgId was assigned, Prisma silently
  // drops the undefined where-clause value, turning these into unscoped
  // deleteMany calls that wipe the whole table -- this has hit real
  // production data twice. Skip cleanup entirely rather than risk it.
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.itineraryDaySite.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.itineraryDay.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.itinerary.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.site.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('itineraryService day-site edits are hard-blocked on a terminal-status booking (DR-105)', () => {
  it.each(['COMPLETED', 'CANCELLED', 'REFUNDED'] as const)('rejects addDaySite/removeDaySite/moveDaySite once the booking is %s', async (status) => {
    const { bookingId, itineraryId, dayId, siteAId, siteBId } = await createFixture();
    const ctx = ctxFor(operatorId);

    const added = await itineraryService.addDaySite(ctx, itineraryId, dayId, siteAId);
    await itineraryService.addDaySite(ctx, itineraryId, dayId, siteBId);

    await withOrg(orgId, (tx) => tx.booking.update({ where: { id: bookingId }, data: { status } }));

    await expect(itineraryService.addDaySite(ctx, itineraryId, dayId, siteBId)).rejects.toMatchObject({ status: 409 });
    await expect(itineraryService.moveDaySite(ctx, itineraryId, dayId, siteBId, 'up')).rejects.toMatchObject({ status: 409 });
    await expect(itineraryService.removeDaySite(ctx, itineraryId, dayId, added.siteId)).rejects.toMatchObject({ status: 409 });
  });
});
