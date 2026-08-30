import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { testPackageReference } from '../helpers/package-reference';
import { withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { generateBookingReference } from '../../src/modules/booking';

// Same convention as tests/api/invoices.api.test.ts -- without this,
// applyPaymentOutcome's notify() call on a successful FULL payment would
// attempt a real SMS/email/WhatsApp send.
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

const { POST: initiatePayment } = await import('../../src/app/api/v1/invoices/[invoiceId]/payments/route');

/**
 * DR-198: server-side enforcement that a late-booking invoice
 * (depositAllowed: false) can never actually take a DEPOSIT payment, even
 * via a direct route call bypassing whatever the guest checkout UI hides --
 * this is the real gate (invoicing/domain.ts's canInitiatePayment), not just
 * a UI affordance. A fresh, isolated fixture (own org/booking/invoice), not
 * sharing tests/api/invoices.api.test.ts's -- that suite's whole fixture
 * predates this column and stays on the normal depositAllowed: true path.
 */
const admin = new PrismaClient();
const country = `LBP${Date.now()}`.slice(0, 10);

let orgId: string;
let invoiceId: string;
let touristHeaders: Headers;

function jsonRequest(url: string, headers: Headers, body: unknown): NextRequest {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `LBP-API-TEST-${Date.now()}`, countries: [country], status: 'VERIFIED' },
  });
  orgId = org.id;

  const tourist = await admin.user.create({
    data: { email: `lbp-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId },
  });
  touristHeaders = await loginAs(tourist.id);

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: 'Late Booking Fixture Safari',
        description: 'Fixture for the DR-198 payment-gating test.',
        country,
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED_AVAILABLE',
      },
    });
    // Travel date is irrelevant here -- lateBookingSurchargeBp is snapshotted
    // at booking-creation time by bookingService, this fixture sets the
    // already-decided outcome directly to isolate the payment-gating check.
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), capacity: 5, status: 'SCHEDULED' },
    });
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId: departure.id,
        touristUserId: tourist.id,
        bookingReference: generateBookingReference(),
        seats: 1,
        priceMinor: 10500,
        currency: 'USD',
        status: 'AWAITING_DEPOSIT',
        lateBookingSurchargeBp: 500,
      },
    });

    const invoice = await tx.invoice.create({
      data: {
        organizationId: orgId,
        bookingId: booking.id,
        currency: 'USD',
        subtotalMinor: 10000,
        taxRateBp: 0,
        taxMinor: 0,
        totalMinor: 10500,
        depositMinor: 10500,
        balanceMinor: 0,
        lateBookingSurchargeMinor: 500,
        lateBookingSurchargeRateBp: 500,
        depositAllowed: false,
        status: 'ISSUED',
      },
    });
    invoiceId = invoice.id;
  });
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    return;
  }
  await admin.payment.deleteMany({ where: { organizationId: orgId } });
  await admin.invoice.deleteMany({ where: { organizationId: orgId } });
  await admin.booking.deleteMany({ where: { organizationId: orgId } });
  await admin.departure.deleteMany({ where: { organizationId: orgId } });
  await admin.tourPackage.deleteMany({ where: { organizationId: orgId } });
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
});

describe('POST /api/v1/invoices/:invoiceId/payments (DR-198 late-booking gate)', () => {
  it('rejects a DEPOSIT payment on a depositAllowed: false invoice (409), regardless of what the UI shows', async () => {
    const req = jsonRequest(`http://localhost/api/v1/invoices/${invoiceId}/payments`, touristHeaders, { kind: 'DEPOSIT' });
    const res = await initiatePayment(req, { params: Promise.resolve({ invoiceId }) });
    expect(res.status).toBe(409);
  });

  it('still allows FULL on the same depositAllowed: false invoice', async () => {
    const req = jsonRequest(`http://localhost/api/v1/invoices/${invoiceId}/payments`, touristHeaders, { kind: 'FULL' });
    const res = await initiatePayment(req, { params: Promise.resolve({ invoiceId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.payment.kind).toBe('FULL');
    expect(body.payment.amountMinor).toBe(10500);
  });
});
