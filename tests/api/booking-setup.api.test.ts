import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { generateConfirmationCode } from '../../src/modules/booking';

// Vercel Blob needs a real BLOB_READ_WRITE_TOKEN this repo's CI does not
// provision (same category of gap as OI-05/06/07 for notification
// providers) -- mock only the network-touching gateway boundary so this
// still exercises the real route/service/repository/RLS path against
// Postgres, same spirit as invoicing's StubDpoGateway but at the test edge
// instead of in production code (DR-015 wires up the *real* adapter).
const { uploadMock, downloadMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(async (pathname: string) => ({ pathname })),
  downloadMock: vi.fn(async () => ({
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('%PDF-fixture'));
        controller.close();
      },
    }),
  })),
}));
vi.mock('@modules/documents/gateway', () => ({
  blobGateway: { upload: uploadMock, download: downloadMock },
  BlobGatewayError: class BlobGatewayError extends Error {},
}));

const { GET: getBooking } = await import('../../src/app/api/v1/bookings/[bookingId]/route');
const { GET: getInvoice } = await import('../../src/app/api/v1/bookings/[bookingId]/invoice/route');
const { GET: listTravelers, POST: addTraveler } = await import('../../src/app/api/v1/bookings/[bookingId]/travelers/route');
const { GET: downloadPassport, POST: uploadPassport } = await import(
  '../../src/app/api/v1/bookings/[bookingId]/travelers/[travelerId]/passport/route'
);
const { POST: setAddons } = await import('../../src/app/api/v1/bookings/[bookingId]/addons/route');

const admin = new PrismaClient();
const country = `SETUP${Date.now()}`.slice(0, 10);

let orgId: string;
let bookingId: string;
let addonServiceId: string;
let touristAId: string;
let guideId: string;
let operatorId: string;
let leadTravelerId: string;

function jsonRequest(method: string, url: string, headers: Headers, body?: unknown): NextRequest {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  await admin.taxRate.create({ data: { country, taxType: 'VAT', rateBp: 1000 } });

  const org = await admin.organization.create({
    data: { name: `SETUP-API-TEST-${Date.now()}`, countries: [country], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [touristA, guide, operator] = await Promise.all([
    admin.user.create({ data: { email: `setup-a-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `setup-g-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
    admin.user.create({ data: { email: `setup-op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
  ]);
  touristAId = touristA.id;
  guideId = guide.id;
  operatorId = operator.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        title: 'Setup Fixture Safari',
        description: 'Fixture for booking-setup API tests.',
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
        confirmationCode: generateConfirmationCode(),
        seats: 2,
        priceMinor: 20000,
        currency: 'USD',
      },
    });
    bookingId = booking.id;
    const addon = await tx.addonService.create({
      data: {
        organizationId: orgId,
        code: 'PHOTOGRAPHY',
        name: 'Photography',
        description: 'Fixture add-on.',
        priceMinor: 5000,
        currency: 'USD',
      },
    });
    addonServiceId = addon.id;
  });
});

afterAll(async () => {
  await withOrg(orgId, (tx) => tx.bookingAddon.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.invoice.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.traveler.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.document.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.addonService.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.taxRate.deleteMany({ where: { country } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('POST /api/v1/bookings/:bookingId/travelers', () => {
  it('rejects a role without booking.create (403)', async () => {
    const headers = await loginAs(guideId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/travelers`, headers, {
      firstName: 'X',
      lastName: 'Y',
      age: 30,
      sex: 'X',
      nationality: 'NA',
      idOrPassportNumber: 'X1',
    });
    const res = await addTraveler(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(403);
  });

  it('adds the first (tour lead) traveler (201)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/travelers`, headers, {
      firstName: 'Lead',
      lastName: 'Traveler',
      age: 35,
      sex: 'F',
      nationality: 'NA',
      idOrPassportNumber: 'LEAD1',
      isTourLead: true,
    });
    const res = await addTraveler(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.traveler.isTourLead).toBe(true);
    leadTravelerId = body.traveler.id;
  });

  it('rejects a second tour lead (409)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/travelers`, headers, {
      firstName: 'Second',
      lastName: 'Lead',
      age: 40,
      sex: 'M',
      nationality: 'CD',
      idOrPassportNumber: 'LEAD2',
      isTourLead: true,
    });
    const res = await addTraveler(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(409);
  });

  it('adds the second (companion) traveler (201)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/travelers`, headers, {
      firstName: 'Companion',
      lastName: 'Traveler',
      age: 28,
      sex: 'M',
      nationality: 'CD',
      idOrPassportNumber: 'COMP1',
    });
    const res = await addTraveler(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(201);
  });

  it('rejects once every seat has a traveler (409)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/travelers`, headers, {
      firstName: 'Extra',
      lastName: 'Traveler',
      age: 22,
      sex: 'X',
      nationality: 'NA',
      idOrPassportNumber: 'EXTRA1',
    });
    const res = await addTraveler(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(409);
  });

  it('lists both travelers (200)', async () => {
    const headers = await loginAs(touristAId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers`, { headers });
    const res = await listTravelers(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.travelers).toHaveLength(2);
  });
});

describe('GET /api/v1/bookings/:bookingId/invoice (gated on setup, DR-015)', () => {
  it('409s while the manifest/passport/add-ons are still incomplete', async () => {
    const headers = await loginAs(touristAId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/invoice`, { headers });
    const res = await getInvoice(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(409);
  });
});

