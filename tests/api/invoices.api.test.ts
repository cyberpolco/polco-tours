import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { testPackageReference } from '../helpers/package-reference';
import { NextRequest } from 'next/server';
import { PrismaClient, type BookingStatus } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { getEffectivePlatformRate } from '../../src/lib/platform-rate';
import { loginAs } from '../helpers/test-auth';
import { generateBookingReference } from '../../src/modules/booking';

// PlatformRate (DR-042) is platform-wide, mutable-over-time config, not
// something this file seeds itself -- reading the LIVE effective rate here
// (rather than assuming whatever seed.ts's one-time default happened to be)
// keeps this suite correct regardless of what any other session has set it
// to since. Mirrors invoicing/domain.ts's computeInvoiceAmounts (DR-127) by
// hand rather than importing it, so this stays an independent check.
function expectedAmounts(subtotalMinor: number, taxRateBp: number, platformFeeRateBp: number) {
  const taxMinor = Math.round((subtotalMinor * taxRateBp) / 10000);
  const preFeeTotal = subtotalMinor + taxMinor;
  const platformFeeMinor = Math.round((preFeeTotal * platformFeeRateBp) / 10000);
  const totalMinor = preFeeTotal + platformFeeMinor;
  const depositMinor = Math.round(totalMinor * 0.3);
  const balanceMinor = totalMinor - depositMinor;
  return { taxMinor, platformFeeMinor, totalMinor, depositMinor, balanceMinor };
}

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
const { GET: getInvoicePdf } = await import('../../src/app/api/v1/bookings/[bookingId]/invoice/pdf/route');
const { GET: listPayments, POST: initiatePayment } = await import('../../src/app/api/v1/invoices/[invoiceId]/payments/route');
const { POST: resolvePayment } = await import('../../src/app/api/v1/payments/[paymentId]/resolve/route');
const { POST: applyCoupon, DELETE: removeCoupon } = await import('../../src/app/api/v1/invoices/[invoiceId]/coupon/route');

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
let platformFeeRateBp: number;
let expected: ReturnType<typeof expectedAmounts>;
// DR-104 coupon test codes -- collected here so afterAll can clean up every
// one regardless of which `it` created it.
const couponCodes: string[] = [];

