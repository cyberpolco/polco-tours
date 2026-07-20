import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { generateBookingReference } from '@modules/booking';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as getItinerary } from '../../src/app/api/v1/itineraries/[itineraryId]/route';
import { GET as listMine } from '../../src/app/api/v1/itineraries/mine/route';
import { GET as listDays, POST as addDay } from '../../src/app/api/v1/itineraries/[itineraryId]/days/route';

/**
 * Anti-BOLA (Vol. 8, API1) for the DR-033 itinerary module: RLS only
 * isolates by organizationId -- a TOUR_GUIDE/DRIVER assigned to one
 * departure must not be able to read the itinerary of a different,
 * unrelated departure in the SAME org just by guessing/enumerating its id.
 * That scoping lives in itinerary/service.ts's isAssignedToItinerary +
 * getOwnedItinerary, mirrored here the same way
 * tests/api/guides.security.test.ts covers fleet/service.ts's equivalent.
 */
const admin = new PrismaClient();

let orgId: string;
let operatorId: string;
let touristId: string;
let guideId: string; // assigned to departureX only
let unassignedGuideId: string; // never assigned to anything
let itineraryXId: string; // on departureX -- guideId IS assigned here
let itineraryYId: string; // on departureY -- guideId is NOT assigned here
let departureXId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `ITIN-SEC-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, tourist, guide, unassignedGuide] = await Promise.all([
    admin.user.create({ data: { email: `op-itinsec-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `t-itinsec-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `guide-itinsec-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
    admin.user.create({ data: { email: `guide-unassigned-itinsec-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  touristId = tourist.id;
  guideId = guide.id;
  unassignedGuideId = unassignedGuide.id;

  let bookingXId: string;
  let bookingYId: string;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: 'Itinerary Security Fixture Safari',
        description: 'Fixture for itinerary security tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const [departureX, departureY] = await Promise.all([
      tx.departure.create({
        data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), endDate: new Date('2026-09-05'), capacity: 5, status: 'SCHEDULED' },
      }),
      tx.departure.create({
        data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-10-01'), endDate: new Date('2026-10-05'), capacity: 5, status: 'SCHEDULED' },
      }),
    ]);
    departureXId = departureX.id;

    const [bookingX, bookingY] = await Promise.all([
      tx.booking.create({
        data: {
          organizationId: orgId,
          departureId: departureX.id,
          touristUserId: touristId,
          bookingReference: generateBookingReference(),
          seats: 1,
          priceMinor: 10000,
          currency: 'USD',
        },
      }),
      tx.booking.create({
        data: {
          organizationId: orgId,
          departureId: departureY.id,
          touristUserId: touristId,
          bookingReference: generateBookingReference(),
          seats: 1,
          priceMinor: 10000,
          currency: 'USD',
        },
      }),
    ]);
    bookingXId = bookingX.id;
    bookingYId = bookingY.id;
  });

  // Split into a second withOrg call -- Prisma's 5000ms interactive-
  // transaction timeout is measurably too short for this sandbox's real
  // network path to Neon once a beforeAll does this much sequential work in
  // one transaction (documented gotcha, CLAUDE.md; same fix as
  // tests/api/assignment.api.test.ts).
  await withOrg(orgId, async (tx) => {
    const [itineraryX, itineraryY] = await Promise.all([
      tx.itinerary.create({ data: { organizationId: orgId, bookingId: bookingXId } }),
      tx.itinerary.create({ data: { organizationId: orgId, bookingId: bookingYId } }),
    ]);
    itineraryXId = itineraryX.id;
    itineraryYId = itineraryY.id;
  });

  // Split into a third withOrg call -- Prisma's 5000ms interactive-
  // transaction timeout is measurably too short for this sandbox's real
  // network path to Neon once a beforeAll does this much sequential work in
  // one transaction (documented gotcha, CLAUDE.md; same fix as
  // tests/api/assignment.api.test.ts).
  await withOrg(orgId, async (tx) => {
    // guideId is assigned ONLY to departureX -- needs a vehicle + driver too
    // since Assignment requires both (assignment.write's createAssignment
    // shape); the security question here is guide-scoping specifically.
    const vehicle = await tx.vehicle.create({
      data: { organizationId: orgId, plateNumber: `ITINSEC-${Date.now()}`, make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 5, status: 'ACTIVE' },
    });
    const driverUser = await tx.user.create({
      data: { email: `driver-itinsec-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId },
    });
    const driverProfile = await tx.driverProfile.create({
      data: { organizationId: orgId, userId: driverUser.id, licenseNumber: `DL-ITINSEC-${Date.now()}`, status: 'ACTIVE' },
    });
    await tx.assignment.create({
      data: { organizationId: orgId, departureId: departureXId, vehicleId: vehicle.id, driverProfileId: driverProfile.id, guideUserId: guideId },
    });
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
  await withOrg(orgId, (tx) => tx.itineraryDay.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.itinerary.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.assignment.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.vehicle.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('anti-BOLA: itinerary assigned-departure scoping', () => {
  it('a TOUR_GUIDE assigned to departureX can read itineraryX (200)', async () => {
    const headers = await loginAs(guideId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryXId}`, { headers });
    const res = await getItinerary(req, { params: Promise.resolve({ itineraryId: itineraryXId }) });
    expect(res.status).toBe(200);
  });

  it('the same TOUR_GUIDE gets 404 (not 403) for itineraryY on an unrelated departure -- does not leak existence', async () => {
    const headers = await loginAs(guideId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryYId}`, { headers });
    const res = await getItinerary(req, { params: Promise.resolve({ itineraryId: itineraryYId }) });
    expect(res.status).toBe(404);
  });

  it('a TOUR_GUIDE with no assignments at all gets 404 for either itinerary', async () => {
    const headers = await loginAs(unassignedGuideId);
    const reqX = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryXId}`, { headers });
    const resX = await getItinerary(reqX, { params: Promise.resolve({ itineraryId: itineraryXId }) });
    expect(resX.status).toBe(404);

    const headers2 = await loginAs(unassignedGuideId);
    const reqY = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryYId}`, { headers: headers2 });
    const resY = await getItinerary(reqY, { params: Promise.resolve({ itineraryId: itineraryYId }) });
    expect(resY.status).toBe(404);
  });

  it("GET /itineraries/mine only surfaces the guide's own assigned itinerary", async () => {
    const headers = await loginAs(guideId);
    const req = new NextRequest('http://localhost/api/v1/itineraries/mine', { headers });
    const res = await listMine(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itineraries.some((i: { id: string }) => i.id === itineraryXId)).toBe(true);
    expect(body.itineraries.some((i: { id: string }) => i.id === itineraryYId)).toBe(false);
  });

  it('an operator (manager) can read both itineraries regardless of assignment', async () => {
    const headersX = await loginAs(operatorId);
    const resX = await getItinerary(
      new NextRequest(`http://localhost/api/v1/itineraries/${itineraryXId}`, { headers: headersX }),
      { params: Promise.resolve({ itineraryId: itineraryXId }) },
    );
    expect(resX.status).toBe(200);

    const headersY = await loginAs(operatorId);
    const resY = await getItinerary(
      new NextRequest(`http://localhost/api/v1/itineraries/${itineraryYId}`, { headers: headersY }),
      { params: Promise.resolve({ itineraryId: itineraryYId }) },
    );
    expect(resY.status).toBe(200);
  });

  it('a TOUR_GUIDE cannot write to their own assigned itinerary (read-only per the spec, 403)', async () => {
    const headers = await loginAs(guideId);
    const req = jsonRequest(`http://localhost/api/v1/itineraries/${itineraryXId}/days`, headers, 'POST', {
      dayNumber: 1,
      date: '2026-09-01',
    });
    const res = await addDay(req, { params: Promise.resolve({ itineraryId: itineraryXId }) });
    expect(res.status).toBe(403);
  });

  it('a TOUR_GUIDE can read days on their assigned itinerary (200) but 404 on the unrelated one', async () => {
    const headersX = await loginAs(guideId);
    const resX = await listDays(
      new NextRequest(`http://localhost/api/v1/itineraries/${itineraryXId}/days`, { headers: headersX }),
      { params: Promise.resolve({ itineraryId: itineraryXId }) },
    );
    expect(resX.status).toBe(200);

    const headersY = await loginAs(guideId);
    const resY = await listDays(
      new NextRequest(`http://localhost/api/v1/itineraries/${itineraryYId}/days`, { headers: headersY }),
      { params: Promise.resolve({ itineraryId: itineraryYId }) },
    );
    expect(resY.status).toBe(404);
  });

  it('a TOURIST cannot read any itinerary at all (403, no itinerary.read permission)', async () => {
    const headers = await loginAs(touristId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryXId}`, { headers });
    const res = await getItinerary(req, { params: Promise.resolve({ itineraryId: itineraryXId }) });
    expect(res.status).toBe(403);
  });
});
