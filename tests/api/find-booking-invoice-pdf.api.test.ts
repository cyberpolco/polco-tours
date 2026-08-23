import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPackageReference } from '../helpers/package-reference';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { generateBookingReference } from '../../src/modules/booking';

const { GET: getInvoicePdf } = await import('../../src/app/api/v1/find-booking/invoice-pdf/route');

/**
 * DR-175: the guest "find my booking" flow's own invoice/receipt download --
 * no ctx/session, re-runs the same two-factor bookingReference+lastName
 * check the find-booking/result page itself already ran. Seeds into the
 * real seeded primary org (Lam), same rationale/caution as
 * tests/booking-lookup.test.ts -- bookingService.lookupByBookingReference
 * resolves the org internally via getPrimaryOrgId(), not a param.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgId: string;
let bookingId: string;
let bookingReference: string;
let touristId: string;
let departureId: string;
let tourPackageId: string;
let paidInvoiceId: string;
let unpaidBookingId: string;
let unpaidBookingReference: string;
let unpaidInvoiceId: string;

function req(url: string): NextRequest {
  return new NextRequest(url);
}

beforeAll(async () => {
  const primary = await admin.organization.findFirstOrThrow({ where: { isPrimary: true } });
  orgId = primary.id;

  const tourist = await admin.user.create({
    data: { email: `find-inv-${suffix}@example.test`, role: 'TOURIST', organizationId: orgId },
  });
  touristId = tourist.id;

  // Split across several smaller withOrg transactions rather than one big
  // one -- Prisma's interactive-transaction default timeout (5s) can be
  // tight for this many sequential writes under this sandbox's Neon
  // latency; other fixture files in this repo keep each transaction small
  // for the same reason.
  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: `TEST-FIND-INV-${suffix}`,
        description: 'Fixture for find-booking invoice PDF tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED_AVAILABLE',
      },
    });
    tourPackageId = pkg.id;
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2027-03-01'), capacity: 5 },
    });
    departureId = departure.id;
  });

  // Fully paid booking -- the PDF should be downloadable.
  await withOrg(orgId, async (tx) => {
    bookingReference = generateBookingReference();
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId,
        touristUserId: touristId,
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
        bookingReference,
        status: 'FULLY_PAID',
      },
    });
    bookingId = booking.id;
    await tx.traveler.create({
      data: {
        organizationId: orgId,
        bookingId: booking.id,
        firstName: 'FindInv',
        lastName: 'Fixture',
        age: 30,
        sex: 'X',
        nationality: 'NA',
        idOrPassportNumber: `FINDINV-${suffix}`,
        isTourLead: true,
      },
    });
    const invoice = await tx.invoice.create({
      data: {
        organizationId: orgId,
        bookingId,
        currency: 'USD',
        subtotalMinor: 10000,
        taxRateBp: 1000,
        taxMinor: 1000,
        totalMinor: 11000,
        depositMinor: 4400,
        balanceMinor: 6600,
        status: 'PAID',
      },
    });
    paidInvoiceId = invoice.id;
    await tx.payment.create({
      data: {
        organizationId: orgId,
        invoiceId: invoice.id,
        kind: 'FULL',
        amountMinor: 11000,
        currency: 'USD',
        provider: 'stub',
        providerRef: `stub-${suffix}`,
        status: 'SUCCEEDED',
      },
    });
  });

  // A second booking with an ISSUED (never-paid) invoice -- the PDF must
  // stay unavailable (404), not a broken download.
  await withOrg(orgId, async (tx) => {
    unpaidBookingReference = generateBookingReference();
    const unpaidBooking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId,
        touristUserId: touristId,
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
        bookingReference: unpaidBookingReference,
      },
    });
    unpaidBookingId = unpaidBooking.id;
    await tx.traveler.create({
      data: {
        organizationId: orgId,
        bookingId: unpaidBookingId,
        firstName: 'Unpaid',
        lastName: 'Fixture',
        age: 30,
        sex: 'X',
        nationality: 'NA',
        idOrPassportNumber: `UNPAID-${suffix}`,
        isTourLead: true,
      },
    });
    const unpaidInvoice = await tx.invoice.create({
      data: {
        organizationId: orgId,
        bookingId: unpaidBookingId,
        currency: 'USD',
        subtotalMinor: 10000,
        taxRateBp: 1000,
        taxMinor: 1000,
        totalMinor: 11000,
        depositMinor: 4400,
        balanceMinor: 6600,
        status: 'ISSUED',
      },
    });
    unpaidInvoiceId = unpaidInvoice.id;
  });
});

afterAll(async () => {
  // Guard: real shared PRIMARY org -- never an unscoped delete if setup
  // failed partway through (same precedent as tests/booking-lookup.test.ts).
  if (!orgId || !bookingId || !departureId || !tourPackageId || !touristId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.payment.deleteMany({ where: { invoiceId: paidInvoiceId } }));
  await withOrg(orgId, (tx) => tx.invoice.deleteMany({ where: { id: { in: [paidInvoiceId, unpaidInvoiceId].filter(Boolean) } } }));
  await withOrg(orgId, (tx) => tx.traveler.deleteMany({ where: { bookingId: { in: [bookingId, unpaidBookingId].filter(Boolean) } } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { id: { in: [bookingId, unpaidBookingId].filter(Boolean) } } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { id: departureId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { id: tourPackageId } }));
  await admin.user.delete({ where: { id: touristId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('GET /api/v1/find-booking/invoice-pdf', () => {
  it('downloads the PDF given the correct bookingReference + lastName (200)', async () => {
    const res = await getInvoicePdf(
      req(`http://localhost/api/v1/find-booking/invoice-pdf?bookingReference=${bookingReference}&lastName=Fixture`),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain(bookingReference);
  });

  it('matches the last name case-insensitively, same as the page-level lookup', async () => {
    const res = await getInvoicePdf(
      req(`http://localhost/api/v1/find-booking/invoice-pdf?bookingReference=${bookingReference}&lastName=fixture`),
    );
    expect(res.status).toBe(200);
  });

  it('rejects the wrong last name (404, not a leak of which part was wrong)', async () => {
    const res = await getInvoicePdf(
      req(`http://localhost/api/v1/find-booking/invoice-pdf?bookingReference=${bookingReference}&lastName=WrongName`),
    );
    expect(res.status).toBe(404);
  });

  it('rejects a made-up reference (404)', async () => {
    const res = await getInvoicePdf(
      req(`http://localhost/api/v1/find-booking/invoice-pdf?bookingReference=NOTREAL1&lastName=Fixture`),
    );
    expect(res.status).toBe(404);
  });

  it('404s for a booking whose invoice has never been paid (nothing downloadable yet)', async () => {
    const res = await getInvoicePdf(
      req(`http://localhost/api/v1/find-booking/invoice-pdf?bookingReference=${unpaidBookingReference}&lastName=Fixture`),
    );
    expect(res.status).toBe(404);
  });

  it('rejects a request missing lastName (422)', async () => {
    const res = await getInvoicePdf(req(`http://localhost/api/v1/find-booking/invoice-pdf?bookingReference=${bookingReference}`));
    expect(res.status).toBe(422);
  });
});
