import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { bookingService, generateBookingReference } from '@modules/booking';
import { visaService } from '@modules/visa';
import { prisma, withOrg } from '../src/lib/db';
import type { AuthContext } from '../src/modules/auth/domain';

/**
 * DR-060: a VisaApplication is now created automatically right after a
 * traveler's passport is uploaded (on a booking that requires one), instead
 * of relying on a manual API call nothing in the UI ever actually made. Also
 * covers the "needs application" reconciliation view, which should only ever
 * surface a traveler the automatic trigger didn't (or couldn't) reach.
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
    permissions: new Set(['booking.create', 'booking.read', 'catalog.read', 'documents.write', 'visa.process']),
    organizationId: orgId,
    sessionId: 'test-session',
    mustChangePassword: false,
  };
}

async function createVisaBooking(): Promise<{ bookingId: string; travelerId: string }> {
  return withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: `Visa Auto-Submit Fixture ${suffix}`,
        description: 'Fixture.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-10-01'), capacity: 5, status: 'SCHEDULED' },
    });
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId: departure.id,
        touristUserId: touristId,
        bookingReference: generateBookingReference(),
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
        requiresPassportUpload: true,
      },
    });
    const traveler = await tx.traveler.create({
      data: {
        organizationId: orgId,
        bookingId: booking.id,
        firstName: 'Auto',
        lastName: 'Submit',
        age: 30,
        sex: 'M',
        nationality: 'ZA',
        idOrPassportNumber: `AUTO-${Date.now()}`,
        isTourLead: true,
      },
    });
    return { bookingId: booking.id, travelerId: traveler.id };
  });
}

async function attachPassport(travelerId: string): Promise<string> {
  return withOrg(orgId, async (tx) => {
    const doc = await tx.document.create({
      data: {
        organizationId: orgId,
        kind: 'PASSPORT',
        blobPathname: `fixture/${Date.now()}-${travelerId}.pdf`,
        contentType: 'application/pdf',
        sizeBytes: 100,
        uploadedByUserId: operatorId,
      },
    });
    await tx.traveler.update({ where: { id: travelerId }, data: { passportDocumentId: doc.id } });
    return doc.id;
  });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `VISA-AUTO-SUBMIT-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, tourist] = await Promise.all([
    admin.user.create({ data: { email: `visa-auto-op-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `visa-auto-tourist-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  touristId = tourist.id;
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.visaApplication.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.traveler.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.document.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('visaService.autoSubmitOnPassportUpload (DR-060)', () => {
  it('creates a VisaApplication once a passport is uploaded on a booking that requires one', async () => {
    const { bookingId, travelerId } = await createVisaBooking();
    await attachPassport(travelerId);

    await visaService.autoSubmitOnPassportUpload(ctxFor(operatorId), bookingId, travelerId);

    const application = await withOrg(orgId, (tx) => tx.visaApplication.findUnique({ where: { travelerId } }));
    expect(application).not.toBeNull();
    expect(application?.status).toBe('SUBMITTED');
    expect(application?.country).toBe('NA');
  });

  it('is a no-op, not an error, when an application already exists for that traveler', async () => {
    const { bookingId, travelerId } = await createVisaBooking();
    await attachPassport(travelerId);
    await visaService.autoSubmitOnPassportUpload(ctxFor(operatorId), bookingId, travelerId);

    await expect(visaService.autoSubmitOnPassportUpload(ctxFor(operatorId), bookingId, travelerId)).resolves.toBeUndefined();

    const applications = await withOrg(orgId, (tx) => tx.visaApplication.findMany({ where: { travelerId } }));
    expect(applications).toHaveLength(1);
  });

  it('is a no-op when the booking does not require a passport upload', async () => {
    const booking = await withOrg(orgId, (tx) =>
      tx.booking.create({
        data: {
          organizationId: orgId,
          origin: 'TAILOR_MADE',
          touristUserId: touristId,
          bookingReference: generateBookingReference(),
          seats: 1,
          status: 'AWAITING_QUOTATION',
          requiresPassportUpload: false,
        },
      }),
    );
    const traveler = await withOrg(orgId, (tx) =>
      tx.traveler.create({
        data: {
          organizationId: orgId,
          bookingId: booking.id,
          firstName: 'No',
          lastName: 'Visa',
          age: 22,
          sex: 'F',
          nationality: 'ZA',
          idOrPassportNumber: `NOVISA-${Date.now()}`,
          isTourLead: true,
        },
      }),
    );

    await visaService.autoSubmitOnPassportUpload(ctxFor(operatorId), booking.id, traveler.id);

    const application = await withOrg(orgId, (tx) => tx.visaApplication.findUnique({ where: { travelerId: traveler.id } }));
    expect(application).toBeNull();
  });
});

describe('visaService.listNeedingApplication (DR-060)', () => {
  it('surfaces a traveler with an uploaded passport and no application, and excludes one that already has one', async () => {
    const pending = await createVisaBooking();
    await attachPassport(pending.travelerId);

    const already = await createVisaBooking();
    await attachPassport(already.travelerId);
    await visaService.autoSubmitOnPassportUpload(ctxFor(operatorId), already.bookingId, already.travelerId);

    const results = await visaService.listNeedingApplication(ctxFor(operatorId));
    const travelerIds = results.map((r) => r.travelerId);
    expect(travelerIds).toContain(pending.travelerId);
    expect(travelerIds).not.toContain(already.travelerId);

    const pendingRow = results.find((r) => r.travelerId === pending.travelerId);
    expect(pendingRow?.origin).toBe('PREDEFINED_PACKAGE');
    expect(pendingRow?.bookingId).toBe(pending.bookingId);
  });

  it('excludes a traveler with no passport uploaded at all', async () => {
    const { travelerId } = await createVisaBooking();
    const results = await visaService.listNeedingApplication(ctxFor(operatorId));
    expect(results.map((r) => r.travelerId)).not.toContain(travelerId);
  });
});
