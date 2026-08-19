import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { POST as createStaffRate } from '../../src/app/api/v1/finance/rates/staff/route';
import { PATCH as patchStaffRate } from '../../src/app/api/v1/finance/rates/staff/[id]/route';

/**
 * Finance Module (DR-039) role-gate coverage. DR-159 (reverses DR-035):
 * `finance_config.write`/`.read` are hardcoded and granted to nobody but
 * SUPERADMIN's wildcard -- there is no runtime permission-matrix editor left
 * that could grant PLATFORM_ADMIN either one, so it 403s at the route gate
 * itself now, not just financeService's own SUPERADMIN-only
 * requireRateWriter backstop (which still exists as defense-in-depth,
 * mirroring isCountryRegulationWriter, DR-034).
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;
const TEST_COUNTRY = 'ZZ';

let orgId: string;
let operatorId: string;
let platformAdminId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `FINANCE-RATES-SEC-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, platformAdmin] = await Promise.all([
    admin.user.create({ data: { email: `op-finance-sec-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `pa-finance-sec-${suffix}@example.test`, role: 'PLATFORM_ADMIN', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  platformAdminId = platformAdmin.id;
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgId was assigned, Prisma silently
  // drops the undefined where-clause value, turning cleanup into an
  // unscoped deleteMany that wipes the whole table -- this has hit real
  // production data twice. Skip cleanup entirely rather than risk it.
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await admin.staffRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('finance rates -- role gate', () => {
  it('TOUR_OPERATOR (no finance_config.write) is forbidden at the route (403)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest('http://localhost/api/v1/finance/rates/staff', headers, 'POST', {
      country: TEST_COUNTRY,
      role: 'DRIVER',
      dailyRateMinor: 10000,
      currency: 'USD',
    });
    const res = await createStaffRate(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it('PLATFORM_ADMIN cannot create a rate (403) -- finance_config.write is SUPERADMIN-only under DR-159', async () => {
    const headers = await loginAs(platformAdminId);
    const req = jsonRequest('http://localhost/api/v1/finance/rates/staff', headers, 'POST', {
      country: TEST_COUNTRY,
      role: 'DRIVER',
      dailyRateMinor: 10000,
      currency: 'USD',
    });
    const res = await createStaffRate(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it('TOUR_OPERATOR (no finance_config.write) is forbidden updating a rate (403)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest('http://localhost/api/v1/finance/rates/staff/00000000-0000-0000-0000-000000000000', headers, 'PATCH', {
      country: TEST_COUNTRY,
      role: 'DRIVER',
      dailyRateMinor: 10000,
      currency: 'USD',
    });
    const res = await patchStaffRate(req, { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(403);
  });

  it('PLATFORM_ADMIN cannot update a rate either (403)', async () => {
    const headers = await loginAs(platformAdminId);
    const req = jsonRequest('http://localhost/api/v1/finance/rates/staff/00000000-0000-0000-0000-000000000000', headers, 'PATCH', {
      country: TEST_COUNTRY,
      role: 'DRIVER',
      dailyRateMinor: 10000,
      currency: 'USD',
    });
    const res = await patchStaffRate(req, { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(403);
  });
});
