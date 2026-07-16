import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { formatPackageReference } from '@modules/catalog';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { generateConfirmationCode } from '../../src/modules/booking';

// Same real-notification-send-guard convention as tests/api/bookings.api.test.ts --
// contactTraveler/requestMissingDocuments (DR-034) call notificationsService.notify
// for real, which would otherwise attempt a genuine SMS/email send every run.
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

const { POST: contactTraveler } = await import(
  '../../src/app/api/v1/bookings/[bookingId]/travelers/[travelerId]/visa/contact/route'
);
const { POST: requestMissingDocuments } = await import(
  '../../src/app/api/v1/bookings/[bookingId]/travelers/[travelerId]/visa/request-documents/route'
);

const admin = new PrismaClient();

let orgId: string;
let touristId: string;
let facilitatorId: string;
let bookingId: string;
let travelerId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `VISA-CONTACT-API-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [tourist, facilitator] = await Promise.all([
    admin.user.create({ data: { email: `t-viscontact-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `vf-viscontact-${Date.now()}@example.test`, role: 'VISA_FACILITATOR', organizationId: orgId } }),
  ]);
  touristId = tourist.id;
  facilitatorId = facilitator.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: 'Visa Contact Fixture Safari',
        description: 'Fixture.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), capacity: 2, status: 'SCHEDULED' },
    });
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId: departure.id,
        touristUserId: touristId,
        confirmationCode: generateConfirmationCode(),
        bookingReference: generateConfirmationCode(),
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
      },
    });
    bookingId = booking.id;
    const traveler = await tx.traveler.create({
      data: {
        organizationId: orgId,
        bookingId,
        firstName: 'Visa',
        lastName: 'Contactee',
        age: 30,
        sex: 'M',
        nationality: 'ZA',
        idOrPassportNumber: 'PASS789',
        isTourLead: true,
      },
    });
    travelerId = traveler.id;
  });
});

afterAll(async () => {
  await withOrg(orgId, (tx) => tx.traveler.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('POST /api/v1/bookings/:bookingId/travelers/:travelerId/visa/contact', () => {
  it('a VISA_FACILITATOR sends a message (204) and it triggers a real notification send attempt', async () => {
    notificationSendMock.mockClear();
    const headers = await loginAs(facilitatorId);
    const req = jsonRequest(
      `http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId}/visa/contact`,
      headers,
      'POST',
      { message: 'Please send your passport scan.' },
    );
    const res = await contactTraveler(req, { params: Promise.resolve({ bookingId, travelerId }) });
    expect(res.status).toBe(204);
    expect(notificationSendMock).toHaveBeenCalled();
  }, 40_000); // several sequential DB round-trips (findTraveler, getBookingForTraveler, notify's authService.getUser, audit) -- same timeout-bump precedent as assignment.api.test.ts

  it('rejects an empty message (422)', async () => {
    const headers = await loginAs(facilitatorId);
    const req = jsonRequest(
      `http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId}/visa/contact`,
      headers,
      'POST',
      { message: '' },
    );
    const res = await contactTraveler(req, { params: Promise.resolve({ bookingId, travelerId }) });
    expect(res.status).toBe(422);
  });

  it('a TOURIST cannot contact a traveler (403, no visa.process)', async () => {
    const headers = await loginAs(touristId);
    const req = jsonRequest(
      `http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId}/visa/contact`,
      headers,
      'POST',
      { message: 'hi' },
    );
    const res = await contactTraveler(req, { params: Promise.resolve({ bookingId, travelerId }) });
    expect(res.status).toBe(403);
  });

  it('404s for a traveler not on this booking', async () => {
    const headers = await loginAs(facilitatorId);
    const req = jsonRequest(
      `http://localhost/api/v1/bookings/${bookingId}/travelers/00000000-0000-0000-0000-000000000000/visa/contact`,
      headers,
      'POST',
      { message: 'hi' },
    );
    const res = await contactTraveler(req, { params: Promise.resolve({ bookingId, travelerId: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/bookings/:bookingId/travelers/:travelerId/visa/request-documents', () => {
  it('a VISA_FACILITATOR requests missing documents (204) and it triggers a real notification send attempt', async () => {
    notificationSendMock.mockClear();
    const headers = await loginAs(facilitatorId);
    const req = new NextRequest(
      `http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId}/visa/request-documents`,
      { method: 'POST', headers },
    );
    const res = await requestMissingDocuments(req, { params: Promise.resolve({ bookingId, travelerId }) });
    expect(res.status).toBe(204);
    expect(notificationSendMock).toHaveBeenCalled();
  }, 40_000);

  it('a TOURIST cannot request documents (403, no visa.process)', async () => {
    const headers = await loginAs(touristId);
    const req = new NextRequest(
      `http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId}/visa/request-documents`,
      { method: 'POST', headers },
    );
    const res = await requestMissingDocuments(req, { params: Promise.resolve({ bookingId, travelerId }) });
    expect(res.status).toBe(403);
  });
});
