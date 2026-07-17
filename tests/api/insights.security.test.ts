import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { generateConfirmationCode } from '@modules/booking';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as getInsights } from '../../src/app/api/v1/insights/route';

/**
 * Role-gate + cross-tenant coverage for the new DR-038 route: a role
 * without insights.read (e.g. TOUR_GUIDE) must be denied, and an operator
 * from a DIFFERENT org must never see another org's booking data reflected
 * in their own summary.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgAId: string;
let orgBId: string;
let operatorAId: string;
let operatorBId: string;
let guideAId: string;

beforeAll(async () => {
  const [orgA, orgB] = await Promise.all([
    admin.organization.create({ data: { name: `INSIGHTS-SEC-A-${suffix}`, countries: ['NA'], status: 'VERIFIED' } }),
    admin.organization.create({ data: { name: `INSIGHTS-SEC-B-${suffix}`, countries: ['NA'], status: 'VERIFIED' } }),
  ]);
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [operatorA, operatorB, guideA, touristA] = await Promise.all([
    admin.user.create({ data: { email: `op-a-insights-sec-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgAId } }),
    admin.user.create({ data: { email: `op-b-insights-sec-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgBId } }),
    admin.user.create({ data: { email: `guide-a-insights-sec-${suffix}@example.test`, role: 'TOUR_GUIDE', organizationId: orgAId } }),
    admin.user.create({ data: { email: `tourist-a-insights-sec-${suffix}@example.test`, role: 'TOURIST', organizationId: orgAId } }),
  ]);
  operatorAId = operatorA.id;
  operatorBId = operatorB.id;
  guideAId = guideA.id;

  await withOrg(orgAId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgAId,
        packageReference: formatPackageReference(Date.now()),
        title: `TEST-INSIGHTS-SEC-${suffix}`,
        description: 'Fixture.',
        country: 'NA',
        priceMinor: 100000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: orgAId, tourPackageId: pkg.id, startDate: new Date(), capacity: 4 },
    });
    await tx.booking.create({
      data: {
        organizationId: orgAId,
        departureId: departure.id,
        touristUserId: touristA.id,
        seats: 1,
        status: 'IN_PROGRESS',
        priceMinor: 100000,
        currency: 'USD',
        confirmationCode: generateConfirmationCode(),
        bookingReference: generateConfirmationCode(),
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
  await withOrg(orgAId, async (tx) => {
    await tx.booking.deleteMany({ where: { organizationId: orgAId } });
    await tx.departure.deleteMany({ where: { organizationId: orgAId } });
    await tx.tourPackage.deleteMany({ where: { organizationId: orgAId } });
  });
  await admin.user.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('insights route -- role gate', () => {
  it('TOUR_GUIDE (no insights.read) is forbidden (403)', async () => {
    const headers = await loginAs(guideAId);
    const req = new NextRequest('http://localhost/api/v1/insights', { headers });
    const res = await getInsights(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});

describe('insights route -- cross-tenant isolation', () => {
  it(
    "org B's summary never reflects org A's booking data",
    async () => {
      const headers = await loginAs(operatorBId);
      const req = new NextRequest('http://localhost/api/v1/insights', { headers });
      const res = await getInsights(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
      const { summary } = await res.json();
      expect(summary.bookings.totalBookings).toBe(0);
      expect(summary.bookings.activeTours).toBe(0);
    },
    // insightsService deliberately serializes its composition (sequential
    // round trips, not concurrent `withOrg` bursts -- this sandbox's Neon
    // pool has choked on those) -- needs a longer allowance than most
    // single-call API tests.
    60_000,
  );

  it(
    "org A's operator sees org A's own booking",
    async () => {
      const headers = await loginAs(operatorAId);
      const req = new NextRequest('http://localhost/api/v1/insights', { headers });
      const res = await getInsights(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
      const { summary } = await res.json();
      expect(summary.bookings.totalBookings).toBe(1);
      expect(summary.bookings.activeTours).toBe(1);
    },
    60_000,
  );
});
