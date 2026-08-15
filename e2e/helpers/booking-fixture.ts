import { generateBookingReference } from '../../src/modules/booking';
import { formatPackageReference } from '@modules/catalog';
import { prisma, withOrg } from '../../src/lib/db';

/**
 * Seeds a staff user + tourist + booking for e2e assertions. Tenant-scoped
 * tables (package/departure/booking) MUST go through withOrg -- RLS is live
 * for the app under test (same non-superuser polco_app role as the
 * `quality` CI job), so a raw unscoped create would be invisible to the
 * dashboard and fail the test confusingly.
 */
export async function seedStaffAndBooking(
  opts?: { seats?: number; withVisaAddon?: boolean },
): Promise<{ staffUserId: string; bookingId: string; visaAddonServiceId?: string }> {
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

  const { bookingId, visaAddonServiceId } = await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        packageReference: formatPackageReference(Date.now()),
        title: `E2E Fixture Safari ${suffix}`,
        description: 'Fixture for staff dashboard e2e tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED_AVAILABLE',
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
        bookingReference: generateBookingReference(),
        // Raw fixture, not created via bookingService.createHold -- set this
        // explicitly to match what a real hold produces (DR-027 renamed the
        // old HELD status to AWAITING_DEPOSIT), rather than leave it at the
        // schema's DRAFT default.
        status: 'AWAITING_DEPOSIT',
      },
    });
    // Opt-in only -- selecting this at the Add-ons step (now the setup
    // wizard's first step) is what makes the Passport step appear at all,
    // but most callers of this fixture don't walk that far into the
    // wizard. Every call shares the same primary org (no per-test org), so
    // seeding one unconditionally would leave same-named "Visa Assistance"
    // rows accumulating across every test in the file (and every retry) --
    // ambiguous for a spec that locates it by label text rather than this
    // returned id.
    let visaAddonServiceId: string | undefined;
    if (opts?.withVisaAddon) {
      const addon = await tx.addonService.create({
        data: {
          organizationId: org.id,
          code: 'VISA_ASSISTANCE',
          name: `E2E Visa Assistance ${suffix}`,
          description: 'Fixture add-on for staff dashboard e2e tests.',
          priceMinor: 5000,
          currency: 'USD',
        },
      });
      visaAddonServiceId = addon.id;
    }
    return { bookingId: booking.id, visaAddonServiceId };
  });

  return { staffUserId: staff.id, bookingId, visaAddonServiceId };
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
        status: 'PUBLISHED_AVAILABLE',
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
        bookingReference: generateBookingReference(),
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

/**
 * DR-111 regression fixture: a TAILOR_MADE booking that has finished
 * traveler/passport setup (DR-111 lets that happen with no age/nationality/
 * idOrPassportNumber) while still AWAITING_QUOTATION -- i.e. `priceMinor` is
 * still null. The staff booking-detail page must render this without
 * crashing (it used to unconditionally call
 * invoicingService.getOrCreateInvoiceForBooking, which 409s until a
 * quotation exists).
 */
export async function seedStaffAndTailorMadeAwaitingQuotation(): Promise<{ staffUserId: string; bookingId: string }> {
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
    const booking = await tx.booking.create({
      data: {
        organizationId: org.id,
        origin: 'TAILOR_MADE',
        touristUserId: tourist.id,
        seats: 1,
        bookingReference: generateBookingReference(),
        customCountry: 'NA',
        status: 'AWAITING_QUOTATION',
        addonsFinalizedAt: new Date(),
      },
    });
    await tx.traveler.create({
      data: {
        organizationId: org.id,
        bookingId: booking.id,
        firstName: 'Lead',
        lastName: 'Traveler',
        sex: 'M',
        isTourLead: true,
        // DR-111: deliberately omitted -- plan-my-trip never collects these
        // for a TAILOR_MADE request, so age/nationality/idOrPassportNumber
        // stay null.
      },
    });
    return booking.id;
  });

  return { staffUserId: staff.id, bookingId };
}
