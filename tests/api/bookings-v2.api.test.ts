import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';

// Same notification-mock convention as tests/api/bookings.security.test.ts --
// real Resend/Africa's Talking credentials exist in .env now, so without
// this, sendQuotation's notify() call would attempt a real send every run.
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

const { POST: createTailorMade } = await import('../../src/app/api/v1/bookings/tailor-made/route');
const { POST: sendQuotation } = await import('../../src/app/api/v1/bookings/[bookingId]/quotation/route');
const { POST: acceptQuotation } = await import('../../src/app/api/v1/bookings/[bookingId]/quotation/accept/route');
const { POST: refundBooking } = await import('../../src/app/api/v1/bookings/[bookingId]/refund/route');
const { POST: cancelBooking } = await import('../../src/app/api/v1/bookings/[bookingId]/cancel/route');
const { GET: getBooking } = await import('../../src/app/api/v1/bookings/[bookingId]/route');

const admin = new PrismaClient();

let orgId: string;
let operatorId: string;
let touristAId: string;
let touristBId: string;

function jsonRequest(url: string, headers: Headers, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method: 'POST', headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `BOOKINGS-V2-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, touristA, touristB] = await Promise.all([
    admin.user.create({ data: { email: `v2-op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `v2-a-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `v2-b-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  touristAId = touristA.id;
  touristBId = touristB.id;
});

afterAll(async () => {
  // Guard against the undefined-id-wipes-a-table class of bug (this exact
  // pattern caused a real incident this session): if beforeAll never
  // finished, orgId is undefined and admin.user.deleteMany's raw (non-RLS,
  // users has no policy) filter would silently become an unscoped
  // deleteMany({}) -- skip the deletion entirely rather than risk that.
  if (orgId) {
    await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
    await admin.user.deleteMany({ where: { organizationId: orgId } });
    await admin.organization.delete({ where: { id: orgId } });
  }
  await admin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('POST /api/v1/bookings/tailor-made', () => {
  it('a tourist can create a bespoke trip request with no departure (201, AWAITING_QUOTATION)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('http://localhost/api/v1/bookings/tailor-made', headers, {
      customCountry: 'NA',
      customTravelStart: '2027-01-10',
      customTravelEnd: '2027-01-15',
      seats: 2,
      customDescription: 'A private Etosha + Sossusvlei combo, 6 days.',
    });
    const res = await createTailorMade(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.booking.origin).toBe('TAILOR_MADE');
    expect(body.booking.departureId).toBeNull();
    expect(body.booking.status).toBe('AWAITING_QUOTATION');
    expect(body.booking.priceMinor).toBeNull();
    // 6-char pattern code (2-3 non-adjacent unique letters + unique digits) --
    // no longer POL-{year}-{seq}, see domain.ts's generateConfirmationCode.
    expect(body.booking.bookingReference).toMatch(/^[A-Z0-9]{6}$/);
    // Defaults to empty, not null/undefined, when the guest picks none (DR-046).
    expect(body.booking.preferredTags).toEqual([]);
    expect(body.booking.preferredSites).toEqual([]);
  }, 30_000);

  // DR-046: the merged "plan my trip" form's preference questions (old
  // quiz tags/sites) are carried onto the booking as staff context, not
  // used for any package matching/scoring anymore.
  it('persists preferredTags/preferredSites when the guest picks some', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('http://localhost/api/v1/bookings/tailor-made', headers, {
      customCountry: 'NA',
      customTravelStart: '2027-02-10',
      customTravelEnd: '2027-02-15',
      seats: 2,
      customDescription: 'A wildlife-focused trip.',
      preferredTags: ['WILDLIFE', 'ADVENTURE'],
      preferredSites: ['Etosha National Park', 'Sossusvlei'],
    });
    const res = await createTailorMade(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.booking.preferredTags).toEqual(['WILDLIFE', 'ADVENTURE']);
    expect(body.booking.preferredSites).toEqual(['Etosha National Park', 'Sossusvlei']);
  }, 30_000);
});

describe('quotation send -> accept -> refund lifecycle', () => {
  let bookingId: string;

  beforeAll(async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('http://localhost/api/v1/bookings/tailor-made', headers, {
      customCountry: 'NA',
      customTravelStart: '2027-02-01',
      customTravelEnd: '2027-02-05',
      seats: 1,
      customDescription: 'Lifecycle fixture.',
    });
    const res = await createTailorMade(req, { params: Promise.resolve({}) });
    bookingId = (await res.json()).booking.id;
  }, 30_000);

  it('a TOURIST cannot send a quotation (403)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/quotation`, headers, {
      priceMinor: 150000,
      currency: 'USD',
    });
    const res = await sendQuotation(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(403);
  });

  it('staff (TOUR_OPERATOR) can send a quotation (200, QUOTATION_SENT, priced)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/quotation`, headers, {
      priceMinor: 150000,
      currency: 'USD',
    });
    const res = await sendQuotation(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.booking.status).toBe('QUOTATION_SENT');
    expect(body.booking.priceMinor).toBe(150000);
    expect(body.booking.currency).toBe('USD');
  }, 30_000);

  it("a different tourist cannot accept tourist A's quotation (404)", async () => {
    const headers = await loginAs(touristBId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/quotation/accept`, headers, undefined);
    const res = await acceptQuotation(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(404);
  });

  it('tourist A can accept their own quotation (200, AWAITING_DEPOSIT)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/quotation/accept`, headers, undefined);
    const res = await acceptQuotation(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
    expect((await res.json()).booking.status).toBe('AWAITING_DEPOSIT');
  });

  it('a TOURIST cannot refund a booking (403)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/refund`, headers, undefined);
    const res = await refundBooking(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(403);
  });

  it('staff cancels, then marks the booking refunded (200, REFUNDED)', async () => {
    const opHeaders = await loginAs(operatorId);
    const cancelReq = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/cancel`, opHeaders, undefined);
    const cancelRes = await cancelBooking(cancelReq, { params: Promise.resolve({ bookingId }) });
    expect(cancelRes.status).toBe(200);
    expect((await cancelRes.json()).booking.status).toBe('CANCELLED');

    const refundReq = jsonRequest(`http://localhost/api/v1/bookings/${bookingId}/refund`, opHeaders, undefined);
    const refundRes = await refundBooking(refundReq, { params: Promise.resolve({ bookingId }) });
    expect(refundRes.status).toBe(200);
    expect((await refundRes.json()).booking.status).toBe('REFUNDED');
  }, 30_000); // cancel fires a real notification send (Resend/Africa's Talking round-trip); 20s default can be tight

  it('a REFUNDED booking is a terminal state (further reads still succeed, 200)', async () => {
    const headers = await loginAs(touristAId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}`, { headers });
    const res = await getBooking(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
    expect((await res.json()).booking.status).toBe('REFUNDED');
  });
});
