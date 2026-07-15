import { generateConfirmationCode } from '../../src/modules/booking';
import { formatPackageReference } from '@modules/catalog';
import { prisma, withOrg } from '../../src/lib/db';

/**
 * Seeds a staff user + tourist + booking for e2e assertions. Tenant-scoped
 * tables (package/departure/booking) MUST go through withOrg -- RLS is live
 * for the app under test (same non-superuser polco_app role as the
 * `quality` CI job), so a raw unscoped create would be invisible to the
 * dashboard and fail the test confusingly.
 */
export async function seedStaffAndBooking(opts?: { seats?: number }): Promise<{ staffUserId: string; bookingId: string }> {
  const seats = opts?.seats ?? 1;
  const org = await prisma.organization.findFirstOrThrow({ where: { isPrimary: true } });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const [staff, tourist] = await Promise.all([
    prisma.user.create({
      data: { email: `e2e-staff-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: org.id, emailVerified: true },
    }),
    prisma.user.create({
      data: { email: `e2e-tourist-${suffix}@example.test`, role: 'TOURIST', organizationId: org.id, emailVerified: true },
    }),
  ]);

  const bookingId = await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        packageReference: formatPackageReference(Date.now()),
        title: `E2E Fixture Safari ${suffix}`,
        description: 'Fixture for staff dashboard e2e tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: {
        organizationId: org.id,
        tourPackageId: pkg.id,
        startDate: new Date('2026-09-01'),
        capacity: 5,
        status: 'SCHEDULED',
      },
    });
    const booking = await tx.booking.create({
      data: {
        organizationId: org.id,
        departureId: departure.id,
        touristUserId: tourist.id,
        seats,
        priceMinor: 10000 * seats,
        currency: 'USD',
        confirmationCode: generateConfirmationCode(),
        bookingReference: generateConfirmationCode(),
      },
    });
    return booking.id;
  });

  return { staffUserId: staff.id, bookingId };
}

/**
 * Seeds a fully-set-up booking (traveler + passport document + finalized
 * add-ons) so the staff booking-detail page renders its post-setup view
 * (BOOKING/INVOICE/PAYMENTS/VISA), not the setup checklist -- same
 * seed-a-complete-manifest-directly convention as
 * tests/api/invoices.api.test.ts's fixture (DR-015 gated invoice creation
 * on the manifest being complete; this page gates the same way).
 */
export async function seedStaffAndCompleteBooking(): Promise<{ staffUserId: string; bookingId: string }> {
  const org = await prisma.organization.findFirstOrThrow({ where: { isPrimary: true } });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const [staff, tourist] = await Promise.all([
    prisma.user.create({
      data: { email: `e2e-staff-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: org.id, emailVerified: true },
    }),
    prisma.user.create({
      data: { email: `e2e-tourist-${suffix}@example.test`, role: 'TOURIST', organizationId: org.id, emailVerified: true },
    }),
  ]);

  const bookingId = await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        packageReference: formatPackageReference(Date.now()),
        title: `E2E Complete Fixture Safari ${suffix}`,
        description: 'Fixture for the staff booking-detail Visa line e2e test.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: org.id, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), capacity: 1, status: 'SCHEDULED' },
    });
    const booking = await tx.booking.create({
      data: {
        organizationId: org.id,
        departureId: departure.id,
        touristUserId: tourist.id,
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
        confirmationCode: generateConfirmationCode(),
        bookingReference: generateConfirmationCode(),
        addonsFinalizedAt: new Date(),
      },
    });
    const document = await tx.document.create({
      data: {
        organizationId: org.id,
        kind: 'PASSPORT',
        blobPathname: `passports/${org.id}/e2e-fixture-${suffix}.pdf`,
        contentType: 'application/pdf',
        sizeBytes: 1024,
        uploadedByUserId: staff.id,
      },
    });
    await tx.traveler.create({
      data: {
        organizationId: org.id,
        bookingId: booking.id,
        firstName: 'Lead',
        lastName: 'Traveler',
        age: 35,
        sex: 'M',
        nationality: 'NA',
        idOrPassportNumber: `E2E-${suffix}`,
        isTourLead: true,
        passportDocumentId: document.id,
      },
    });
    return booking.id;
  });

  return { staffUserId: staff.id, bookingId };
}
