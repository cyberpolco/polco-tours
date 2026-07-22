import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../src/lib/db';
import { bookingService, generateBookingReference } from '../src/modules/booking';

/**
 * DR-067: bookingService.runScheduledSweep()'s whole point is running the
 * existing lazy sweepLifecycle purge across EVERY organization, not just
 * whichever one a user request happens to touch. Two throwaway orgs (not
 * the shared primary org, since this backdates a soft-deleted row directly
 * via raw Prisma) each get a booking soft-deleted past the retention
 * window -- the assertion that matters is that BOTH get purged from a
 * SINGLE runScheduledSweep() call with zero prior reads/writes against
 * either org, proving this doesn't depend on the "sweep on next read"
 * convention DR-058 established.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgAId: string;
let orgBId: string;
let touristAId: string;
let touristBId: string;

async function createBackdatedSoftDeletedBooking(organizationId: string, touristUserId: string): Promise<string> {
  return withOrg(organizationId, async (tx) => {
    const b = await tx.booking.create({
      data: {
        organizationId,
        origin: 'TAILOR_MADE',
        touristUserId,
        seats: 1,
        status: 'CANCELLED',
        customCountry: 'NA',
        preferredCountries: ['NA'],
        bookingReference: generateBookingReference(),
        // 91 days ago -- one day past BOOKING_DELETION_RETENTION_DAYS (90).
        deletedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
      },
    });
    return b.id;
  });
}

beforeAll(async () => {
  const [orgA, orgB] = await Promise.all([
    admin.organization.create({ data: { name: `SWEEP-TEST-A-${suffix}`, countries: ['NA'], status: 'VERIFIED' } }),
    admin.organization.create({ data: { name: `SWEEP-TEST-B-${suffix}`, countries: ['NA'], status: 'VERIFIED' } }),
  ]);
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [touristA, touristB] = await Promise.all([
    admin.user.create({ data: { email: `sweep-tourist-a-${suffix}@example.test`, role: 'TOURIST', organizationId: orgAId } }),
    admin.user.create({ data: { email: `sweep-tourist-b-${suffix}@example.test`, role: 'TOURIST', organizationId: orgBId } }),
  ]);
  touristAId = touristA.id;
  touristBId = touristB.id;
});

afterAll(async () => {
  if (!orgAId || !orgBId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgAId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgAId } }));
  await withOrg(orgBId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgBId } }));
  await admin.user.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('bookingService.runScheduledSweep (DR-067)', () => {
  it(
    'purges a retention-expired booking in every organization from a single call',
    async () => {
      const bookingAId = await createBackdatedSoftDeletedBooking(orgAId, touristAId);
      const bookingBId = await createBackdatedSoftDeletedBooking(orgBId, touristBId);

      const result = await bookingService.runScheduledSweep();
      expect(result.organizationsSwept).toBeGreaterThanOrEqual(2);

      const [rowA, rowB] = await Promise.all([
        admin.booking.findUnique({ where: { id: bookingAId } }),
        admin.booking.findUnique({ where: { id: bookingBId } }),
      ]);
      expect(rowA).toBeNull();
      expect(rowB).toBeNull();
    },
    // This sweeps EVERY organization in the shared DB sequentially (by
    // design -- avoids the connection-pool-exhaustion issue Promise.all
    // caused elsewhere, DR-038/041/060/062/064/065), not just the two this
    // test creates -- this sandbox alone has accumulated 90+ organizations
    // from past sessions' test runs, well past the 20s default.
    90_000,
  );
});
