import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { testPackageReference } from '../helpers/package-reference';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { generateBookingReference } from '../../src/modules/booking';

// Real RESEND_API_KEY/AFRICAS_TALKING_* credentials now exist in .env/.env.local
// (2026-07-15) and Vitest loads .env automatically -- without this mock,
// resolvePayment's notify() call below would attempt a REAL SMS/email send
// every test run. Same vi.hoisted + vi.mock convention as the documents
// blob-gateway mock (tests/api/booking-setup.api.test.ts).
const { notificationSendMock } = vi.hoisted(() => ({
  notificationSendMock: vi.fn(async () => ({ providerRef: 'test-provider-ref' })),
}));
vi.mock('@modules/notifications/gateway', () => ({
  gateways: {
    WHATSAPP: { send: notificationSendMock },
    SMS: { send: notificationSendMock },
    EMAIL: { send: notificationSendMock },
  },
  ChannelUnavailableError: class ChannelUnavailableError extends Error {},
}));

const { GET: getInvoice } = await import('../../src/app/api/v1/bookings/[bookingId]/invoice/route');
const { GET: listPayments, POST: initiatePayment } = await import('../../src/app/api/v1/invoices/[invoiceId]/payments/route');
const { POST: resolvePayment } = await import('../../src/app/api/v1/payments/[paymentId]/resolve/route');

/**
 * Route-handler-level tests (DR-012) against real Postgres, same pattern as
 * tests/api/bookings.api.test.ts. Tests run in declaration order within this
 * file (Vitest default + vitest.config.ts disables cross-file parallelism)
 * -- later cases deliberately depend on earlier ones (deposit must succeed
 * before the balance leg can be initiated/resolved).
 */
const admin = new PrismaClient();

// 10% VAT on a unique fake country isolates the expected math from whatever
// real DRC/Namibia rates the seed script may or may not have inserted.
const country = `INV${Date.now()}`.slice(0, 10);

let orgId: string;
let bookingId: string;
let invoiceId: string;
let depositPaymentId: string;
let touristAId: string;
let touristBId: string;
let operatorId: string;
let guideId: string;

