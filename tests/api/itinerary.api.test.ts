import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { generateBookingReference } from '@modules/booking';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as getBookingItinerary, POST as createItinerary } from '../../src/app/api/v1/bookings/[bookingId]/itinerary/route';
import { GET as listItineraries } from '../../src/app/api/v1/itineraries/route';
import { GET as getItinerary, PATCH as updateItinerary } from '../../src/app/api/v1/itineraries/[itineraryId]/route';
import { POST as submitForReview } from '../../src/app/api/v1/itineraries/[itineraryId]/review/route';
import { POST as sendBackToDraft } from '../../src/app/api/v1/itineraries/[itineraryId]/send-back/route';
import { POST as approveItinerary } from '../../src/app/api/v1/itineraries/[itineraryId]/approve/route';
import { GET as listDays, POST as addDay } from '../../src/app/api/v1/itineraries/[itineraryId]/days/route';
import { PATCH as updateDay, DELETE as removeDay } from '../../src/app/api/v1/itineraries/[itineraryId]/days/[dayId]/route';
import { GET as listAssignedHotels, POST as assignHotel } from '../../src/app/api/v1/itineraries/[itineraryId]/hotels/route';
import { DELETE as unassignHotel } from '../../src/app/api/v1/itineraries/[itineraryId]/hotels/[hotelId]/route';
import { GET as listHotels, POST as createHotel } from '../../src/app/api/v1/hotels/route';
import { PATCH as updateHotel, DELETE as deleteHotel } from '../../src/app/api/v1/hotels/[hotelId]/route';

/**
 * First API-level test of the DR-033 itinerary module: drives the real route
 * handlers (session resolution, RBAC, service, RLS) end-to-end -- creation,
 * the DRAFT -> IN_REVIEW -> APPROVED status lifecycle, daily-schedule CRUD,
 * and hotel reference-data + assignment, same pattern as
 * tests/api/assignment.api.test.ts.
 */
const admin = new PrismaClient();

let orgId: string;
let operatorId: string;
let touristId: string;
let bookingId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `ITIN-API-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, tourist] = await Promise.all([
    admin.user.create({ data: { email: `op-itin-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `t-itin-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  touristId = tourist.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: 'Itinerary API Fixture Safari',
        description: 'Fixture for itinerary API tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), endDate: new Date('2026-09-05'), capacity: 5, status: 'SCHEDULED' },
    });
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId: departure.id,
        touristUserId: touristId,
        bookingReference: generateBookingReference(),
        seats: 2,
        priceMinor: 10000,
        currency: 'USD',
      },
    });
    bookingId = booking.id;
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
  await withOrg(orgId, (tx) => tx.itineraryHotel.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.itineraryDay.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.itinerary.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.hotel.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

let itineraryId: string;

describe('POST /api/v1/bookings/:bookingId/itinerary', () => {
  it('a TOURIST cannot create an itinerary (403)', async () => {
    const headers = await loginAs(touristId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/itinerary`, headers, 'POST', {});
    const res = await createItinerary(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(403);
  });

  it('an operator creates an itinerary for the booking (201, DRAFT)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/itinerary`, headers, 'POST', {
      notes: 'Fixture notes',
      emergencyContactName: 'Jane Doe',
      emergencyContactPhone: '+264 81 000 0000',
    });
    const res = await createItinerary(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.itinerary.status).toBe('DRAFT');
    expect(body.itinerary.bookingId).toBe(bookingId);
    itineraryId = body.itinerary.id;
  });

  it('rejects a second itinerary for the same booking (409, one-to-one)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/itinerary`, headers, 'POST', {});
    const res = await createItinerary(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(409);
  });

  it('an operator can fetch the itinerary by booking id (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/itinerary`, { headers });
    const res = await getBookingItinerary(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itinerary.id).toBe(itineraryId);
  });
});

