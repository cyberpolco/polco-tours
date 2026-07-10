import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { generateConfirmationCode } from '../../src/modules/booking';
import { GET as getBooking } from '../../src/app/api/v1/bookings/[bookingId]/route';
import { POST as cancelBooking } from '../../src/app/api/v1/bookings/[bookingId]/cancel/route';

/**
 * Anti-BOLA (Vol. 8, API1): RLS only isolates by organizationId -- it does
 * NOT stop one tourist from reading or cancelling another tourist's booking
 * in the same org. That ownership check lives in booking/service.ts; this is
 * the test CLAUDE.md's Definition of Done calls a "security test" beyond RLS.
 */
const admin = new PrismaClient();

let orgId: string;
let bookingId: string;
let touristAId: string;
let touristBId: string;

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `SEC-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [touristA, touristB] = await Promise.all([
    admin.user.create({ data: { email: `sec-a-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `sec-b-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  touristAId = touristA.id;
  touristBId = touristB.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        title: 'Security Fixture Safari',
        description: 'Fixture for anti-BOLA tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: {
        organizationId: orgId,
        tourPackageId: pkg.id,
        startDate: new Date('2026-09-01'),
        capacity: 5,
        status: 'SCHEDULED',
      },
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
  });
});

afterAll(async () => {
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('anti-BOLA: booking ownership', () => {
  it("tourist B cannot read tourist A's booking (404, not 403 -- don't leak existence)", async () => {
    const headers = await loginAs(touristBId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}`, { headers });
    const res = await getBooking(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(404);
  });

  it("tourist B cannot cancel tourist A's booking (404)", async () => {
    const headers = await loginAs(touristBId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers,
    });
    const res = await cancelBooking(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(404);
  });

  it("tourist A can read their own booking (200)", async () => {
    const headers = await loginAs(touristAId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}`, { headers });
    const res = await getBooking(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
  });
});
