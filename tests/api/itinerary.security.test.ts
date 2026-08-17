import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { testPackageReference } from '../helpers/package-reference';
import { generateBookingReference } from '@modules/booking';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as getItinerary } from '../../src/app/api/v1/itineraries/[itineraryId]/route';
import { GET as listMine } from '../../src/app/api/v1/itineraries/mine/route';
import { GET as listDays, POST as addDay } from '../../src/app/api/v1/itineraries/[itineraryId]/days/route';
import { GET as mapOverview } from '../../src/app/api/v1/itineraries/map-overview/route';
import { GET as mapPdf } from '../../src/app/api/v1/itineraries/[itineraryId]/days/[dayId]/map-pdf/route';
import { GET as summaryPdf } from '../../src/app/api/v1/itineraries/[itineraryId]/summary-pdf/route';

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
let bookingReferenceX: string; // DR-089: map tab tests key off the reference, not the raw id
let bookingReferenceY: string;
let dayXId: string;
let dayYId: string;

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
        packageReference: testPackageReference(),
        title: 'Itinerary Security Fixture Safari',
        description: 'Fixture for itinerary security tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED_AVAILABLE',
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
    bookingReferenceX = bookingX.bookingReference;
    bookingReferenceY = bookingY.bookingReference;
  });

  // Split into a second withOrg call -- Prisma's 5000ms interactive-
  // transaction timeout is measurably too short for this sandbox's real
  // network path to Neon once a beforeAll does this much sequential work in
  // one transaction (documented gotcha, CLAUDE.md; same fix as
  // tests/api/assignment.api.test.ts).
  await withOrg(orgId, async (tx) => {
    const [itineraryX, itineraryY] = await Promise.all([
      // APPROVED -- DR-137's summary-pdf gate needs an approved itinerary to
      // exercise the 200 case; itineraryY stays DRAFT (its own tests never
      // depend on status, and it also proves the APPROVED gate independently
      // of the anti-BOLA check below).
      tx.itinerary.create({ data: { organizationId: orgId, bookingId: bookingXId, status: 'APPROVED' } }),
      tx.itinerary.create({ data: { organizationId: orgId, bookingId: bookingYId } }),
    ]);
    itineraryXId = itineraryX.id;
    itineraryYId = itineraryY.id;
  });

  // Split into a third withOrg call (DR-089's dayX/dayY fixtures pushed the
  // previous block over Prisma's 5000ms interactive-transaction timeout --
  // same documented gotcha, same fix as everywhere else in this file).
  await withOrg(orgId, async (tx) => {
    const [dayX, dayY] = await Promise.all([
      tx.itineraryDay.create({ data: { organizationId: orgId, itineraryId: itineraryXId, dayNumber: 1, date: new Date('2026-09-01') } }),
      tx.itineraryDay.create({ data: { organizationId: orgId, itineraryId: itineraryYId, dayNumber: 1, date: new Date('2026-10-01') } }),
    ]);
    dayXId = dayX.id;
    dayYId = dayY.id;
  });

  // Split into a fourth withOrg call -- Prisma's 5000ms interactive-
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

/** DR-089: the Map tab's booking-reference entry point reuses the exact
 * same anti-BOLA scoping proven above -- these cases mirror the itineraryId
 * ones 1:1, just keyed by bookingReference instead. */
