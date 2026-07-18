import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';

// Same notification-mock convention as tests/api/bookings-v2.api.test.ts.
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

const { POST: createPackage } = await import('../../src/app/api/v1/catalog/packages/route');
const { DELETE: deletePackage, GET: getPackage } = await import('../../src/app/api/v1/catalog/packages/[packageId]/route');
const { POST: duplicatePackage } = await import('../../src/app/api/v1/catalog/packages/[packageId]/duplicate/route');
const { POST: createTailorMade } = await import('../../src/app/api/v1/bookings/tailor-made/route');
const { POST: sendQuotation } = await import('../../src/app/api/v1/bookings/[bookingId]/quotation/route');
const { POST: convertToItinerary } = await import('../../src/app/api/v1/bookings/[bookingId]/convert-to-itinerary/route');
const { POST: createAssignment } = await import('../../src/app/api/v1/departures/[departureId]/assignments/route');

const admin = new PrismaClient();

let orgId: string;
let operatorId: string;
let touristId: string;
let vehicleId: string;
let driverProfileId: string;

function jsonRequest(url: string, headers: Headers, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method: 'POST', headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `PACKAGES-V2-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, tourist] = await Promise.all([
    admin.user.create({ data: { email: `pkgv2-op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `pkgv2-t-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  touristId = tourist.id;

  await withOrg(orgId, async (tx) => {
    const vehicle = await tx.vehicle.create({
      data: { organizationId: orgId, plateNumber: 'PKGV2-1', make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 5, status: 'ACTIVE' },
    });
    vehicleId = vehicle.id;
    const driverUser = await tx.user.create({
      data: { email: `pkgv2-driver-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId },
    });
    const driverProfile = await tx.driverProfile.create({
      data: { organizationId: orgId, userId: driverUser.id, licenseNumber: 'PKGV2-DL', status: 'ACTIVE' },
    });
    driverProfileId = driverProfile.id;
  });
}, 30_000);

afterAll(async () => {
  // Guard against the undefined-id-wipes-a-table class of bug (this exact
  // pattern caused a real incident this session): if beforeAll never
  // finished, orgId is undefined and admin.user.deleteMany's raw (non-RLS,
  // users has no policy) filter would silently become an unscoped
  // deleteMany({}) -- skip the deletion entirely rather than risk that.
  if (orgId) {
    await withOrg(orgId, (tx) => tx.assignment.deleteMany({ where: { organizationId: orgId } }));
    await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
    await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
    await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
    await withOrg(orgId, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: orgId } }));
    await withOrg(orgId, (tx) => tx.vehicle.deleteMany({ where: { organizationId: orgId } }));
    await admin.user.deleteMany({ where: { organizationId: orgId } });
    await admin.organization.delete({ where: { id: orgId } });
  }
  await admin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('package CRUD (DR-028)', () => {
  let packageId: string;

  it('creates a package with a PKG-##### reference (201)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest('http://localhost/api/v1/catalog/packages', headers, {
      title: 'V2 Test Safari',
      description: 'Fixture package.',
      country: 'NA',
      priceMinor: 50000,
      currency: 'USD',
    });
    const res = await createPackage(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.package.packageReference).toMatch(/^PKG-\d{5,}$/);
    expect(body.package.status).toBe('DRAFT');
    packageId = body.package.id;
  }, 30_000);

  it('duplicates the package as a new DRAFT with a fresh reference (201)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/catalog/packages/${packageId}/duplicate`, headers, undefined);
    const res = await duplicatePackage(req, { params: Promise.resolve({ packageId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.package.id).not.toBe(packageId);
    expect(body.package.packageReference).not.toBe(undefined);
    expect(body.package.title).toBe('V2 Test Safari');
    expect(body.package.status).toBe('DRAFT');
  }, 30_000);

  it('soft-deletes the package (204), then it 404s', async () => {
    const headers = await loginAs(operatorId);
    const delReq = new NextRequest(`http://localhost/api/v1/catalog/packages/${packageId}`, { method: 'DELETE', headers });
    const delRes = await deletePackage(delReq, { params: Promise.resolve({ packageId }) });
    expect(delRes.status).toBe(204);

    const getReq = new NextRequest(`http://localhost/api/v1/catalog/packages/${packageId}`, { headers });
    const getRes = await getPackage(getReq, { params: Promise.resolve({ packageId }) });
    expect(getRes.status).toBe(404);
  }, 30_000);
});

describe('tailor-made booking -> operational itinerary -> resource assignment (DR-028)', () => {
  it('converts a priced TAILOR_MADE booking into a real Departure that Assignment can attach to', async () => {
    const touristHeaders = await loginAs(touristId);
    const createReq = jsonRequest('http://localhost/api/v1/bookings/tailor-made', touristHeaders, {
      countries: ['NA'],
      email: `itinerary-bridge-${Date.now()}@example.test`,
      customTravelStart: '2027-04-01',
      customTravelEnd: '2027-04-05',
      seats: 2,
      customDescription: 'Itinerary-bridge fixture trip.',
    });
    const createRes = await createTailorMade(createReq, { params: Promise.resolve({}) });
    expect(createRes.status).toBe(201);
    const bookingId = (await createRes.json()).booking.id;

    const opHeaders = await loginAs(operatorId);
    const quoteReq = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/quotation`, opHeaders, {
      priceMinor: 200000,
      currency: 'USD',
    });
    const quoteRes = await sendQuotation(quoteReq, { params: Promise.resolve({ bookingId }) });
    expect(quoteRes.status).toBe(200);

    const convertReq = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/convert-to-itinerary`, opHeaders, undefined);
    const convertRes = await convertToItinerary(convertReq, { params: Promise.resolve({ bookingId }) });
    expect(convertRes.status).toBe(200);
    const converted = (await convertRes.json()).booking;
    expect(converted.departureId).not.toBeNull();

    const assignReq = jsonRequest(
      `http://localhost/api/v1/departures/${converted.departureId}/assignments`,
      opHeaders,
      { vehicleId, driverProfileId },
    );
    const assignRes = await createAssignment(assignReq, { params: Promise.resolve({ departureId: converted.departureId }) });
    expect(assignRes.status).toBe(201);
    const assignment = (await assignRes.json()).assignment;
    expect(assignment.departureId).toBe(converted.departureId);
  }, 60_000);
});
