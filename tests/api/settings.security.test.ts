import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { POST as createTaxRate } from '../../src/app/api/v1/settings/tax-rates/route';
import { POST as createCoupon } from '../../src/app/api/v1/settings/coupons/route';

/**
 * Settings Module (DR-042) role-gate coverage. DR-159 (reverses DR-035):
 * `platform_settings.write`/`.read` are hardcoded and granted to nobody but
 * SUPERADMIN's wildcard -- there is no runtime permission-matrix editor left
 * that could grant PLATFORM_ADMIN either one, so it 403s at the route gate
 * itself now, not just settingsService's own SUPERADMIN-only
 * requireSettingsWriter backstop (which still exists as defense-in-depth,
 * mirroring isFinanceConfigWriter/isCountryRegulationWriter).
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;
const TEST_COUNTRY = 'ZX';

let orgId: string;
let guideId: string;
let platformAdminId: string;

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
  await admin.taxRate.deleteMany({ where: { country: TEST_COUNTRY } });
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

  it('PLATFORM_ADMIN cannot create a tax rate (403) -- platform_settings.write is SUPERADMIN-only under DR-159', async () => {
    const headers = await loginAs(platformAdminId);
    const req = jsonRequest('http://localhost/api/v1/settings/tax-rates', headers, 'POST', {
      country: TEST_COUNTRY,
      rateBp: 1000,
    });
    const res = await createTaxRate(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  // DR-104: requireSettingsWriter is one shared function -- this proves the
  // same SUPERADMIN-only backstop applies to the newer Coupon entity too,
  // not just the two rate tables it originally guarded.
  it('TOUR_GUIDE cannot create a coupon (403)', async () => {
    const headers = await loginAs(guideId);
    const req = jsonRequest('http://localhost/api/v1/settings/coupons', headers, 'POST', { discountBp: 1000 });
    const res = await createCoupon(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it('PLATFORM_ADMIN cannot create a coupon (403)', async () => {
    const headers = await loginAs(platformAdminId);
    const req = jsonRequest('http://localhost/api/v1/settings/coupons', headers, 'POST', { discountBp: 1000 });
    const res = await createCoupon(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});
