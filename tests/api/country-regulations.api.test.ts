import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as listRegulations, POST as createRegulation } from '../../src/app/api/v1/country-regulations/route';
import {
  GET as getRegulation,
  PATCH as updateRegulation,
  DELETE as deleteRegulation,
} from '../../src/app/api/v1/country-regulations/[country]/route';

/**
 * First API-level test of the DR-034 immigration module: drives the real
 * route handlers (session resolution, RBAC, service). CountryRegulation is
 * platform-wide reference data (no organizationId/RLS, same precedent as
 * TaxRate) -- fixtures still need an org+user for session context, but the
 * table itself isn't org-scoped.
 */
const admin = new PrismaClient();

let orgId: string;
let superadminId: string;
let operatorId: string;

const TEST_COUNTRY = 'ZZ'; // fictitious, avoids colliding with real seeded CD/NA/ZM/ZW rows

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `COUNTRY-REG-API-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [superadmin, operator] = await Promise.all([
    admin.user.create({ data: { email: `superadmin-creg-${Date.now()}@example.test`, role: 'SUPERADMIN', organizationId: orgId } }),
    admin.user.create({ data: { email: `op-creg-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
  ]);
  superadminId = superadmin.id;
  operatorId = operator.id;
});

afterAll(async () => {
  await admin.countryRegulation.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('POST /api/v1/country-regulations', () => {
  it('a SUPERADMIN creates a country regulation (201)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest('http://localhost/api/v1/country-regulations', headers, 'POST', {
      country: TEST_COUNTRY,
      visaRequirements: 'Fixture visa requirements',
      requiredDocuments: 'Fixture required documents',
      entryConditions: 'Fixture entry conditions',
      healthRequirements: 'Fixture health requirements',
    });
    const res = await createRegulation(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.regulation.country).toBe(TEST_COUNTRY);
  });

  it('rejects a duplicate country (409)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest('http://localhost/api/v1/country-regulations', headers, 'POST', {
      country: TEST_COUNTRY,
      visaRequirements: 'x',
      requiredDocuments: 'x',
      entryConditions: 'x',
      healthRequirements: 'x',
    });
    const res = await createRegulation(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/v1/country-regulations', () => {
  it('lists regulations including the fixture (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest('http://localhost/api/v1/country-regulations', { headers });
    const res = await listRegulations(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.regulations.some((r: { country: string }) => r.country === TEST_COUNTRY)).toBe(true);
  });
});

describe('GET /api/v1/country-regulations/:country', () => {
  it('gets the fixture regulation (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/country-regulations/${TEST_COUNTRY}`, { headers });
    const res = await getRegulation(req, { params: Promise.resolve({ country: TEST_COUNTRY }) });
    expect(res.status).toBe(200);
  });

  it('404s for an unknown country', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest('http://localhost/api/v1/country-regulations/QQ', { headers });
    const res = await getRegulation(req, { params: Promise.resolve({ country: 'QQ' }) });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/country-regulations/:country', () => {
  it('a SUPERADMIN updates the fixture (200)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest(`http://localhost/api/v1/country-regulations/${TEST_COUNTRY}`, headers, 'PATCH', {
      processingTimeDays: 7,
    });
    const res = await updateRegulation(req, { params: Promise.resolve({ country: TEST_COUNTRY }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.regulation.processingTimeDays).toBe(7);
  });
});

describe('DELETE /api/v1/country-regulations/:country', () => {
  it('a SUPERADMIN deletes the fixture (204), then it 404s', async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest(`http://localhost/api/v1/country-regulations/${TEST_COUNTRY}`, { method: 'DELETE', headers });
    const res = await deleteRegulation(req, { params: Promise.resolve({ country: TEST_COUNTRY }) });
    expect(res.status).toBe(204);

    const getHeaders = await loginAs(operatorId);
    const getReq = new NextRequest(`http://localhost/api/v1/country-regulations/${TEST_COUNTRY}`, { headers: getHeaders });
    const getRes = await getRegulation(getReq, { params: Promise.resolve({ country: TEST_COUNTRY }) });
    expect(getRes.status).toBe(404);
  });
});
