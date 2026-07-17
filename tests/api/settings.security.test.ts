import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { POST as createTaxRate } from '../../src/app/api/v1/settings/tax-rates/route';

/**
 * Settings Module (DR-042) role-gate coverage. `platform_settings.write` is
 * never seeded to PLATFORM_ADMIN by default -- so it 403s at the route
 * itself in the common case. This also proves the service-layer
 * requireSettingsWriter backstop independently: even if a SUPERADMIN later
 * edits the live permission matrix (/staff/admin/permissions) to grant
 * PLATFORM_ADMIN platform_settings.write, settingsService's own
 * SUPERADMIN-only role check (mirroring isFinanceConfigWriter/
 * isCountryRegulationWriter) still rejects it -- simulated here by
 * inserting that RolePermission row directly, bypassing the normal seed
 * defaults.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;
const TEST_COUNTRY = 'ZX';

let orgId: string;
let guideId: string;
let platformAdminWithGrantId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `SETTINGS-SEC-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [guide, platformAdmin] = await Promise.all([
    admin.user.create({ data: { email: `guide-settings-sec-${suffix}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
    admin.user.create({ data: { email: `pa-settings-sec-${suffix}@example.test`, role: 'PLATFORM_ADMIN', organizationId: orgId } }),
  ]);
  guideId = guide.id;
  platformAdminWithGrantId = platformAdmin.id;

  // Simulates a SUPERADMIN having manually granted this via the live
  // permission-matrix editor -- upsert so a pre-existing seeded row (there
  // shouldn't be one, but defensively) doesn't cause a unique-constraint error.
  await admin.rolePermission.upsert({
    where: { role_permission: { role: 'PLATFORM_ADMIN', permission: 'platform_settings.write' } },
    update: {},
    create: { role: 'PLATFORM_ADMIN', permission: 'platform_settings.write' },
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
  await admin.taxRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.rolePermission.deleteMany({ where: { role: 'PLATFORM_ADMIN', permission: 'platform_settings.write' } });
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('settings routes -- role gate', () => {
  it('TOUR_GUIDE (no platform_settings.write, no platform_settings.read) is forbidden at the route (403)', async () => {
    const headers = await loginAs(guideId);
    const req = jsonRequest('http://localhost/api/v1/settings/tax-rates', headers, 'POST', {
      country: TEST_COUNTRY,
      rateBp: 1000,
    });
    const res = await createTaxRate(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it('PLATFORM_ADMIN passes the route gate (has platform_settings.write granted) but is rejected by the service-layer SUPERADMIN-only check (403)', async () => {
    const headers = await loginAs(platformAdminWithGrantId);
    const req = jsonRequest('http://localhost/api/v1/settings/tax-rates', headers, 'POST', {
      country: TEST_COUNTRY,
      rateBp: 1000,
    });
    const res = await createTaxRate(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});
