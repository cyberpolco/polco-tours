import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as getInvoice } from '../../src/app/api/v1/bookings/[bookingId]/invoice/route';
import { GET as listPayments, POST as initiatePayment } from '../../src/app/api/v1/invoices/[invoiceId]/payments/route';

/**
 * Anti-BOLA (Vol. 8, API1): RLS only isolates by organizationId -- it does
 * NOT stop one tourist from reaching another tourist's invoice/payments in
 * the same org. That ownership check lives in invoicing/service.ts, same
 * pattern as tests/api/bookings.security.test.ts.
 */
const admin = new PrismaClient();
const country = `SEC${Date.now()}`.slice(0, 10);

let orgId: string;
let bookingId: string;
let invoiceId: string;
let touristAId: string;
let touristBId: string;

beforeAll(async () => {
  await admin.taxRate.create({ data: { country, taxType: 'VAT', rateBp: 1000 } });

  const org = await admin.organization.create({
    data: { name: `INV-SEC-TEST-${Date.now()}`, countries: [country], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [touristA, touristB] = await Promise.all([
    admin.user.create({ data: { email: `inv-sec-a-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `inv-sec-b-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  touristAId = touristA.id;
  touristBId = touristB.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        title: 'Invoicing Security Fixture Safari',
        description: 'Fixture for invoicing anti-BOLA tests.',
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
        status: 'ISSUED',
      },
    });
    invoiceId = invoice.id;
  });
});

afterAll(async () => {
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

describe('anti-BOLA: invoice/payment ownership', () => {
  it("tourist B cannot fetch tourist A's booking invoice (404, not 403)", async () => {
    const headers = await loginAs(touristBId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/invoice`, { headers });
    const res = await getInvoice(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(404);
  });

  it("tourist B cannot list tourist A's invoice payments (404)", async () => {
    const headers = await loginAs(touristBId);
    const req = new NextRequest(`http://localhost/api/v1/invoices/${invoiceId}/payments`, { headers });
    const res = await listPayments(req, { params: Promise.resolve({ invoiceId }) });
    expect(res.status).toBe(404);
  });

  it("tourist B cannot initiate a payment against tourist A's invoice (404)", async () => {
    const headers = await loginAs(touristBId);
    const h = new Headers(headers);
    h.set('Content-Type', 'application/json');
    const req = new NextRequest(`http://localhost/api/v1/invoices/${invoiceId}/payments`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ kind: 'DEPOSIT' }),
    });
    const res = await initiatePayment(req, { params: Promise.resolve({ invoiceId }) });
    expect(res.status).toBe(404);
  });

  it('tourist A can fetch their own booking invoice (200)', async () => {
    const headers = await loginAs(touristAId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/invoice`, { headers });
    const res = await getInvoice(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
  });
});
