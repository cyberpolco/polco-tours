import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { formatPackageReference } from '@modules/catalog';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';

// Real RESEND_API_KEY/AFRICAS_TALKING_* credentials now exist in .env/.env.local
// (2026-07-15) and Vitest loads .env automatically -- without this mock,
// confirmBooking's notify() call below would attempt a REAL SMS/email send
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

const { POST: createBooking } = await import('../../src/app/api/v1/bookings/route');
const { POST: confirmBooking } = await import('../../src/app/api/v1/bookings/[bookingId]/confirm/route');

/**
 * First API-level test in the repo: drives the real route handler (session
 * resolution, RBAC, service, RLS) against CI's real Postgres, the same way a
 * production request would flow. Fixtures are seeded directly via Prisma
 * (matching the tests/rls.cross-tenant.*.test.ts pattern) so only the
 * booking routes themselves are under test.
 *
 * Tests run in declaration order within this file (Vitest's default, and
 * vitest.config.ts also disables cross-file parallelism) -- the sold-out
 * case deliberately depends on the create-hold case having already consumed
 * the fixture departure's only seat.
 */
const admin = new PrismaClient();

let orgId: string;
let departureId: string;
let bookingId: string;
let touristAId: string;
let touristBId: string;
let guideId: string;
let operatorId: string;

function jsonRequest(url: string, headers: Headers, body: unknown): NextRequest {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `API-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [touristA, touristB, guide, operator] = await Promise.all([
    admin.user.create({ data: { email: `a-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `b-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `g-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
    admin.user.create({ data: { email: `op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
  ]);
  touristAId = touristA.id;
  touristBId = touristB.id;
  guideId = guide.id;
  operatorId = operator.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: 'API Fixture Safari',
        description: 'Fixture for booking API tests.',
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
        capacity: 1, // deliberately exactly enough for one booking
        status: 'SCHEDULED',
      },
    });
    departureId = departure.id;
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
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('POST /api/v1/bookings', () => {
  it('creates a hold for the authenticated tourist (201)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('http://localhost/api/v1/bookings', headers, { departureId, seats: 1 });
    const res = await createBooking(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.booking.status).toBe('HELD');
    expect(body.booking.touristUserId).toBe(touristAId);
    bookingId = body.booking.id;
  });

  it('rejects once the departure is sold out (409)', async () => {
    const headers = await loginAs(touristBId);
    const req = jsonRequest('http://localhost/api/v1/bookings', headers, { departureId, seats: 1 });
    const res = await createBooking(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.type).toContain('conflict');
  });

  it('rejects a role without booking.create (403)', async () => {
    const headers = await loginAs(guideId);
    const req = jsonRequest('http://localhost/api/v1/bookings', headers, { departureId, seats: 1 });
    const res = await createBooking(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/bookings/:bookingId/confirm', () => {
  it('an operator confirms the held booking (200), notifying without slowing/failing the response', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/confirm`, {
      method: 'POST',
      headers,
    });
    const res = await confirmBooking(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.booking.status).toBe('CONFIRMED');

    // notify() never blocks/fails this response either way (charter rule 8) --
    // it always audits its own outcome (sent or every channel exhausted),
    // regardless of whether real provider credentials are configured in this
    // environment. audit_logs is RLS-protected even for reads, so this must
    // go through withOrg, not the raw admin client.
    const notified = await withOrg(orgId, (tx) =>
      tx.auditLog.findFirst({
        where: { organizationId: orgId, action: { in: ['notification.sent', 'notification.failed'] }, resourceType: 'Notification' },
      }),
    );
    expect(notified).not.toBeNull();
    // Proves the mock actually intercepted this -- not a real network call.
    expect(notificationSendMock).toHaveBeenCalled();
  });
});
