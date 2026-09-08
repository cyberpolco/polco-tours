import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { BOOKING_SETUP_COOKIE, createBookingSetupToken } from '../../src/lib/booking-setup-token';

/**
 * DR-216/DR-257's documents/passport-upload route deliberately bypasses
 * `withAuth` (same two-trust-model shape as cms/media-upload, DR-163) --
 * Vercel's own `blob.upload-completed` callback carries no session or
 * cookie at all. This had no dedicated route/security test anywhere
 * (found by an architecture audit) despite handling a crown-jewel asset
 * (passport documents) -- the only existing coverage was incidental,
 * exercised as a side effect of unrelated DR-257 flow tests. Covers the
 * `assertMayUploadPassport` gate's two independent paths: the
 * `booking_setup` cookie (DR-257, no session needed) and the session
 * fallback (the wizard's own anonymous guest session). `handleUpload`'s
 * real Vercel Blob API call and `next/headers`' request-scoped `cookies()`
 * are both mocked -- this is a permission-boundary test, not a Blob
 * integration test.
 */
const { handleUploadMock, cookiesMock } = vi.hoisted(() => ({
  handleUploadMock: vi.fn(),
  cookiesMock: vi.fn(),
}));
vi.mock('@vercel/blob/client', () => ({ handleUpload: handleUploadMock }));
vi.mock('next/headers', () => ({ cookies: cookiesMock }));

const { POST } = await import('../../src/app/api/v1/documents/passport-upload/route');

const admin = new PrismaClient();

let orgId: string;
let touristId: string;

function setBookingSetupCookie(value: string | undefined): void {
  cookiesMock.mockResolvedValue({
    get: (name: string) => (name === BOOKING_SETUP_COOKIE && value !== undefined ? { value } : undefined),
  });
}

function tokenRequest(headers: Headers): NextRequest {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json');
  return new NextRequest('http://localhost/api/v1/documents/passport-upload', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      type: 'blob.generate-client-token',
      payload: { pathname: 'passports/test.pdf', callbackUrl: 'http://localhost/api/v1/documents/passport-upload' },
    }),
  });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `PASSPORT-UPLOAD-SEC-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;
  const tourist = await admin.user.create({ data: { email: `t-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } });
  touristId = tourist.id;
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
  await withOrg(orgId, (tx) => tx.auditLog.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

beforeEach(() => {
  handleUploadMock.mockReset();
  cookiesMock.mockReset();
});

describe('anti-BOLA: documents/passport-upload client-token gate (DR-216/DR-257)', () => {
  it('no booking_setup cookie and no session -> 401, handleUpload never called', async () => {
    setBookingSetupCookie(undefined);
    const res = await POST(tokenRequest(new Headers()));
    expect(res.status).toBe(401);
    expect(handleUploadMock).not.toHaveBeenCalled();
  });

  it('no booking_setup cookie, but a real signed-in session -> passes through to handleUpload', async () => {
    setBookingSetupCookie(undefined);
    handleUploadMock.mockResolvedValueOnce({ type: 'blob.generate-client-token', clientToken: 'fake-token' });
    const headers = await loginAs(touristId);
    const res = await POST(tokenRequest(headers));
    expect(handleUploadMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('a valid booking_setup cookie authorises the upload with no session at all', async () => {
    setBookingSetupCookie(createBookingSetupToken('11111111-1111-4111-8111-111111111111'));
    handleUploadMock.mockResolvedValueOnce({ type: 'blob.generate-client-token', clientToken: 'fake-token' });
    const res = await POST(tokenRequest(new Headers()));
    expect(handleUploadMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('an expired booking_setup cookie falls back to requiring a real session -> 401 with none', async () => {
    const expired = createBookingSetupToken('11111111-1111-4111-8111-111111111111', new Date(Date.now() - 2 * 60 * 60 * 1000));
    setBookingSetupCookie(expired);
    const res = await POST(tokenRequest(new Headers()));
    expect(res.status).toBe(401);
    expect(handleUploadMock).not.toHaveBeenCalled();
  });

  it("a blob.upload-completed callback bypasses the check entirely -- Vercel's own request carries no session or cookie", async () => {
    handleUploadMock.mockResolvedValueOnce({ type: 'blob.upload-completed', response: {} });
    const req = new NextRequest('http://localhost/api/v1/documents/passport-upload', {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ type: 'blob.upload-completed', payload: {} }),
    });
    const res = await POST(req);
    expect(handleUploadMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(cookiesMock).not.toHaveBeenCalled();
  });
});
