import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { formatPackageReference } from '@modules/catalog';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { bookingService, generateConfirmationCode } from '../../src/modules/booking';
import type { AuthContext } from '../../src/modules/auth';

// Real RESEND_API_KEY/AFRICAS_TALKING_* credentials now exist in .env/.env.local
// (2026-07-15) and Vitest loads .env automatically -- without this mock,
// cancelBooking's notify() call below would attempt a REAL SMS/email send
// every test run. Same vi.hoisted + vi.mock convention as the documents
// blob-gateway mock (tests/api/booking-setup.api.test.ts).
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

const { GET: getBooking } = await import('../../src/app/api/v1/bookings/[bookingId]/route');
const { POST: cancelBooking } = await import('../../src/app/api/v1/bookings/[bookingId]/cancel/route');

/**
 * Anti-BOLA (Vol. 8, API1): RLS only isolates by organizationId -- it does
 * NOT stop one tourist from reading or cancelling another tourist's booking
 * in the same org. That ownership check lives in booking/service.ts; this is
 * the test CLAUDE.md's Definition of Done calls a "security test" beyond RLS.
 */
const admin = new PrismaClient();

let orgId: string;
let bookingId: string;
let quoteBookingId: string;
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
        packageReference: formatPackageReference(Date.now()),
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
        bookingReference: generateConfirmationCode(),
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
      },
    });
    bookingId = booking.id;

    // Own fixture row for requestQuotation (DR-024) -- kept separate from
    // `booking` above since requestQuotation mutates status (HELD ->
    // QUOTE_REQUESTED) and the other tests in this file assume `bookingId`
    // stays HELD throughout.
    const quoteBooking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId: departure.id,
        touristUserId: touristAId,
        confirmationCode: generateConfirmationCode(),
        bookingReference: generateConfirmationCode(),
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
      },
    });
    quoteBookingId = quoteBooking.id;
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

describe('requestQuotation (DR-024)', () => {
  // No HTTP route exists for this specific transition -- it's only reachable
  // via the guest booking-detail page's Server Action (unlike sendQuotation/
  // acceptQuotation/refund, which do have routes -- see bookings-v2.api.test.ts).
  // Called directly with a hand-built AuthContext instead of loginAs()+a route.
  function ctxFor(userId: string): AuthContext {
    return {
      userId,
      roles: ['TOURIST'],
      organizationId: orgId,
      sessionId: 'test',
      assignedCountry: null,
      mustChangePassword: false,
    };
  }

  it("tourist B cannot request a quotation on tourist A's booking (404)", async () => {
    await expect(bookingService.requestQuotation(ctxFor(touristBId), quoteBookingId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('tourist A can transition their own AWAITING_DEPOSIT booking to AWAITING_QUOTATION', async () => {
    const updated = await bookingService.requestQuotation(ctxFor(touristAId), quoteBookingId);
    expect(updated.status).toBe('AWAITING_QUOTATION');
    expect(updated.holdExpiresAt).toBeNull();
  });

  it('an AWAITING_QUOTATION booking cannot be quote-requested again (already transitioned)', async () => {
    await expect(bookingService.requestQuotation(ctxFor(touristAId), quoteBookingId)).rejects.toThrow();
  });
});
