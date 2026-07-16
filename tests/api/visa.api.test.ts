import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { formatPackageReference } from '@modules/catalog';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { generateConfirmationCode } from '../../src/modules/booking';

// Same Vercel Blob gateway mock convention as tests/api/booking-setup.api.test.ts.
const { uploadMock, downloadMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(async (pathname: string) => ({ pathname })),
  downloadMock: vi.fn(async () => ({
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('%PDF-visa-fixture'));
        controller.close();
      },
    }),
  })),
}));
vi.mock('@modules/documents/gateway', () => ({
  blobGateway: { upload: uploadMock, download: downloadMock },
  BlobGatewayError: class BlobGatewayError extends Error {},
}));

const { GET: getApplication } = await import(
  '../../src/app/api/v1/bookings/[bookingId]/travelers/[travelerId]/visa/route'
);
const { POST: submitApplication } = await import(
  '../../src/app/api/v1/bookings/[bookingId]/travelers/[travelerId]/visa/submit/route'
);
const { POST: decideApplication } = await import(
  '../../src/app/api/v1/bookings/[bookingId]/travelers/[travelerId]/visa/decide/route'
);
const { POST: resubmitApplication } = await import(
  '../../src/app/api/v1/bookings/[bookingId]/travelers/[travelerId]/visa/resubmit/route'
);
const { GET: downloadVisaDocument, POST: uploadVisaDocument } = await import(
  '../../src/app/api/v1/bookings/[bookingId]/travelers/[travelerId]/visa/document/route'
);

const admin = new PrismaClient();