function jsonRequest(method: string, url: string, headers: Headers, body?: unknown): NextRequest {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  await admin.taxRate.create({ data: { country, taxType: 'VAT', rateBp: 1000 } }); // 10%

  const org = await admin.organization.create({
    data: { name: `INV-API-TEST-${Date.now()}`, countries: [country], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [touristA, touristB, operator, guide] = await Promise.all([
    admin.user.create({ data: { email: `inv-a-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `inv-b-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `inv-op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `inv-g-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
  ]);
  touristAId = touristA.id;
  touristBId = touristB.id;
  operatorId = operator.id;
  guideId = guide.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: 'Invoicing Fixture Safari',
        description: 'Fixture for invoicing API tests.',
        country,
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), capacity: 5, status: 'SCHEDULED' },
    });
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId: departure.id,
        touristUserId: touristAId,
        bookingReference: generateBookingReference(),
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
        // Raw fixture, not created via bookingService.createHold -- must set
        // this explicitly to match what a real hold produces, since payment
        // resolution (recordPaymentReceived) requires transitioning FROM
        // AWAITING_DEPOSIT, not the schema default of DRAFT.
        status: 'AWAITING_DEPOSIT',
      },
    });
    bookingId = booking.id;

    // DR-015: invoicing now gates on the traveler manifest + finalized
    // add-ons (bookingService.getBillableTotal) -- seed a complete one
    // directly (raw fixture, not through the wizard) so this file keeps
    // testing invoicing/payments, not the booking-setup wizard itself.
    const passport = await tx.document.create({
      data: {
        organizationId: orgId,
        kind: 'PASSPORT',
        blobPathname: 'fixtures/not-a-real-blob.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1,
        uploadedByUserId: operatorId,
      },
    });
    await tx.traveler.create({
      data: {
        organizationId: orgId,
        bookingId,
        firstName: 'Fixture',
        lastName: 'Traveler',
        age: 30,
        sex: 'X',
        nationality: 'NA',
        idOrPassportNumber: 'FIXTURE123',
        isTourLead: true,
        passportDocumentId: passport.id,
      },
    });
    await tx.booking.update({ where: { id: bookingId }, data: { addonsFinalizedAt: new Date() } });
  });
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
  await withOrg(orgId, (tx) => tx.payment.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.invoice.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.traveler.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.document.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.taxRate.deleteMany({ where: { country } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('GET /api/v1/bookings/:bookingId/invoice', () => {
  it('creates the invoice on first access with correct tax + 40/60 split (200)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('GET', `http://localhost/api/v1/bookings/${bookingId}/invoice`, headers);
    const res = await getInvoice(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    invoiceId = body.invoice.id;
    expect(body.invoice.subtotalMinor).toBe(10000);
    expect(body.invoice.taxRateBp).toBe(1000);
    expect(body.invoice.taxMinor).toBe(1000);
    expect(body.invoice.totalMinor).toBe(11000);
    expect(body.invoice.depositMinor).toBe(4400);
    expect(body.invoice.balanceMinor).toBe(6600);
    expect(body.invoice.status).toBe('ISSUED');
    // Settings module (DR-042): platformFeeMinor is an informational split
    // of totalMinor (5% seeded default) -- depositMinor/balanceMinor/
    // totalMinor above are completely unaffected by its existence.
    expect(body.invoice.platformFeeRateBp).toBe(500);
    expect(body.invoice.platformFeeMinor).toBe(550); // 5% of 11000
  });

  it('is idempotent -- returns the same invoice on a second call', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('GET', `http://localhost/api/v1/bookings/${bookingId}/invoice`, headers);
    const res = await getInvoice(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invoice.id).toBe(invoiceId);
  });
});

describe('POST /api/v1/invoices/:invoiceId/payments', () => {
  it('rejects a role without payment.initiate (403)', async () => {
    const headers = await loginAs(guideId);
    const req = jsonRequest('POST', `http://localhost/api/v1/invoices/${invoiceId}/payments`, headers, { kind: 'DEPOSIT' });
    const res = await initiatePayment(req, { params: Promise.resolve({ invoiceId }) });
    expect(res.status).toBe(403);
  });

  it('rejects initiating the BALANCE leg before the deposit succeeds (409)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/invoices/${invoiceId}/payments`, headers, { kind: 'BALANCE' });
    const res = await initiatePayment(req, { params: Promise.resolve({ invoiceId }) });
    expect(res.status).toBe(409);
  });

  // DR-074: no live DPO integration yet (OI-01), so invoicingService
  // auto-resolves the payment to SUCCEEDED immediately instead of leaving
  // it PENDING for staff to resolve by hand.
  it('initiates and auto-succeeds the DEPOSIT leg (201) -- invoice moves to PARTIALLY_PAID', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/invoices/${invoiceId}/payments`, headers, { kind: 'DEPOSIT' });
    const res = await initiatePayment(req, { params: Promise.resolve({ invoiceId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    depositPaymentId = body.payment.id;
    expect(body.payment.status).toBe('SUCCEEDED');
    expect(body.payment.kind).toBe('DEPOSIT');
    expect(body.payment.amountMinor).toBe(4400);
    expect(typeof body.redirectUrl).toBe('string');
    // Proves the auto-succeed step's notify() call actually fired -- not a
    // real network call (mocked at the top of this file).
    expect(notificationSendMock).toHaveBeenCalled();

    const invoiceHeaders = await loginAs(touristAId);
    const invoiceReq = jsonRequest('GET', `http://localhost/api/v1/bookings/${bookingId}/invoice`, invoiceHeaders);
    const invoiceRes = await getInvoice(invoiceReq, { params: Promise.resolve({ bookingId }) });
    const invoiceBody = await invoiceRes.json();
    expect(invoiceBody.invoice.status).toBe('PARTIALLY_PAID');
  });

  it('rejects re-initiating DEPOSIT since it has already succeeded (409)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/invoices/${invoiceId}/payments`, headers, { kind: 'DEPOSIT' });
    const res = await initiatePayment(req, { params: Promise.resolve({ invoiceId }) });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/v1/payments/:paymentId/resolve', () => {
  // Kept as a manual-override safety net (e.g. a payment PENDING for some
  // other reason) even though the golden path now auto-succeeds -- DR-012's
  // fraud rule (a tourist can't self-resolve their own payment) still
  // applies to this endpoint regardless of the payment's current status.
  it('rejects a TOURIST resolving a payment (403 -- staff only)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/payments/${depositPaymentId}/resolve`, headers, {
      outcome: 'SUCCEEDED',
    });
    const res = await resolvePayment(req, { params: Promise.resolve({ paymentId: depositPaymentId }) });
    expect(res.status).toBe(403);
  });

  it('initiates and auto-succeeds the BALANCE leg (201) -- invoice moves to PAID', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/invoices/${invoiceId}/payments`, headers, { kind: 'BALANCE' });
    const res = await initiatePayment(req, { params: Promise.resolve({ invoiceId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.payment.status).toBe('SUCCEEDED');
    expect(body.payment.amountMinor).toBe(6600);

    const invoiceHeaders = await loginAs(touristAId);
    const invoiceReq = jsonRequest('GET', `http://localhost/api/v1/bookings/${bookingId}/invoice`, invoiceHeaders);
    const invoiceRes = await getInvoice(invoiceReq, { params: Promise.resolve({ bookingId }) });
    const invoiceBody = await invoiceRes.json();
    expect(invoiceBody.invoice.status).toBe('PAID');
  });

  it('lists both payment attempts for the invoice (200)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('GET', `http://localhost/api/v1/invoices/${invoiceId}/payments`, headers);
    const res = await listPayments(req, { params: Promise.resolve({ invoiceId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payments).toHaveLength(2);
    expect(body.payments.every((p: { status: string }) => p.status === 'SUCCEEDED')).toBe(true);
  });
});