describe('POST/GET /api/v1/bookings/:bookingId/travelers/:travelerId/passport', () => {
  it('uploads the tour lead passport without leaking the blob pathname (201)', async () => {
    const headers = await loginAs(touristAId);
    const formData = new FormData();
    formData.append('passport', new File([new TextEncoder().encode('%PDF-fixture')], 'passport.pdf', { type: 'application/pdf' }));
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${leadTravelerId}/passport`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const res = await uploadPassport(req, { params: Promise.resolve({ bookingId, travelerId: leadTravelerId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.document).not.toHaveProperty('blobPathname');
    expect(uploadMock).toHaveBeenCalledOnce();
  });

  it('streams the passport bytes back and audits the access (200 -- staff only, TOURIST lacks documents.read)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${leadTravelerId}/passport`, {
      headers,
    });
    const res = await downloadPassport(req, { params: Promise.resolve({ bookingId, travelerId: leadTravelerId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    const text = await res.text();
    expect(text).toBe('%PDF-fixture');

    const accessed = await withOrg(orgId, (tx) =>
      tx.auditLog.findFirst({ where: { organizationId: orgId, action: 'document.accessed', resourceType: 'Document' } }),
    );
    expect(accessed).not.toBeNull();
  });
});

describe('POST /api/v1/bookings/:bookingId/addons', () => {
  it('finalizes an add-on selection and gates/unblocks the invoice (200 then 200)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/addons`, headers, {
      addonServiceIds: [addonServiceId],
    });
    const res = await setAddons(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.addons).toHaveLength(1);
    expect(body.addons[0].priceMinor).toBe(5000);

    const invoiceReq = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/invoice`, { headers });
    const invoiceRes = await getInvoice(invoiceReq, { params: Promise.resolve({ bookingId }) });
    expect(invoiceRes.status).toBe(200);
    const invoiceBody = await invoiceRes.json();
    // 20000 (booking) + 5000 (add-on) = 25000 subtotal, 10% VAT -> 2500 tax.
    expect(invoiceBody.invoice.subtotalMinor).toBe(25000);
    expect(invoiceBody.invoice.taxMinor).toBe(2500);
    expect(invoiceBody.invoice.totalMinor).toBe(27500);
  });

  it('confirms the booking now shows the fully set-up state', async () => {
    const headers = await loginAs(touristAId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}`, { headers });
    const res = await getBooking(req, { params: Promise.resolve({ bookingId }) });
    const body = await res.json();
    expect(body.booking.addonsFinalizedAt).not.toBeNull();
  });

  it('rejects an add-on whose currency does not match the booking (409)', async () => {
    const eurAddon = await withOrg(orgId, (tx) =>
      tx.addonService.create({
        data: {
          organizationId: orgId,
          code: 'TRANSLATOR',
          name: 'Translator (EUR)',
          description: 'Currency-mismatch fixture.',
          priceMinor: 1000,
          currency: 'EUR',
        },
      }),
    );
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/addons`, headers, {
      addonServiceIds: [eurAddon.id],
    });
    const res = await setAddons(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(409);
  });
});