let orgId: string;
let touristId: string;
let facilitatorId: string;
let operatorId: string;
let bookingId: string;
let travelerId: string;
let travelerId2: string; // dedicated to the resubmit lifecycle, so it doesn't collide with travelerId's APPROVED end state

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `VISA-API-TEST-${Date.now()}`, countries: ['NA', 'CD'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [tourist, facilitator, operator] = await Promise.all([
    admin.user.create({ data: { email: `t-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `vf-${Date.now()}@example.test`, role: 'VISA_FACILITATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
  ]);
  touristId = tourist.id;
  facilitatorId = facilitator.id;
  operatorId = operator.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: 'Visa Fixture Safari',
        description: 'Fixture for visa API tests.',
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
        lastName: 'Applicant',
        age: 30,
        sex: 'M',
        nationality: 'ZA',
        idOrPassportNumber: 'PASS123',
        isTourLead: true,
      },
    });
    travelerId = traveler.id;

    const traveler2 = await tx.traveler.create({
      data: {
        organizationId: orgId,
        bookingId,
        firstName: 'Resubmit',
        lastName: 'Applicant',
        age: 28,
        sex: 'F',
        nationality: 'ZA',
        idOrPassportNumber: 'PASS456',
        isTourLead: false,
      },
    });
    travelerId2 = traveler2.id;
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
  await withOrg(orgId, (tx) => tx.visaApplication.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.traveler.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('POST /api/v1/bookings/:bookingId/travelers/:travelerId/visa/submit', () => {
  it('a VISA_FACILITATOR submits an application, snapshotting the destination country (201)', async () => {
    const headers = await loginAs(facilitatorId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId}/visa/submit`, {
      method: 'POST',
      headers,
    });
    const res = await submitApplication(req, { params: Promise.resolve({ bookingId, travelerId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.application.status).toBe('SUBMITTED');
    expect(body.application.country).toBe('NA');
  });

  it('rejects a second submission for the same traveler (409)', async () => {
    const headers = await loginAs(facilitatorId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId}/visa/submit`, {
      method: 'POST',
      headers,
    });
    const res = await submitApplication(req, { params: Promise.resolve({ bookingId, travelerId }) });
    expect(res.status).toBe(409);
  });

  it('a TOURIST cannot submit an application (403)', async () => {
    const headers = await loginAs(touristId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId}/visa/submit`, {
      method: 'POST',
      headers,
    });
    const res = await submitApplication(req, { params: Promise.resolve({ bookingId, travelerId }) });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/bookings/:bookingId/travelers/:travelerId/visa', () => {
  it('an operator (documents.read) can view the application (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId}/visa`, { headers });
    const res = await getApplication(req, { params: Promise.resolve({ bookingId, travelerId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.application.status).toBe('SUBMITTED');
    expect(body.application.rejectionReason).toBeNull();
    expect(body.application.resubmissionCount).toBe(0);
  });
});

describe('POST /api/v1/bookings/:bookingId/travelers/:travelerId/visa/decide', () => {
  it('a VISA_FACILITATOR approves the application (200)', async () => {
    const headers = await loginAs(facilitatorId);
    const req = jsonRequest(
      `http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId}/visa/decide`,
      headers,
      'POST',
      { outcome: 'APPROVED' },
    );
    const res = await decideApplication(req, { params: Promise.resolve({ bookingId, travelerId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.application.status).toBe('APPROVED');
    expect(body.application.decidedAt).not.toBeNull();
  });

  it('rejects deciding an already-decided application (409)', async () => {
    const headers = await loginAs(facilitatorId);
    const req = jsonRequest(
      `http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId}/visa/decide`,
      headers,
      'POST',
      { outcome: 'REJECTED' },
    );
    const res = await decideApplication(req, { params: Promise.resolve({ bookingId, travelerId }) });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/v1/bookings/:bookingId/travelers/:travelerId/visa/resubmit', () => {
  it('resubmit on a traveler with no application (404)', async () => {
    const headers = await loginAs(facilitatorId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId2}/visa/resubmit`, {
      method: 'POST',
      headers,
    });
    const res = await resubmitApplication(req, { params: Promise.resolve({ bookingId, travelerId: travelerId2 }) });
    expect(res.status).toBe(404);
  });

  it('runs the full reject -> resubmit -> reject -> resubmit -> approve cycle', async () => {
    const facilitatorHeaders = await loginAs(facilitatorId);

    // submit
    let res = await submitApplication(
      new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId2}/visa/submit`, {
        method: 'POST',
        headers: facilitatorHeaders,
      }),
      { params: Promise.resolve({ bookingId, travelerId: travelerId2 }) },
    );
    expect(res.status).toBe(201);

    // reject with a reason
    res = await decideApplication(
      jsonRequest(
        `http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId2}/visa/decide`,
        facilitatorHeaders,
        'POST',
        { outcome: 'REJECTED', reason: 'passport photo unreadable' },
      ),
      { params: Promise.resolve({ bookingId, travelerId: travelerId2 }) },
    );
    expect(res.status).toBe(200);
    let body = await res.json();
    expect(body.application.status).toBe('REJECTED');
    expect(body.application.rejectionReason).toBe('passport photo unreadable');

    // resubmit while REJECTED (200)
    res = await resubmitApplication(
      new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId2}/visa/resubmit`, {
        method: 'POST',
        headers: facilitatorHeaders,
      }),
      { params: Promise.resolve({ bookingId, travelerId: travelerId2 }) },
    );
    expect(res.status).toBe(200);
    body = await res.json();
    expect(body.application.status).toBe('SUBMITTED');
    expect(body.application.rejectionReason).toBeNull();
    expect(body.application.documentId).toBeNull();
    expect(body.application.resubmissionCount).toBe(1);

    // resubmitting again while SUBMITTED (409)
    res = await resubmitApplication(
      new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId2}/visa/resubmit`, {
        method: 'POST',
        headers: facilitatorHeaders,
      }),
      { params: Promise.resolve({ bookingId, travelerId: travelerId2 }) },
    );
    expect(res.status).toBe(409);

    // reject again
    res = await decideApplication(
      jsonRequest(
        `http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId2}/visa/decide`,
        facilitatorHeaders,
        'POST',
        { outcome: 'REJECTED', reason: 'missing bank statement' },
      ),
      { params: Promise.resolve({ bookingId, travelerId: travelerId2 }) },
    );
    expect(res.status).toBe(200);

    // resubmit a second time
    res = await resubmitApplication(
      new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId2}/visa/resubmit`, {
        method: 'POST',
        headers: facilitatorHeaders,
      }),
      { params: Promise.resolve({ bookingId, travelerId: travelerId2 }) },
    );
    expect(res.status).toBe(200);
    body = await res.json();
    expect(body.application.resubmissionCount).toBe(2);

    // upload a fresh document after resubmission -- proves the nulled documentId
    // doesn't leave anything stale reachable, and a new upload attaches cleanly
    const formData = new FormData();
    formData.append(
      'file',
      new File([new TextEncoder().encode('%PDF-visa-fixture')], 'visa.pdf', { type: 'application/pdf' }),
    );
    res = await uploadVisaDocument(
      new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId2}/visa/document`, {
        method: 'POST',
        headers: facilitatorHeaders,
        body: formData,
      }),
      { params: Promise.resolve({ bookingId, travelerId: travelerId2 }) },
    );
    expect(res.status).toBe(201);
    uploadMock.mockClear(); // shared module-level mock -- the sibling document-upload test asserts toHaveBeenCalledOnce()

    // approve
    res = await decideApplication(
      jsonRequest(
        `http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId2}/visa/decide`,
        facilitatorHeaders,
        'POST',
        { outcome: 'APPROVED' },
      ),
      { params: Promise.resolve({ bookingId, travelerId: travelerId2 }) },
    );
    expect(res.status).toBe(200);
    body = await res.json();
    expect(body.application.status).toBe('APPROVED');
    expect(body.application.rejectionReason).toBeNull();
  }, 120_000); // ~9 sequential real Neon round-trips; this sandbox's individual calls already run 5-16s each

  it('a TOURIST cannot resubmit (403)', async () => {
    const headers = await loginAs(touristId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId2}/visa/resubmit`, {
      method: 'POST',
      headers,
    });
    const res = await resubmitApplication(req, { params: Promise.resolve({ bookingId, travelerId: travelerId2 }) });
    expect(res.status).toBe(403);
  });
});

describe('POST/GET /api/v1/bookings/:bookingId/travelers/:travelerId/visa/document', () => {
  it('a VISA_FACILITATOR uploads the granted visa document without leaking the blob pathname (201)', async () => {
    const headers = await loginAs(facilitatorId);
    const formData = new FormData();
    formData.append('file', new File([new TextEncoder().encode('%PDF-visa-fixture')], 'visa.pdf', { type: 'application/pdf' }));
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId}/visa/document`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const res = await uploadVisaDocument(req, { params: Promise.resolve({ bookingId, travelerId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.document).not.toHaveProperty('blobPathname');
    expect(uploadMock).toHaveBeenCalledOnce();
  });

  it('streams the visa document bytes back (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${travelerId}/visa/document`, {
      headers,
    });
    const res = await downloadVisaDocument(req, { params: Promise.resolve({ bookingId, travelerId }) });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('%PDF-visa-fixture');
  });
});