describe('GET /api/v1/itineraries', () => {
  it('an operator lists every itinerary in the org (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest('http://localhost/api/v1/itineraries', { headers });
    const res = await listItineraries(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itineraries.some((i: { id: string }) => i.id === itineraryId)).toBe(true);
  });

  it('a TOURIST cannot list every itinerary (403)', async () => {
    const headers = await loginAs(touristId);
    const req = new NextRequest('http://localhost/api/v1/itineraries', { headers });
    const res = await listItineraries(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/itineraries/:itineraryId', () => {
  it('an operator updates notes/emergency contact (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/itineraries/${itineraryId}`, headers, 'PATCH', {
      notes: 'Updated notes',
      emergencyContactRelation: 'Spouse',
    });
    const res = await updateItinerary(req, { params: Promise.resolve({ itineraryId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itinerary.notes).toBe('Updated notes');
    expect(body.itinerary.emergencyContactRelation).toBe('Spouse');
  });
});

describe('itinerary day management', () => {
  it('an operator adds day 1 (201)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/itineraries/${itineraryId}/days`, headers, 'POST', {
      dayNumber: 1,
      date: '2026-09-01',
      departureTime: '08:00',
      pickupLocation: 'Hotel lobby',
      plannedSites: 'Etosha gate',
    });
    const res = await addDay(req, { params: Promise.resolve({ itineraryId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.day.dayNumber).toBe(1);
  });

  it('rejects a malformed departureTime (422, zod validation)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/itineraries/${itineraryId}/days`, headers, 'POST', {
      dayNumber: 2,
      date: '2026-09-02',
      departureTime: '25:99',
    });
    const res = await addDay(req, { params: Promise.resolve({ itineraryId }) });
    expect(res.status).toBe(422);
  });

  it('lists the itinerary days (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryId}/days`, { headers });
    const res = await listDays(req, { params: Promise.resolve({ itineraryId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.days.length).toBe(1);
  });

  it('updates a day (200)', async () => {
    const headers = await loginAs(operatorId);
    const listReq = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryId}/days`, { headers: await loginAs(operatorId) });
    const listRes = await listDays(listReq, { params: Promise.resolve({ itineraryId }) });
    const { days } = await listRes.json();
    const dayId = days[0].id;

    const req = jsonRequest(`http://localhost/api/v1/itineraries/${itineraryId}/days/${dayId}`, headers, 'PATCH', {
      activities: 'Game drive',
    });
    const res = await updateDay(req, { params: Promise.resolve({ itineraryId, dayId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.day.activities).toBe('Game drive');
  });

  it('removes a day (204)', async () => {
    const listReq = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryId}/days`, { headers: await loginAs(operatorId) });
    const listRes = await listDays(listReq, { params: Promise.resolve({ itineraryId }) });
    const { days } = await listRes.json();
    const dayId = days[0].id;

    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryId}/days/${dayId}`, { method: 'DELETE', headers });
    const res = await removeDay(req, { params: Promise.resolve({ itineraryId, dayId }) });
    expect(res.status).toBe(204);

    const listReq2 = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryId}/days`, { headers: await loginAs(operatorId) });
    const listRes2 = await listDays(listReq2, { params: Promise.resolve({ itineraryId }) });
    const body2 = await listRes2.json();
    expect(body2.days.length).toBe(0);
  });
});

let hotelId: string;

describe('hotel reference data + itinerary assignment', () => {
  it('an operator creates a hotel (201)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest('http://localhost/api/v1/hotels', headers, 'POST', {
      name: 'Fixture Lodge',
      country: 'NA',
      contactPhone: '+264 81 111 1111',
    });
    const res = await createHotel(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    hotelId = body.hotel.id;
  });

  it('lists hotels in the org (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest('http://localhost/api/v1/hotels', { headers });
    const res = await listHotels(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hotels.some((h: { id: string }) => h.id === hotelId)).toBe(true);
  });

  it('updates a hotel (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/hotels/${hotelId}`, headers, 'PATCH', { name: 'Fixture Lodge Renamed' });
    const res = await updateHotel(req, { params: Promise.resolve({ hotelId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hotel.name).toBe('Fixture Lodge Renamed');
  });

  it('assigns the hotel to the itinerary (201)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/itineraries/${itineraryId}/hotels`, headers, 'POST', { hotelId });
    const res = await assignHotel(req, { params: Promise.resolve({ itineraryId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.hotels.some((h: { id: string }) => h.id === hotelId)).toBe(true);
  });

  it('404s assigning a non-existent hotel', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/itineraries/${itineraryId}/hotels`, headers, 'POST', {
      hotelId: '00000000-0000-0000-0000-000000000000',
    });
    const res = await assignHotel(req, { params: Promise.resolve({ itineraryId }) });
    expect(res.status).toBe(404);
  });

  it('lists the itinerary\'s assigned hotels (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryId}/hotels`, { headers });
    const res = await listAssignedHotels(req, { params: Promise.resolve({ itineraryId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hotels.length).toBe(1);
  });

  it('unassigns the hotel (204)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryId}/hotels/${hotelId}`, { method: 'DELETE', headers });
    const res = await unassignHotel(req, { params: Promise.resolve({ itineraryId, hotelId }) });
    expect(res.status).toBe(204);
  });

  it('deletes the hotel (204, soft delete)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/hotels/${hotelId}`, { method: 'DELETE', headers });
    const res = await deleteHotel(req, { params: Promise.resolve({ hotelId }) });
    expect(res.status).toBe(204);
  });
});

describe('status lifecycle: DRAFT -> IN_REVIEW -> DRAFT -> APPROVED', () => {
  it('submits for review (200, IN_REVIEW)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryId}/review`, { method: 'POST', headers });
    const res = await submitForReview(req, { params: Promise.resolve({ itineraryId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itinerary.status).toBe('IN_REVIEW');
  });

  it('sends it back to DRAFT (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryId}/send-back`, { method: 'POST', headers });
    const res = await sendBackToDraft(req, { params: Promise.resolve({ itineraryId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itinerary.status).toBe('DRAFT');
  });

  it('approves directly from DRAFT (200, APPROVED)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryId}/approve`, { method: 'POST', headers });
    const res = await approveItinerary(req, { params: Promise.resolve({ itineraryId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itinerary.status).toBe('APPROVED');
    expect(body.itinerary.approvedAt).not.toBeNull();
  });

  it('rejects any further transition once APPROVED (409, terminal)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryId}/review`, { method: 'POST', headers });
    const res = await submitForReview(req, { params: Promise.resolve({ itineraryId }) });
    expect(res.status).toBe(409);
  });

  it('a TOURIST cannot approve an itinerary (403)', async () => {
    const headers = await loginAs(touristId);
    const req = new NextRequest(`http://localhost/api/v1/itineraries/${itineraryId}/approve`, { method: 'POST', headers });
    const res = await approveItinerary(req, { params: Promise.resolve({ itineraryId }) });
    expect(res.status).toBe(403);
  });
});
