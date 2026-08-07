import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';

const { GET: listSites, POST: createSite } = await import('../../src/app/api/v1/sites/route');
const { GET: getSite, PATCH: updateSite, DELETE: deleteSite } = await import('../../src/app/api/v1/sites/[siteId]/route');

/**
 * DR-083: staff-managed reference list of named sites/attractions per
 * country, populating the itinerary daily-schedule's "planned sites"
 * picker -- same CRUD shape as the pre-existing Hotel/Restaurant tests.
 */
const admin = new PrismaClient();

let orgId: string;
let operatorId: string;
let touristId: string;
let siteId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `SITES-API-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, tourist] = await Promise.all([
    admin.user.create({ data: { email: `op-sites-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `t-sites-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  touristId = tourist.id;
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.site.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('POST /api/v1/sites', () => {
  it('a TOURIST cannot create a site (403)', async () => {
    const headers = await loginAs(touristId);
    const req = jsonRequest('http://localhost/api/v1/sites', headers, 'POST', { name: 'Etosha Gate', country: 'NA' });
    const res = await createSite(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it('an operator creates a site (201)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest('http://localhost/api/v1/sites', headers, 'POST', { name: 'Etosha Gate', country: 'NA' });
    const res = await createSite(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.site.name).toBe('Etosha Gate');
    siteId = body.site.id;
  });

  it('rejects a duplicate (organizationId, country, name) (422/409)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest('http://localhost/api/v1/sites', headers, 'POST', { name: 'Etosha Gate', country: 'NA' });
    const res = await createSite(req, { params: Promise.resolve({}) });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('GET /api/v1/sites', () => {
  it('lists sites in the org (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest('http://localhost/api/v1/sites', { headers });
    const res = await listSites(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sites.some((s: { id: string }) => s.id === siteId)).toBe(true);
  });

  it('gets a single site (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/sites/${siteId}`, { headers });
    const res = await getSite(req, { params: Promise.resolve({ siteId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.site.id).toBe(siteId);
  });
});

describe('PATCH /api/v1/sites/:siteId', () => {
  it('an operator renames a site (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/sites/${siteId}`, headers, 'PATCH', { name: 'Etosha Main Gate' });
    const res = await updateSite(req, { params: Promise.resolve({ siteId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.site.name).toBe('Etosha Main Gate');
  });

  it('a TOURIST cannot update a site (403)', async () => {
    const headers = await loginAs(touristId);
    const req = jsonRequest(`http://localhost/api/v1/sites/${siteId}`, headers, 'PATCH', { name: 'Hostile Rename' });
    const res = await updateSite(req, { params: Promise.resolve({ siteId }) });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/sites/:siteId', () => {
  it('a TOURIST cannot delete a site (403)', async () => {
    const headers = await loginAs(touristId);
    const req = new NextRequest(`http://localhost/api/v1/sites/${siteId}`, { method: 'DELETE', headers });
    const res = await deleteSite(req, { params: Promise.resolve({ siteId }) });
    expect(res.status).toBe(403);
  });

  it('an operator deletes a site (204, hard delete)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/sites/${siteId}`, { method: 'DELETE', headers });
    const res = await deleteSite(req, { params: Promise.resolve({ siteId }) });
    expect(res.status).toBe(204);

    const getReq = new NextRequest(`http://localhost/api/v1/sites/${siteId}`, { headers });
    const getRes = await getSite(getReq, { params: Promise.resolve({ siteId }) });
    expect(getRes.status).toBe(404);
  });
});
