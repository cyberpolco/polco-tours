import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { POST as createStaffRate } from '../../src/app/api/v1/finance/rates/staff/route';

/**
 * Finance Module (DR-039) role-gate coverage. `finance_config.write` is
 * never seeded to PLATFORM_ADMIN by default -- so it 403s at the route
 * itself in the common case. This also proves the service-layer
 * requireRateWriter backstop independently: even if a SUPERADMIN later
 * edits the live permission matrix (/staff/admin/permissions) to grant
 * PLATFORM_ADMIN finance_config.write, financeService's own SUPERADMIN-only
 * role check (mirroring isCountryRegulationWriter, DR-034) still rejects
 * it -- simulated here by inserting that RolePermission row directly,
 * bypassing the normal seed defaults.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;
const TEST_COUNTRY = 'ZZ';

let orgId: string;
let operatorId: string;
let platformAdminWithGrantId: string;

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
  platformAdminWithGrantId = platformAdmin.id;

  // Simulates a SUPERADMIN having manually granted this via the live
  // permission-matrix editor -- upsert so a pre-existing seeded row (there
  // shouldn't be one, but defensively) doesn't cause a unique-constraint error.
  await admin.rolePermission.upsert({
    where: { role_permission: { role: 'PLATFORM_ADMIN', permission: 'finance_config.write' } },
    update: {},
    create: { role: 'PLATFORM_ADMIN', permission: 'finance_config.write' },
  });
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
  await admin.rolePermission.deleteMany({ where: { role: 'PLATFORM_ADMIN', permission: 'finance_config.write' } });
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

  it('PLATFORM_ADMIN passes the route gate (has finance_config.write granted) but is rejected by the service-layer SUPERADMIN-only check (403)', async () => {
    const headers = await loginAs(platformAdminWithGrantId);
    const req = jsonRequest('http://localhost/api/v1/finance/rates/staff', headers, 'POST', {
      country: TEST_COUNTRY,
      role: 'DRIVER',
      dailyRateMinor: 10000,
      currency: 'USD',
    });
    const res = await createStaffRate(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});
