import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { generateBookingReference } from '@modules/booking';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { POST as issueRatingCode } from '../../src/app/api/v1/bookings/[bookingId]/rating-code/route';
import { GET as listRatings } from '../../src/app/api/v1/ratings/route';

/**
 * Drives the two new DR-037 routes end-to-end: issuing a Rating Code
 * (rating.issue) and the staff moderation/aggregate view (rating.read).
 */
const admin = new PrismaClient();

let orgId: string;
let operatorId: string;
let touristId: string;
let paidBookingId: string;
let unpaidBookingId: string;

function jsonRequest(url: string, headers: Headers, method: string): NextRequest {
  return new NextRequest(url, { method, headers });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `RATINGS-API-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, tourist] = await Promise.all([
    admin.user.create({ data: { email: `op-ratings-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `tourist-ratings-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  touristId = tourist.id;

  await withOrg(orgId, async (tx) => {
    const paidBooking = await tx.booking.create({
      data: {
        organizationId: orgId,
        touristUserId: touristId,
        seats: 1,
        status: 'COMPLETED',
        priceMinor: 50000,
        currency: 'USD',
        bookingReference: generateBookingReference(),
      },
    });
    paidBookingId = paidBooking.id;
    await tx.invoice.create({
      data: {
        organizationId: orgId,
        bookingId: paidBooking.id,
        currency: 'USD',
        subtotalMinor: 50000,
        taxRateBp: 0,
        taxMinor: 0,
        totalMinor: 50000,
        depositMinor: 20000,
        balanceMinor: 30000,
        status: 'PAID',
      },
    });

    const unpaidBooking = await tx.booking.create({
      data: {
        organizationId: orgId,
        touristUserId: touristId,
        seats: 1,
        status: 'CONFIRMED',
        priceMinor: 50000,
        currency: 'USD',
        bookingReference: generateBookingReference(),
      },
    });
    unpaidBookingId = unpaidBooking.id;
    await tx.invoice.create({
      data: {
        organizationId: orgId,
        bookingId: unpaidBooking.id,
        currency: 'USD',
        subtotalMinor: 50000,
        taxRateBp: 0,
        taxMinor: 0,
        totalMinor: 50000,
        depositMinor: 20000,
        balanceMinor: 30000,
        status: 'PARTIALLY_PAID',
      },
    });
  });
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgId was assigned, Prisma silently
  // drops the undefined where-clause value, turning cleanup into an
  // unscoped deleteMany that wipes the whole table -- this has hit real
  // production data twice. Skip cleanup entirely rather than risk it.
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.ratingCode.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.invoice.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('POST /api/v1/bookings/:bookingId/rating-code', () => {
  it(
    'issues a Rating Code for a fully-paid booking (201)',
    async () => {
      const headers = await loginAs(operatorId);
      const req = jsonRequest(`http://localhost/api/v1/bookings/${paidBookingId}/rating-code`, headers, 'POST');
      const res = await issueRatingCode(req, { params: Promise.resolve({ bookingId: paidBookingId }) });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.ratingCode.bookingId).toBe(paidBookingId);
      expect(body.ratingCode.code).toHaveLength(8);
    },
    // issueRatingCode fires notificationsService.notify's real WhatsApp ->
    // SMS -> email fallback chain (charter rule 8) -- no provider
    // credentials exist in any test env (OI-05/06/07), so every channel is
    // tried and fails before the request completes; the default 20s test
    // timeout isn't always enough for that plus the DB round trips.
    30_000,
  );

  it('rejects re-issuing for the same booking (409)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${paidBookingId}/rating-code`, headers, 'POST');
    const res = await issueRatingCode(req, { params: Promise.resolve({ bookingId: paidBookingId }) });
    expect(res.status).toBe(409);
  });

  it('rejects a booking whose invoice is not yet fully paid (409)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${unpaidBookingId}/rating-code`, headers, 'POST');
    const res = await issueRatingCode(req, { params: Promise.resolve({ bookingId: unpaidBookingId }) });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/v1/ratings', () => {
  it('returns reviews + aggregate summary (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest('http://localhost/api/v1/ratings', { headers });
    const res = await listRatings(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.reviews)).toBe(true);
    expect(body.summary).toHaveProperty('organization');
    expect(body.summary).toHaveProperty('drivers');
    expect(body.summary).toHaveProperty('guides');
  });
});
