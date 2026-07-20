import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { generateBookingReference } from '@modules/booking';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { POST as issueRatingCode } from '../../src/app/api/v1/bookings/[bookingId]/rating-code/route';
import { GET as listRatings } from '../../src/app/api/v1/ratings/route';

/**
 * Anti-BOLA + role-gate coverage for the two new DR-037 routes: a role
 * without rating.issue/rating.read (e.g. TOUR_GUIDE) must be denied, and an
 * operator from a DIFFERENT org must never reach another org's booking.
 */
const admin = new PrismaClient();

let orgAId: string;
let orgBId: string;
let operatorAId: string;
let operatorBId: string;
let guideAId: string;
let paidBookingAId: string;

function jsonRequest(url: string, headers: Headers, method: string): NextRequest {
  return new NextRequest(url, { method, headers });
}

beforeAll(async () => {
  const [orgA, orgB] = await Promise.all([
    admin.organization.create({ data: { name: `RATINGS-SEC-A-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' } }),
    admin.organization.create({ data: { name: `RATINGS-SEC-B-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' } }),
  ]);
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [operatorA, operatorB, guideA, touristA] = await Promise.all([
    admin.user.create({ data: { email: `op-a-ratings-sec-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgAId } }),
    admin.user.create({ data: { email: `op-b-ratings-sec-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgBId } }),
    admin.user.create({ data: { email: `guide-a-ratings-sec-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgAId } }),
    admin.user.create({ data: { email: `tourist-a-ratings-sec-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgAId } }),
  ]);
  operatorAId = operatorA.id;
  operatorBId = operatorB.id;
  guideAId = guideA.id;

  await withOrg(orgAId, async (tx) => {
    const booking = await tx.booking.create({
      data: {
        organizationId: orgAId,
        touristUserId: touristA.id,
        seats: 1,
        status: 'COMPLETED',
        priceMinor: 50000,
        currency: 'USD',
        bookingReference: generateBookingReference(),
      },
    });
    paidBookingAId = booking.id;
    await tx.invoice.create({
      data: {
        organizationId: orgAId,
        bookingId: booking.id,
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
  });
});

afterAll(async () => {
  // Guard: if beforeAll failed before either org id was assigned, Prisma
  // silently drops the undefined where-clause value, turning cleanup into
  // an unscoped deleteMany that wipes the whole table -- this has hit real
  // production data twice. Skip cleanup entirely rather than risk it.
  if (!orgAId || !orgBId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgAId, (tx) => tx.invoice.deleteMany({ where: { organizationId: orgAId } }));
  await withOrg(orgAId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgAId } }));
  await admin.user.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('ratings routes -- role gate', () => {
  it('TOUR_GUIDE (no rating.issue) is forbidden from issuing a Rating Code (403)', async () => {
    const headers = await loginAs(guideAId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${paidBookingAId}/rating-code`, headers, 'POST');
    const res = await issueRatingCode(req, { params: Promise.resolve({ bookingId: paidBookingAId }) });
    expect(res.status).toBe(403);
  });

  it('TOUR_GUIDE (no rating.read) is forbidden from the moderation view (403)', async () => {
    const headers = await loginAs(guideAId);
    const req = new NextRequest('http://localhost/api/v1/ratings', { headers });
    const res = await listRatings(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});

describe('ratings routes -- cross-tenant anti-BOLA', () => {
  it("org B's operator cannot issue a Rating Code for org A's booking (404, not 403 -- never reveal it exists)", async () => {
    const headers = await loginAs(operatorBId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${paidBookingAId}/rating-code`, headers, 'POST');
    const res = await issueRatingCode(req, { params: Promise.resolve({ bookingId: paidBookingAId }) });
    expect(res.status).toBe(404);
  });

  it("org B's moderation view never includes org A's data", async () => {
    const headers = await loginAs(operatorBId);
    const req = new NextRequest('http://localhost/api/v1/ratings', { headers });
    const res = await listRatings(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reviews.every((r: { organizationId: string }) => r.organizationId === orgBId)).toBe(true);
  });
});
