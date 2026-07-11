import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';

const { GET: listOfficers } = await import('../../src/app/api/v1/immigration/officers/route');
const { PATCH: assignCountry } = await import('../../src/app/api/v1/users/[userId]/assign-country/route');
const { GET: listForCountry } = await import('../../src/app/api/v1/immigration/visa-applications/route');

const admin = new PrismaClient();

let orgId: string;
let superadminId: string;
let operatorId: string;
let officerId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `OFFICERS-API-TEST-${Date.now()}`, countries: ['NA', 'CD'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [superadmin, operator, officer] = await Promise.all([
    admin.user.create({ data: { email: `sa-${Date.now()}@example.test`, role: 'SUPERADMIN', organizationId: orgId } }),
    admin.user.create({ data: { email: `op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({
      data: { email: `io-${Date.now()}@example.test`, role: 'IMMIGRATION_OFFICER', organizationId: orgId, assignedCountry: 'NA' },
    }),
  ]);
  superadminId = superadmin.id;
  operatorId = operator.id;
  officerId = officer.id;
});

afterAll(async () => {
  await withOrg(orgId, (tx) => tx.auditLog.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('GET /api/v1/immigration/officers', () => {
  it('a SUPERADMIN lists officers in the org plus its available countries (200)', async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest('http://localhost/api/v1/immigration/officers', { headers });
    const res = await listOfficers(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.officers.map((o: { id: string }) => o.id)).toContain(officerId);
    expect(body.availableCountries.sort()).toEqual(['CD', 'NA']);
  });

  it('a TOUR_OPERATOR cannot list officers (403)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest('http://localhost/api/v1/immigration/officers', { headers });
    const res = await listOfficers(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it('an IMMIGRATION_OFFICER cannot list fellow officers (403)', async () => {
    const headers = await loginAs(officerId);
    const req = new NextRequest('http://localhost/api/v1/immigration/officers', { headers });
    const res = await listOfficers(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});

describe('DR-020 audit gaps closed', () => {
  it('assigning an officer a country writes an audit entry', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest(`http://localhost/api/v1/users/${officerId}/assign-country`, headers, 'PATCH', {
      country: 'CD',
    });
    const res = await assignCountry(req, { params: Promise.resolve({ userId: officerId }) });
    expect(res.status).toBe(200);

    const entry = await withOrg(orgId, (tx) =>
      tx.auditLog.findFirst({
        where: { organizationId: orgId, action: 'auth.officer_country_assigned', resourceId: officerId },
      }),
    );
    expect(entry).not.toBeNull();
  });

  it("an officer viewing their queue writes an audit entry (audit.ts: 'immigration-officer reads ... must call this')", async () => {
    const headers = await loginAs(officerId);
    const req = new NextRequest('http://localhost/api/v1/immigration/visa-applications', { headers });
    const res = await listForCountry(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);

    const entry = await withOrg(orgId, (tx) =>
      tx.auditLog.findFirst({
        where: { organizationId: orgId, action: 'visa.officer_viewed_queue', actorUserId: officerId },
      }),
    );
    expect(entry).not.toBeNull();
  });
});