function jsonRequest(method: string, url: string, headers: Headers, body?: unknown): NextRequest {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  await admin.taxRate.create({ data: { country, taxType: 'VAT', rateBp: 1000 } }); // 10%
  ({ rateBp: platformFeeRateBp } = await getEffectivePlatformRate());
  expected = expectedAmounts(10000, 1000, platformFeeRateBp);

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
        status: 'PUBLISHED_AVAILABLE',
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
  if (couponCodes.length > 0) {
    const coupons = await admin.coupon.findMany({ where: { code: { in: couponCodes } } });
    await admin.couponRedemption.deleteMany({ where: { couponId: { in: coupons.map((c) => c.id) } } });
    await admin.coupon.deleteMany({ where: { code: { in: couponCodes } } });
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
    expect(body.invoice.taxMinor).toBe(expected.taxMinor);
    // Settings module (DR-042; additive since DR-127): platformFeeMinor is
    // charged to the customer on top -- totalMinor/depositMinor/balanceMinor
    // below all include it. Rate/amounts computed from whatever PlatformRate
    // is actually live (see expectedAmounts above), not a hardcoded guess.
    expect(body.invoice.platformFeeRateBp).toBe(platformFeeRateBp);
    expect(body.invoice.platformFeeMinor).toBe(expected.platformFeeMinor);
    expect(body.invoice.totalMinor).toBe(expected.totalMinor);
    expect(body.invoice.depositMinor).toBe(expected.depositMinor);
    expect(body.invoice.balanceMinor).toBe(expected.balanceMinor);
    expect(body.invoice.status).toBe('ISSUED');
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

// DR-169.
describe('GET /api/v1/bookings/:bookingId/invoice/pdf', () => {
  it('rejects downloading before any payment has succeeded (409)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('GET', `http://localhost/api/v1/bookings/${bookingId}/invoice/pdf`, headers);
    const res = await getInvoicePdf(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(409);
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
    expect(body.payment.amountMinor).toBe(expected.depositMinor);
    expect(typeof body.redirectUrl).toBe('string');
    // Proves the auto-succeed step's notify() call actually fired -- not a
    // real network call (mocked at the top of this file).
    expect(notificationSendMock).toHaveBeenCalled();
    // DR-250: PAYMENT_SUCCEEDED's EMAIL send (the most recent call at this
    // point -- it's the last thing applyPaymentOutcome does before this
    // route returns) attaches the invoice PDF as a real Buffer, now that
    // the invoice is PARTIALLY_PAID (canDownloadInvoicePdf allows it).
    expect(notificationSendMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attachments: [expect.objectContaining({ filename: expect.stringMatching(/-invoice-en\.pdf$/), content: expect.any(Buffer) })],
      }),
    );

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

// DR-169: the invoice is PARTIALLY_PAID at this point in the file (the
// deposit leg above just succeeded) -- the balance is still outstanding.
describe('GET /api/v1/bookings/:bookingId/invoice/pdf (PARTIALLY_PAID)', () => {
  it('downloads the invoice PDF once the deposit has succeeded (200)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('GET', `http://localhost/api/v1/bookings/${bookingId}/invoice/pdf`, headers);
    const res = await getInvoicePdf(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    const disposition = res.headers.get('Content-Disposition') ?? '';
    expect(disposition).toContain('invoice-en.pdf');
  });

  it('serves the French locale via ?locale=fr (200)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('GET', `http://localhost/api/v1/bookings/${bookingId}/invoice/pdf?locale=fr`, headers);
    const res = await getInvoicePdf(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('invoice-fr.pdf');
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
    expect(body.payment.amountMinor).toBe(expected.balanceMinor);
    // DR-250: now PAID -- the attached filename says "receipt", not "invoice".
    expect(notificationSendMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attachments: [expect.objectContaining({ filename: expect.stringMatching(/-receipt-en\.pdf$/), content: expect.any(Buffer) })],
      }),
    );

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

// DR-169: the invoice is PAID at this point in the file (the balance leg
// above just succeeded) -- filename/heading switch to "receipt".
describe('GET /api/v1/bookings/:bookingId/invoice/pdf (PAID)', () => {
  it('downloads the receipt PDF once fully settled (200)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('GET', `http://localhost/api/v1/bookings/${bookingId}/invoice/pdf`, headers);
    const res = await getInvoicePdf(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('receipt-en.pdf');
  });
});

// DR-104. Reuses the same departure/package/tax setup from the outer
// beforeAll, but each test in this block gets its OWN fresh booking+invoice
// (via the real GET /invoice endpoint, not a raw fixture) so applying a
// coupon here never touches invoiceId above, which is already PAID by this
// point in the file.
async function createFreshInvoice(touristUserId: string, bookingStatus: BookingStatus = 'AWAITING_DEPOSIT'): Promise<string> {
  return withOrg(orgId, async (tx) => {
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId: (await tx.departure.findFirstOrThrow({ where: { organizationId: orgId } })).id,
        touristUserId,
        bookingReference: generateBookingReference(),
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
        status: bookingStatus,
        addonsFinalizedAt: new Date(),
      },
    });
    const invoice = await tx.invoice.create({
      data: {
        organizationId: orgId,
        bookingId: booking.id,
        currency: 'USD',
        subtotalMinor: 10000,
        taxRateBp: 1000,
        taxMinor: 1000,
        totalMinor: 11000,
        depositMinor: 3300,
        balanceMinor: 7700,
        status: 'ISSUED',
      },
    });
    return invoice.id;
  });
}

describe('POST/DELETE /api/v1/invoices/:invoiceId/coupon', () => {
  it('applies a coupon and recomputes discount/tax/total/deposit/balance', async () => {
    const code = `TEST-APPLY-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    couponCodes.push(code);
    await admin.coupon.create({ data: { code, discountBp: 1500 } }); // 15%

    const freshInvoiceId = await createFreshInvoice(touristAId);
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/invoices/${freshInvoiceId}/coupon`, headers, { code });
    const res = await applyCoupon(req, { params: Promise.resolve({ invoiceId: freshInvoiceId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    // subtotal 10000, 15% off -> discount 1500, discounted subtotal 8500;
    // tax is 10% of 8500 (850), not 10% of 10000.
    expect(body.invoice.couponCode).toBe(code);
    expect(body.invoice.discountMinor).toBe(1500);
    expect(body.invoice.taxMinor).toBe(850);
    expect(body.invoice.totalMinor).toBe(9350);
    expect(body.invoice.depositMinor).toBe(2805);
    expect(body.invoice.balanceMinor).toBe(6545);
  });

  it('removing a coupon reverts to the exact pre-coupon values', async () => {
    const code = `TEST-REMOVE-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    couponCodes.push(code);
    await admin.coupon.create({ data: { code, discountBp: 1500 } });

    const freshInvoiceId = await createFreshInvoice(touristAId);
    const headers = await loginAs(touristAId);
    const applyReq = jsonRequest('POST', `http://localhost/api/v1/invoices/${freshInvoiceId}/coupon`, headers, { code });
    await applyCoupon(applyReq, { params: Promise.resolve({ invoiceId: freshInvoiceId }) });

    const removeHeaders = await loginAs(touristAId);
    const removeReq = jsonRequest('DELETE', `http://localhost/api/v1/invoices/${freshInvoiceId}/coupon`, removeHeaders);
    const res = await removeCoupon(removeReq, { params: Promise.resolve({ invoiceId: freshInvoiceId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invoice.couponCode).toBeNull();
    expect(body.invoice.discountMinor).toBe(0);
    expect(body.invoice.taxMinor).toBe(1000);
    expect(body.invoice.totalMinor).toBe(11000);
    expect(body.invoice.depositMinor).toBe(3300);
    expect(body.invoice.balanceMinor).toBe(7700);
  });

  it('rejects an unknown coupon code (404)', async () => {
    const freshInvoiceId = await createFreshInvoice(touristAId);
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/invoices/${freshInvoiceId}/coupon`, headers, {
      code: 'NOT-A-REAL-CODE',
    });
    const res = await applyCoupon(req, { params: Promise.resolve({ invoiceId: freshInvoiceId }) });
    expect(res.status).toBe(404);
  });

  it('rejects an expired coupon (409)', async () => {
    const code = `TEST-EXPIRED-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    couponCodes.push(code);
    await admin.coupon.create({ data: { code, discountBp: 1000, expiresAt: new Date('2020-01-01') } });

    const freshInvoiceId = await createFreshInvoice(touristAId);
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/invoices/${freshInvoiceId}/coupon`, headers, { code });
    const res = await applyCoupon(req, { params: Promise.resolve({ invoiceId: freshInvoiceId }) });
    expect(res.status).toBe(409);
  });

  it('enforces a maxRedemptions cap across two different invoices', async () => {
    const code = `TEST-CAP-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    couponCodes.push(code);
    await admin.coupon.create({ data: { code, discountBp: 1000, maxRedemptions: 1 } });

    const invoiceAId = await createFreshInvoice(touristAId);
    const invoiceBId = await createFreshInvoice(touristBId);

    const firstReq = jsonRequest('POST', `http://localhost/api/v1/invoices/${invoiceAId}/coupon`, await loginAs(touristAId), {
      code,
    });
    const firstRes = await applyCoupon(firstReq, { params: Promise.resolve({ invoiceId: invoiceAId }) });
    expect(firstRes.status).toBe(200);

    const secondReq = jsonRequest('POST', `http://localhost/api/v1/invoices/${invoiceBId}/coupon`, await loginAs(touristBId), {
      code,
    });
    const secondRes = await applyCoupon(secondReq, { params: Promise.resolve({ invoiceId: invoiceBId }) });
    expect(secondRes.status).toBe(409);
  });

  // Exercises the SELECT ... FOR UPDATE lock in invoicing/repository.ts's
  // applyCoupon -- without it, both concurrent requests could read
  // "count < cap" as true before either inserts its CouponRedemption row.
  it('handles concurrent applies of a single-use coupon -- exactly one succeeds', async () => {
    const code = `TEST-RACE-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    couponCodes.push(code);
    await admin.coupon.create({ data: { code, discountBp: 1000, maxRedemptions: 1 } });

    const invoiceAId = await createFreshInvoice(touristAId);
    const invoiceBId = await createFreshInvoice(touristBId);

    const [resA, resB] = await Promise.all([
      applyCoupon(
        jsonRequest('POST', `http://localhost/api/v1/invoices/${invoiceAId}/coupon`, await loginAs(touristAId), { code }),
        { params: Promise.resolve({ invoiceId: invoiceAId }) },
      ),
      applyCoupon(
        jsonRequest('POST', `http://localhost/api/v1/invoices/${invoiceBId}/coupon`, await loginAs(touristBId), { code }),
        { params: Promise.resolve({ invoiceId: invoiceBId }) },
      ),
    ]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('blocks applying/removing a coupon once a payment has succeeded on the invoice (409)', async () => {
    // Reuses the outer-scope invoiceId, which is already PAID by the end of
    // the payments describe block above (declaration order matters in this
    // file -- see the header comment).
    const code = `TEST-PAID-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    couponCodes.push(code);
    await admin.coupon.create({ data: { code, discountBp: 1000 } });

    const applyRes = await applyCoupon(
      jsonRequest('POST', `http://localhost/api/v1/invoices/${invoiceId}/coupon`, await loginAs(touristAId), { code }),
      { params: Promise.resolve({ invoiceId }) },
    );
    expect(applyRes.status).toBe(409);

    const removeRes = await removeCoupon(
      jsonRequest('DELETE', `http://localhost/api/v1/invoices/${invoiceId}/coupon`, await loginAs(touristAId)),
      { params: Promise.resolve({ invoiceId }) },
    );
    expect(removeRes.status).toBe(409);
  });

  // DR-105: a CANCELLED/REFUNDED booking never had a SUCCEEDED payment on
  // this fresh invoice, so this exercises the new booking-status guard
  // specifically, not the pre-existing SUCCEEDED-payment one above.
  it.each(['COMPLETED', 'CANCELLED', 'REFUNDED'] as const)(
    'blocks applying/removing a coupon once the booking is %s (409)',
    async (status) => {
      const code = `TEST-LOCKED-${status}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      couponCodes.push(code);
      await admin.coupon.create({ data: { code, discountBp: 1000 } });

      const freshInvoiceId = await createFreshInvoice(touristAId, status);
      const headers = await loginAs(touristAId);

      const applyRes = await applyCoupon(
        jsonRequest('POST', `http://localhost/api/v1/invoices/${freshInvoiceId}/coupon`, headers, { code }),
        { params: Promise.resolve({ invoiceId: freshInvoiceId }) },
      );
      expect(applyRes.status).toBe(409);

      const removeRes = await removeCoupon(
        jsonRequest('DELETE', `http://localhost/api/v1/invoices/${freshInvoiceId}/coupon`, await loginAs(touristAId)),
        { params: Promise.resolve({ invoiceId: freshInvoiceId }) },
      );
      expect(removeRes.status).toBe(409);
    },
  );
});
