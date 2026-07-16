import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as listGuides } from '../../src/app/api/v1/fleet/guides/route';
import { GET as getGuide } from '../../src/app/api/v1/fleet/guides/[guideProfileId]/route';

/**
 * Anti-BOLA (Vol. 8, API1): RLS only isolates by organizationId -- it does
 * NOT stop one TOUR_GUIDE from reading another's profile in the same org.
 * That ownership check lives in fleet/service.ts (mirrors driver_profiles'
 * equivalent, tests/api/fleet.security.test.ts).
 */
const admin = new PrismaClient();

let orgId: string;
let operatorId: string;
let guideAId: string;
let guideBId: string;
let guideProfileAId: string;

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `GUIDES-SEC-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, guideA, guideB] = await Promise.all([
    admin.user.create({ data: { email: `op-guides-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `guide-a-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
    admin.user.create({ data: { email: `guide-b-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  guideAId = guideA.id;
  guideBId = guideB.id;

  await withOrg(orgId, async (tx) => {
    const guideProfile = await tx.guideProfile.create({
      data: { organizationId: orgId, userId: guideAId, languages: ['en'], specialties: ['wildlife'] },
    });
    guideProfileAId = guideProfile.id;
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
  await withOrg(orgId, (tx) => tx.guideProfile.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('anti-BOLA: guide profile ownership', () => {
  it("TOUR_GUIDE B cannot read TOUR_GUIDE A's profile (404, not 403 -- don't leak existence)", async () => {
    const headers = await loginAs(guideBId);
    const req = new NextRequest(`http://localhost/api/v1/fleet/guides/${guideProfileAId}`, { headers });
    const res = await getGuide(req, { params: Promise.resolve({ guideProfileId: guideProfileAId }) });
    expect(res.status).toBe(404);
  });

  it('TOUR_GUIDE A can read their own profile (200)', async () => {
    const headers = await loginAs(guideAId);
    const req = new NextRequest(`http://localhost/api/v1/fleet/guides/${guideProfileAId}`, { headers });
    const res = await getGuide(req, { params: Promise.resolve({ guideProfileId: guideProfileAId }) });
    expect(res.status).toBe(200);
  });

  it('TOUR_GUIDE cannot list all guide profiles (403, managers-only)', async () => {
    const headers = await loginAs(guideAId);
    const req = new NextRequest('http://localhost/api/v1/fleet/guides', { headers });
    const res = await listGuides(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it('an operator can list all guide profiles (200) and read any guide profile', async () => {
    const listHeaders = await loginAs(operatorId);
    const listReq = new NextRequest('http://localhost/api/v1/fleet/guides', { headers: listHeaders });
    const listRes = await listGuides(listReq, { params: Promise.resolve({}) });
    expect(listRes.status).toBe(200);
    const body = await listRes.json();
    expect(body.guides.some((g: { id: string }) => g.id === guideProfileAId)).toBe(true);

    const getHeaders = await loginAs(operatorId);
    const getReq = new NextRequest(`http://localhost/api/v1/fleet/guides/${guideProfileAId}`, { headers: getHeaders });
    const getRes = await getGuide(getReq, { params: Promise.resolve({ guideProfileId: guideProfileAId }) });
    expect(getRes.status).toBe(200);
  });
});