describe('anti-BOLA: itinerary map tab (booking-reference lookup, DR-089)', () => {
  it('a TOUR_GUIDE assigned to departureX can resolve the map overview for bookingX (200)', async () => {
    const headers = await loginAs(guideId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/map-overview?bookingReference=${bookingReferenceX}`, { headers });
    const res = await mapOverview(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itineraryId).toBe(itineraryXId);
    expect(body.days.map((d: { dayId: string }) => d.dayId)).toContain(dayXId);
  });

  it('the same TOUR_GUIDE gets 404 (not 403) for bookingY on an unrelated departure', async () => {
    const headers = await loginAs(guideId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/map-overview?bookingReference=${bookingReferenceY}`, { headers });
    const res = await mapOverview(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(404);
  });

  it('an operator can resolve the map overview for either booking regardless of assignment', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/map-overview?bookingReference=${bookingReferenceY}`, { headers });
    const res = await mapOverview(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
  });

  it('a TOURIST gets 403 (no itinerary.read permission)', async () => {
    const headers = await loginAs(touristId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/map-overview?bookingReference=${bookingReferenceX}`, { headers });
    const res = await mapOverview(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it('a garbage bookingReference 404s rather than crashing', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest('http://localhost/api/v1/itineraries/map-overview?bookingReference=NOPE99', { headers });
    const res = await mapOverview(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(404);
  });

  it('a missing bookingReference query param 422s', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest('http://localhost/api/v1/itineraries/map-overview', { headers });
    const res = await mapOverview(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(422);
  });
});

describe('anti-BOLA: itinerary day map PDF (DR-089)', () => {
  it('a TOUR_GUIDE assigned to departureX gets 409 for dayX -- no geocoded stops yet, not an empty map', async () => {
    const headers = await loginAs(guideId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryXId}/days/${dayXId}/map-pdf`, { headers });
    const res = await mapPdf(req, { params: Promise.resolve({ itineraryId: itineraryXId, dayId: dayXId }) });
    expect(res.status).toBe(409);
  });

  it('the same TOUR_GUIDE gets 404 (not 403) for dayY on the unrelated itinerary', async () => {
    const headers = await loginAs(guideId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryYId}/days/${dayYId}/map-pdf`, { headers });
    const res = await mapPdf(req, { params: Promise.resolve({ itineraryId: itineraryYId, dayId: dayYId }) });
    expect(res.status).toBe(404);
  });

  it('a TOURIST gets 403 (no itinerary.read permission)', async () => {
    const headers = await loginAs(touristId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryXId}/days/${dayXId}/map-pdf`, { headers });
    const res = await mapPdf(req, { params: Promise.resolve({ itineraryId: itineraryXId, dayId: dayXId }) });
    expect(res.status).toBe(403);
  });
});

describe('anti-BOLA + status gate: itinerary detailed summary PDF (DR-137)', () => {
  // @react-pdf/renderer pays a real one-time cold-start cost (font/module
  // init) on its very first render in a process -- every other itinerary
  // PDF test in this file (map-pdf) throws before ever reaching its own
  // render call, so this is the first test in the whole suite to actually
  // exercise that path. 20s (the file's default testTimeout) isn't enough
  // for that cold render plus this test's own several sequential Neon
  // round-trips; a per-test override avoids loosening the global default
  // for every other (fast) test in this file.
  it('a TOUR_GUIDE assigned to departureX gets 200 for the APPROVED itineraryX', async () => {
    const headers = await loginAs(guideId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryXId}/summary-pdf`, { headers });
    const res = await summaryPdf(req, { params: Promise.resolve({ itineraryId: itineraryXId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  }, 45000);

  it('the same TOUR_GUIDE gets 404 (not 403) for itineraryY on the unrelated departure', async () => {
    const headers = await loginAs(guideId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryYId}/summary-pdf`, { headers });
    const res = await summaryPdf(req, { params: Promise.resolve({ itineraryId: itineraryYId }) });
    expect(res.status).toBe(404);
  });

  it('an operator (manager) gets 409 for itineraryY -- still DRAFT, not yet approved', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryYId}/summary-pdf`, { headers });
    const res = await summaryPdf(req, { params: Promise.resolve({ itineraryId: itineraryYId }) });
    expect(res.status).toBe(409);
  });

  it('a TOURIST gets 403 (no itinerary.read permission)', async () => {
    const headers = await loginAs(touristId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryXId}/summary-pdf`, { headers });
    const res = await summaryPdf(req, { params: Promise.resolve({ itineraryId: itineraryXId }) });
    expect(res.status).toBe(403);
  });
});
