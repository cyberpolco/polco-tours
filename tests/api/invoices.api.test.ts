import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as getInvoice } from '../../src/app/api/v1/bookings/[bookingId]/invoice/route';
import { GET as listPayments, POST as initiatePayment } from '../../src/app/api/v1/invoices/[invoiceId]/payments/route';
import { POST as resolvePayment } from '../../src/app/api/v1/payments/[paymentId]/resolve/route';

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
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
      },
    });
    bookingId = booking.id;
  });
});

afterAll(async () => {
  await withOrg(orgId, (tx) => tx.payment.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.invoice.deleteMany({ where: { organizationId: orgId } }));
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

  it('initiates the DEPOSIT leg (201, PENDING, fake redirect)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/invoices/${invoiceId}/payments`, headers, { kind: 'DEPOSIT' });
    const res = await initiatePayment(req, { params: Promise.resolve({ invoiceId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    depositPaymentId = body.payment.id;
    expect(body.payment.status).toBe('PENDING');
    expect(body.payment.kind).toBe('DEPOSIT');
    expect(body.payment.amountMinor).toBe(4400);
    expect(typeof body.redirectUrl).toBe('string');
  });

  it('rejects re-initiating DEPOSIT while one is already outstanding (409)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/invoices/${invoiceId}/payments`, headers, { kind: 'DEPOSIT' });
    const res = await initiatePayment(req, { params: Promise.resolve({ invoiceId }) });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/v1/payments/:paymentId/resolve', () => {
  it('rejects a TOURIST resolving their own payment (403 -- staff only)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/payments/${depositPaymentId}/resolve`, headers, {
      outcome: 'SUCCEEDED',
    });
    const res = await resolvePayment(req, { params: Promise.resolve({ paymentId: depositPaymentId }) });
    expect(res.status).toBe(403);
  });

  it('staff resolves the deposit to SUCCEEDED -- invoice moves to PARTIALLY_PAID (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest('POST', `http://localhost/api/v1/payments/${depositPaymentId}/resolve`, headers, {
      outcome: 'SUCCEEDED',
    });
    const res = await resolvePayment(req, { params: Promise.resolve({ paymentId: depositPaymentId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payment.status).toBe('SUCCEEDED');
    expect(body.invoice.status).toBe('PARTIALLY_PAID');
    // touristUserId is resolved internally to notify the recipient (DR-013)
    // but must never leak into this endpoint's response contract.
    expect(body).not.toHaveProperty('touristUserId');

    // No provider credentials exist in this environment (OI-05/06/07) --
    // notify() falls through every channel and audits the exhaustion,
    // without the response above being slowed down or failed. audit_logs
    // is RLS-protected (rls.sql) even for reads, so this must go through
    // withOrg, not the raw admin client.
    const notified = await withOrg(orgId, (tx) =>
      tx.auditLog.findFirst({
        where: { organizationId: orgId, action: 'notification.failed', resourceType: 'Notification' },
      }),
    );
    expect(notified).not.toBeNull();
  });

  it('now allows initiating the BALANCE leg (201)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/invoices/${invoiceId}/payments`, headers, { kind: 'BALANCE' });
    const res = await initiatePayment(req, { params: Promise.resolve({ invoiceId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.payment.amountMinor).toBe(6600);

    const resolveHeaders = await loginAs(operatorId);
    const resolveReq = jsonRequest('POST', `http://localhost/api/v1/payments/${body.payment.id}/resolve`, resolveHeaders, {
      outcome: 'SUCCEEDED',
    });
    const resolveRes = await resolvePayment(resolveReq, { params: Promise.resolve({ paymentId: body.payment.id }) });
    expect(resolveRes.status).toBe(200);
    const resolveBody = await resolveRes.json();
    expect(resolveBody.invoice.status).toBe('PAID');
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
