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
 * The highest-value new test this increment (DR-034): guards the first
 * real behavioral gap ever introduced between SUPERADMIN and
 * PLATFORM_ADMIN in this app. rbac.ts's MATRIX can't express "SUPERADMIN
 * yes, PLATFORM_ADMIN no" on its own (both hold '*') -- the actual
 * exclusion lives in immigration/service.ts's isCountryRegulationWriter
 * check, one layer past the route's permission gate. If a future refactor
 * accidentally reverts to "wildcard means wildcard," this is what catches
 * it: PLATFORM_ADMIN passing the route gate but still getting 403'd by the
 * service is the entire point of this suite.
 */
const admin = new PrismaClient();

let orgId: string;
let superadminId: string;
let platformAdminId: string;
let operatorId: string;
let facilitatorId: string;
let touristId: string;

const TEST_COUNTRY = 'YY'; // fictitious, distinct from country-regulations.api.test.ts's ZZ

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `COUNTRY-REG-SEC-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [superadmin, platformAdmin, operator, facilitator, tourist] = await Promise.all([
    admin.user.create({ data: { email: `superadmin-cregsec-${Date.now()}@example.test`, role: 'SUPERADMIN', organizationId: orgId } }),
    admin.user.create({ data: { email: `platformadmin-cregsec-${Date.now()}@example.test`, role: 'PLATFORM_ADMIN', organizationId: orgId } }),
    admin.user.create({ data: { email: `op-cregsec-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `facilitator-cregsec-${Date.now()}@example.test`, role: 'VISA_FACILITATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `tourist-cregsec-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  superadminId = superadmin.id;
  platformAdminId = platformAdmin.id;
  operatorId = operator.id;
  facilitatorId = facilitator.id;
  touristId = tourist.id;

  await admin.countryRegulation.create({
    data: {
      country: TEST_COUNTRY,
      visaRequirements: 'Fixture visa requirements',
      requiredDocuments: 'Fixture required documents',
      entryConditions: 'Fixture entry conditions',
      healthRequirements: 'Fixture health requirements',
    },
  });
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgId was assigned, Prisma silently
  // drops the undefined where-clause value, turning the user cleanup into an
  // unscoped deleteMany that wipes the whole table -- this has hit real
  // production data twice. Skip cleanup entirely rather than risk it.
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await admin.countryRegulation.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('anti-privilege-escalation: country regulation write is SUPERADMIN-only', () => {
  it('SUPERADMIN can update a regulation (200)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest(`http://localhost/api/v1/country-regulations/${TEST_COUNTRY}`, headers, 'PATCH', {
      processingTimeDays: 4,
    });
    const res = await updateRegulation(req, { params: Promise.resolve({ country: TEST_COUNTRY }) });
    expect(res.status).toBe(200);
  });

  it("PLATFORM_ADMIN passes the route's permission gate (via '*') but the SERVICE rejects the write (403)", async () => {
    const headers = await loginAs(platformAdminId);
    const req = jsonRequest(`http://localhost/api/v1/country-regulations/${TEST_COUNTRY}`, headers, 'PATCH', {
      processingTimeDays: 99,
    });
    const res = await updateRegulation(req, { params: Promise.resolve({ country: TEST_COUNTRY }) });
    expect(res.status).toBe(403);
  });

  it('PLATFORM_ADMIN cannot create a new regulation either (403)', async () => {
    const headers = await loginAs(platformAdminId);
    const req = jsonRequest('http://localhost/api/v1/country-regulations', headers, 'POST', {
      country: 'XX',
      visaRequirements: 'x',
      requiredDocuments: 'x',
      entryConditions: 'x',
      healthRequirements: 'x',
    });
    const res = await createRegulation(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it('PLATFORM_ADMIN cannot delete a regulation either (403)', async () => {
    const headers = await loginAs(platformAdminId);
    const req = new NextRequest(`http://localhost/api/v1/country-regulations/${TEST_COUNTRY}`, { method: 'DELETE', headers });
    const res = await deleteRegulation(req, { params: Promise.resolve({ country: TEST_COUNTRY }) });
    expect(res.status).toBe(403);
  });

  it('TOUR_OPERATOR cannot write (403) -- confirmed explicit user choice, not just a PLATFORM_ADMIN carve-out', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/country-regulations/${TEST_COUNTRY}`, headers, 'PATCH', {
      processingTimeDays: 1,
    });
    const res = await updateRegulation(req, { params: Promise.resolve({ country: TEST_COUNTRY }) });
    expect(res.status).toBe(403);
  });

  it('VISA_FACILITATOR cannot write (403)', async () => {
    const headers = await loginAs(facilitatorId);
    const req = jsonRequest(`http://localhost/api/v1/country-regulations/${TEST_COUNTRY}`, headers, 'PATCH', {
      processingTimeDays: 1,
    });
    const res = await updateRegulation(req, { params: Promise.resolve({ country: TEST_COUNTRY }) });
    expect(res.status).toBe(403);
  });
});

describe('country regulation read: available to anyone processing visas', () => {
  it('PLATFORM_ADMIN can read (200) despite not being able to write', async () => {
    const headers = await loginAs(platformAdminId);
    const req = new NextRequest(`http://localhost/api/v1/country-regulations/${TEST_COUNTRY}`, { headers });
    const res = await getRegulation(req, { params: Promise.resolve({ country: TEST_COUNTRY }) });
    expect(res.status).toBe(200);
  });

  it('TOUR_OPERATOR can read (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/country-regulations/${TEST_COUNTRY}`, { headers });
    const res = await getRegulation(req, { params: Promise.resolve({ country: TEST_COUNTRY }) });
    expect(res.status).toBe(200);
  });

  it('VISA_FACILITATOR can read (200)', async () => {
    const headers = await loginAs(facilitatorId);
    const req = new NextRequest(`http://localhost/api/v1/country-regulations/${TEST_COUNTRY}`, { headers });
    const res = await getRegulation(req, { params: Promise.resolve({ country: TEST_COUNTRY }) });
    expect(res.status).toBe(200);
  });

  it('a TOURIST cannot read at all (403, no country_regulation.read)', async () => {
    const headers = await loginAs(touristId);
    const req = new NextRequest(`http://localhost/api/v1/country-regulations/${TEST_COUNTRY}`, { headers });
    const res = await getRegulation(req, { params: Promise.resolve({ country: TEST_COUNTRY }) });
    expect(res.status).toBe(403);

    const listReq = new NextRequest('http://localhost/api/v1/country-regulations', { headers: await loginAs(touristId) });
    const listRes = await listRegulations(listReq, { params: Promise.resolve({}) });
    expect(listRes.status).toBe(403);
  });
});
