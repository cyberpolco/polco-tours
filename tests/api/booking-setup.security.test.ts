import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { generateConfirmationCode } from '../../src/modules/booking';

// Same rationale as tests/api/booking-setup.api.test.ts -- mock only the
// Vercel Blob network boundary; everything else (route/service/RLS) is real.
vi.mock('@modules/documents/gateway', () => ({
  blobGateway: {
    upload: vi.fn(async (pathname: string) => ({ pathname })),
    download: vi.fn(async () => ({ body: new ReadableStream() })),
  },
  BlobGatewayError: class BlobGatewayError extends Error {},
}));

const { GET: listTravelers, POST: addTraveler } = await import('../../src/app/api/v1/bookings/[bookingId]/travelers/route');
const { GET: downloadPassport, POST: uploadPassport } = await import(
  '../../src/app/api/v1/bookings/[bookingId]/travelers/[travelerId]/passport/route'
);
const { POST: setAddons } = await import('../../src/app/api/v1/bookings/[bookingId]/addons/route');

/**
 * Anti-BOLA (Vol. 8, API1): RLS only isolates by organizationId -- it does
 * NOT stop one tourist from reaching another tourist's booking-setup wizard
 * in the same org. That ownership check lives in booking/service.ts
 * (getOwnedBooking), same pattern as tests/api/bookings.security.test.ts.
 */
const admin = new PrismaClient();

let orgId: string;
let bookingId: string;
let leadTravelerId: string;
let touristAId: string;
let touristBId: string;

function jsonRequest(method: string, url: string, headers: Headers, body?: unknown): NextRequest {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `SETUP-SEC-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [touristA, touristB] = await Promise.all([
    admin.user.create({ data: { email: `setup-sec-a-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `setup-sec-b-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  touristAId = touristA.id;
  touristBId = touristB.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        title: 'Setup Security Fixture Safari',
        description: 'Fixture for booking-setup anti-BOLA tests.',
        country: 'NA',
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
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
      },
    });
    bookingId = booking.id;
    const traveler = await tx.traveler.create({
      data: {
        organizationId: orgId,
        bookingId,
        firstName: 'Lead',
        lastName: 'Traveler',
        age: 30,
        sex: 'X',
        nationality: 'NA',
        idOrPassportNumber: 'LEADSEC1',
        isTourLead: true,
      },
    });
    leadTravelerId = traveler.id;
  });
});

afterAll(async () => {
  await withOrg(orgId, (tx) => tx.bookingAddon.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.traveler.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('anti-BOLA: booking-setup ownership', () => {
  it("tourist B cannot list tourist A's travelers (404)", async () => {
    const headers = await loginAs(touristBId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers`, { headers });
    const res = await listTravelers(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(404);
  });

  it("tourist B cannot add a traveler to tourist A's booking (404)", async () => {
    const headers = await loginAs(touristBId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/travelers`, headers, {
      firstName: 'Hostile',
      lastName: 'Add',
      age: 30,
      sex: 'X',
      nationality: 'NA',
      idOrPassportNumber: 'HOSTILE1',
    });
    const res = await addTraveler(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(404);
  });

  it("tourist B cannot upload a passport for tourist A's traveler (404)", async () => {
    const headers = await loginAs(touristBId);
    const formData = new FormData();
    formData.append('passport', new File([new TextEncoder().encode('%PDF')], 'p.pdf', { type: 'application/pdf' }));
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${leadTravelerId}/passport`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const res = await uploadPassport(req, { params: Promise.resolve({ bookingId, travelerId: leadTravelerId }) });
    expect(res.status).toBe(404);
  });

  it("tourist B cannot download tourist A's passport (403 -- TOURIST lacks documents.read entirely)", async () => {
    const headers = await loginAs(touristBId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${leadTravelerId}/passport`, {
      headers,
    });
    const res = await downloadPassport(req, { params: Promise.resolve({ bookingId, travelerId: leadTravelerId }) });
    expect(res.status).toBe(403);
  });

  it("tourist B cannot finalize add-ons on tourist A's booking (404)", async () => {
    const headers = await loginAs(touristBId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/addons`, headers, { addonServiceIds: [] });
    const res = await setAddons(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(404);
  });

  it('tourist A can list their own travelers (200)', async () => {
    const headers = await loginAs(touristAId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers`, { headers });
    const res = await listTravelers(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
  });
});
