import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { generateBookingReference } from '@modules/booking';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';

const { GET: getHotelRating, POST: rateHotel } = await import(
  '../../src/app/api/v1/itineraries/[itineraryId]/hotels/[hotelId]/rating/route'
);
const { POST: rateRestaurant } = await import(
  '../../src/app/api/v1/itineraries/[itineraryId]/restaurants/[restaurantId]/rating/route'
);
const { GET: getHotelById } = await import('../../src/app/api/v1/hotels/[hotelId]/route');

/**
 * DR-060 follow-up: staff-only 5-star hotel/restaurant rating -- one row per
 * (hotel-or-restaurant, staff rater), overwritten on revisit. TOUR_GUIDE/
 * DRIVER are anti-BOLA-scoped to only a hotel/restaurant assigned to one of
 * their own toured itineraries; TOUR_OPERATOR/PLATFORM_ADMIN are unscoped.
 */
const admin = new PrismaClient();

let orgId: string;
let operatorId: string;
let touristId: string;
let assignedGuideId: string;
let unassignedGuideId: string;
let vehicleOwnerId: string;
let itineraryId: string;
let hotelId: string;
let restaurantId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `HOTEL-RATING-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, tourist, assignedGuide, unassignedGuide, vehicleOwner] = await Promise.all([
    admin.user.create({ data: { email: `op-hrating-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `t-hrating-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `guide-a-hrating-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
    admin.user.create({ data: { email: `guide-b-hrating-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
    admin.user.create({ data: { email: `vo-hrating-${Date.now()}@example.test`, role: 'VEHICLE_OWNER', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  touristId = tourist.id;
  assignedGuideId = assignedGuide.id;
  unassignedGuideId = unassignedGuide.id;
  vehicleOwnerId = vehicleOwner.id;

  // Split into several smaller withOrg calls -- Prisma's 5000ms interactive-
  // transaction timeout is measurably too short for this sandbox's real
  // network path to Neon once a beforeAll does this much sequential work in
  // one transaction (documented gotcha, CLAUDE.md).
  let departureId: string;
  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: 'Hotel Rating Fixture Safari',
        description: 'Fixture.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), capacity: 5, status: 'SCHEDULED' },
    });
    departureId = departure.id;
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
    const itinerary = await tx.itinerary.create({ data: { organizationId: orgId, bookingId: booking.id } });
    itineraryId = itinerary.id;
  });

  await withOrg(orgId, async (tx) => {
    const vehicle = await tx.vehicle.create({
      data: { organizationId: orgId, plateNumber: `HRATE-${Date.now()}`, make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 5, status: 'ACTIVE' },
    });
    const driverUser = await tx.user.create({
      data: { email: `driver-hrating-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId },
    });
    const driverProfile = await tx.driverProfile.create({
      data: { organizationId: orgId, userId: driverUser.id, licenseNumber: `DL-HRATE-${Date.now()}`, status: 'ACTIVE' },
    });
    await tx.assignment.create({
      data: { organizationId: orgId, departureId, vehicleId: vehicle.id, driverProfileId: driverProfile.id, guideUserId: assignedGuideId },
    });
  });

  await withOrg(orgId, async (tx) => {
    const hotel = await tx.hotel.create({ data: { organizationId: orgId, name: 'Fixture Lodge', country: 'NA' } });
    hotelId = hotel.id;
    await tx.itineraryHotel.create({ data: { organizationId: orgId, itineraryId, hotelId: hotel.id } });

    const restaurant = await tx.restaurant.create({ data: { organizationId: orgId, name: 'Fixture Grill', country: 'NA' } });
    restaurantId = restaurant.id;
    await tx.itineraryRestaurant.create({ data: { organizationId: orgId, itineraryId, restaurantId: restaurant.id } });
  });
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.hotelRating.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.restaurantRating.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.itineraryHotel.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.itineraryRestaurant.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.hotel.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.restaurant.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.assignment.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.vehicle.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.itinerary.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('POST /api/v1/itineraries/:itineraryId/hotels/:hotelId/rating', () => {
  it('a TOUR_GUIDE assigned to this itinerary can rate its hotel (201)', async () => {
    const headers = await loginAs(assignedGuideId);
    const req = jsonRequest('http://localhost/api/v1/itineraries/x/hotels/y/rating', headers, 'POST', {
      rating: 4,
      comment: 'Great breakfast',
    });
    const res = await rateHotel(req, { params: Promise.resolve({ itineraryId, hotelId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.rating.rating).toBe(4);
    expect(body.rating.comment).toBe('Great breakfast');
  });

  it('rating again from the same guide updates the same row, not a new one (201, aggregate reflects 1 rater)', async () => {
    const headers = await loginAs(assignedGuideId);
    const req = jsonRequest('http://localhost/api/v1/itineraries/x/hotels/y/rating', headers, 'POST', { rating: 5 });
    const res = await rateHotel(req, { params: Promise.resolve({ itineraryId, hotelId }) });
    expect(res.status).toBe(201);

    const rows = await withOrg(orgId, (tx) => tx.hotelRating.findMany({ where: { hotelId } }));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rating).toBe(5);

    const hotelHeaders = await loginAs(operatorId);
    const hotelReq = new NextRequest('http://localhost/api/v1/hotels/x', { headers: hotelHeaders });
    const hotelRes = await getHotelById(hotelReq, { params: Promise.resolve({ hotelId }) });
    const hotelBody = await hotelRes.json();
    expect(hotelBody.hotel.averageRating).toBe(5);
    expect(hotelBody.hotel.ratingCount).toBe(1);
  });

  it('a second rater (TOUR_OPERATOR, unscoped) rating the same hotel updates the aggregate to reflect both (201)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest('http://localhost/api/v1/itineraries/x/hotels/y/rating', headers, 'POST', { rating: 3 });
    const res = await rateHotel(req, { params: Promise.resolve({ itineraryId, hotelId }) });
    expect(res.status).toBe(201);

    const rows = await withOrg(orgId, (tx) => tx.hotelRating.findMany({ where: { hotelId } }));
    expect(rows).toHaveLength(2); // assignedGuide (5) + operator (3)

    const hotelHeaders = await loginAs(operatorId);
    const hotelReq = new NextRequest('http://localhost/api/v1/hotels/x', { headers: hotelHeaders });
    const hotelRes = await getHotelById(hotelReq, { params: Promise.resolve({ hotelId }) });
    const hotelBody = await hotelRes.json();
    expect(hotelBody.hotel.averageRating).toBe(4); // (5 + 3) / 2
    expect(hotelBody.hotel.ratingCount).toBe(2);
  });

  it('a TOUR_GUIDE NOT assigned to this itinerary cannot rate its hotel (404, anti-BOLA)', async () => {
    const headers = await loginAs(unassignedGuideId);
    const req = jsonRequest('http://localhost/api/v1/itineraries/x/hotels/y/rating', headers, 'POST', { rating: 2 });
    const res = await rateHotel(req, { params: Promise.resolve({ itineraryId, hotelId }) });
    expect(res.status).toBe(404);
  });

  it('a VEHICLE_OWNER (no hotel_restaurant_rating.write) cannot rate a hotel (403)', async () => {
    const headers = await loginAs(vehicleOwnerId);
    const req = jsonRequest('http://localhost/api/v1/itineraries/x/hotels/y/rating', headers, 'POST', { rating: 2 });
    const res = await rateHotel(req, { params: Promise.resolve({ itineraryId, hotelId }) });
    expect(res.status).toBe(403);
  });

  it('rejects a rating outside the 1-5 range (422)', async () => {
    const headers = await loginAs(assignedGuideId);
    const req = jsonRequest('http://localhost/api/v1/itineraries/x/hotels/y/rating', headers, 'POST', { rating: 6 });
    const res = await rateHotel(req, { params: Promise.resolve({ itineraryId, hotelId }) });
    expect(res.status).toBe(422);
  });

  it('rejects rating a hotel not assigned to this itinerary (404)', async () => {
    const otherHotel = await withOrg(orgId, (tx) => tx.hotel.create({ data: { organizationId: orgId, name: 'Unassigned Lodge', country: 'NA' } }));
    const headers = await loginAs(assignedGuideId);
    const req = jsonRequest('http://localhost/api/v1/itineraries/x/hotels/y/rating', headers, 'POST', { rating: 3 });
    const res = await rateHotel(req, { params: Promise.resolve({ itineraryId, hotelId: otherHotel.id }) });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/itineraries/:itineraryId/hotels/:hotelId/rating', () => {
  it("returns the caller's own rating, not anyone else's", async () => {
    const headers = await loginAs(assignedGuideId);
    const req = new NextRequest('http://localhost/api/v1/itineraries/x/hotels/y/rating', { headers });
    const res = await getHotelRating(req, { params: Promise.resolve({ itineraryId, hotelId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rating.rating).toBe(5); // assignedGuide's own rating from the earlier test
  });
});

describe('POST /api/v1/itineraries/:itineraryId/restaurants/:restaurantId/rating', () => {
  it('a TOUR_GUIDE assigned to this itinerary can rate its restaurant (201)', async () => {
    const headers = await loginAs(assignedGuideId);
    const req = jsonRequest('http://localhost/api/v1/itineraries/x/restaurants/y/rating', headers, 'POST', { rating: 4 });
    const res = await rateRestaurant(req, { params: Promise.resolve({ itineraryId, restaurantId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.rating.rating).toBe(4);
  });

  it('a TOUR_GUIDE NOT assigned to this itinerary cannot rate its restaurant (404)', async () => {
    const headers = await loginAs(unassignedGuideId);
    const req = jsonRequest('http://localhost/api/v1/itineraries/x/restaurants/y/rating', headers, 'POST', { rating: 2 });
    const res = await rateRestaurant(req, { params: Promise.resolve({ itineraryId, restaurantId }) });
    expect(res.status).toBe(404);
  });
});
