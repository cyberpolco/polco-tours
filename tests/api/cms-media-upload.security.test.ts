import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';

/**
 * DR-163's cms/media-upload route deliberately bypasses `withAuth` (see the
 * route's own comment) since it serves two different trust models --
 * Vercel's own `blob.upload-completed` callback carries no staff session at
 * all. This covers the one path that DOES need a staff session
 * (`blob.generate-client-token`): the inline `cms.write` + hardcoded
 * SUPERADMIN check, which had zero test coverage anywhere before this
 * (found by an architecture audit). `handleUpload`'s real Vercel Blob API
 * call is mocked out -- this is a permission-boundary test, not an
 * integration test of Blob itself (that's `public-image-blob.test.ts`'s job).
 */
const { handleUploadMock } = vi.hoisted(() => ({ handleUploadMock: vi.fn() }));
vi.mock('@vercel/blob/client', () => ({ handleUpload: handleUploadMock }));

const { POST } = await import('../../src/app/api/v1/cms/media-upload/route');

const admin = new PrismaClient();

let orgId: string;
let touristId: string;
let operatorId: string;
let superadminId: string;

function tokenRequest(headers: Headers): NextRequest {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json');
  return new NextRequest('http://localhost/api/v1/cms/media-upload', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      type: 'blob.generate-client-token',
      payload: { pathname: 'home-hero/test.mp4', callbackUrl: 'http://localhost/api/v1/cms/media-upload' },
    }),
  });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `CMS-UPLOAD-SEC-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [tourist, operator, superadmin] = await Promise.all([
    admin.user.create({ data: { email: `t-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `sa-${Date.now()}@example.test`, role: 'SUPERADMIN', organizationId: orgId } }),
  ]);
  touristId = tourist.id;
  operatorId = operator.id;
  superadminId = superadmin.id;
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
});

describe('anti-BOLA: cms/media-upload client-token gate (DR-163)', () => {
  it('an unauthenticated request is rejected before handleUpload is ever called', async () => {
    const res = await POST(tokenRequest(new Headers()));
    expect(res.status).toBe(401);
    expect(handleUploadMock).not.toHaveBeenCalled();
  });

  it('a TOURIST is rejected (lacks cms.write)', async () => {
    const headers = await loginAs(touristId);
    const res = await POST(tokenRequest(headers));
    expect(res.status).toBe(403);
    expect(handleUploadMock).not.toHaveBeenCalled();
  });

  it('a TOUR_OPERATOR is rejected too -- cms.write is granted to no role but SUPERADMIN', async () => {
    const headers = await loginAs(operatorId);
    const res = await POST(tokenRequest(headers));
    expect(res.status).toBe(403);
    expect(handleUploadMock).not.toHaveBeenCalled();
  });

  it('a SUPERADMIN passes the auth gate and reaches handleUpload', async () => {
    handleUploadMock.mockResolvedValueOnce({ type: 'blob.generate-client-token', clientToken: 'fake-token' });
    const headers = await loginAs(superadminId);
    const res = await POST(tokenRequest(headers));
    expect(handleUploadMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it("a blob.upload-completed callback bypasses the staff auth check entirely -- Vercel's own request carries no session", async () => {
    handleUploadMock.mockResolvedValueOnce({ type: 'blob.upload-completed', response: {} });
    const req = new NextRequest('http://localhost/api/v1/cms/media-upload', {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ type: 'blob.upload-completed', payload: {} }),
    });
    const res = await POST(req);
    expect(handleUploadMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });
});
