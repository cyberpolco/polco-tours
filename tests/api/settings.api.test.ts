import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as listTaxRates, POST as createTaxRate } from '../../src/app/api/v1/settings/tax-rates/route';
import { PATCH as updateTaxRate, DELETE as deleteTaxRate } from '../../src/app/api/v1/settings/tax-rates/[id]/route';
import { GET as listPlatformRates, POST as createPlatformRate } from '../../src/app/api/v1/settings/platform-rates/route';
import { PATCH as updatePlatformRate, DELETE as deletePlatformRate } from '../../src/app/api/v1/settings/platform-rates/[id]/route';
import { GET as listCoupons, POST as createCoupon } from '../../src/app/api/v1/settings/coupons/route';
import { PATCH as updateCoupon, DELETE as deleteCoupon } from '../../src/app/api/v1/settings/coupons/[id]/route';

/**
 * Settings Module (DR-042) -- TaxRate + PlatformRate CRUD. Both tables are
 * platform-wide (no organizationId, no RLS, same precedent as the finance
 * module's rate tables), so fixtures only need a SUPERADMIN user, not an
 * org -- but one is still created for realism/consistency with the rest of
 * this test suite.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;
const TEST_COUNTRY = 'ZY'; // fictitious, avoids colliding with real seeded rows

let orgId: string;
let superadminId: string;
let createdTaxRateId: string;
let createdPlatformRateId: string;
let createdCouponId: string;
let createdCouponCode: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `SETTINGS-API-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const superadmin = await admin.user.create({
    data: { email: `superadmin-settings-${suffix}@example.test`, role: 'SUPERADMIN', organizationId: orgId },
  });
  superadminId = superadmin.id;
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
  if (createdPlatformRateId) {
    await admin.platformRate.deleteMany({ where: { id: createdPlatformRateId } });
  }
  if (createdCouponId) {
    await admin.couponRedemption.deleteMany({ where: { couponId: createdCouponId } });
    await admin.coupon.deleteMany({ where: { id: createdCouponId } });
  }
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('POST/GET/PATCH/DELETE /api/v1/settings/tax-rates', () => {
  it('a SUPERADMIN creates a tax rate (201)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest('http://localhost/api/v1/settings/tax-rates', headers, 'POST', {
      country: TEST_COUNTRY,
      rateBp: 1234,
    });
    const res = await createTaxRate(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.rate.country).toBe(TEST_COUNTRY);
    expect(body.rate.taxType).toBe('VAT'); // schema default
    createdTaxRateId = body.rate.id;
  });

  it('lists rates including the fixture (200)', async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest('http://localhost/api/v1/settings/tax-rates', { headers });
    const res = await listTaxRates(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rates.some((r: { id: string }) => r.id === createdTaxRateId)).toBe(true);
  });

  // Explicit user request: an in-place update, not just delete-and-recreate.
  it('a SUPERADMIN updates the tax rate in place (200)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest(`http://localhost/api/v1/settings/tax-rates/${createdTaxRateId}`, headers, 'PATCH', {
      country: TEST_COUNTRY,
      taxType: 'GST',
      rateBp: 1500,
    });
    const res = await updateTaxRate(req, { params: Promise.resolve({ id: createdTaxRateId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rate.rateBp).toBe(1500);
    expect(body.rate.taxType).toBe('GST');
  });

  it('updating an unknown tax rate 404s', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest('http://localhost/api/v1/settings/tax-rates/00000000-0000-0000-0000-000000000000', headers, 'PATCH', {
      country: TEST_COUNTRY,
      rateBp: 1000,
    });
    const res = await updateTaxRate(req, { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(404);
  });

  it('deletes the rate (204)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest(`http://localhost/api/v1/settings/tax-rates/${createdTaxRateId}`, headers, 'DELETE');
    const res = await deleteTaxRate(req, { params: Promise.resolve({ id: createdTaxRateId }) });
    expect(res.status).toBe(204);
  });
});

describe('POST/GET/PATCH/DELETE /api/v1/settings/platform-rates', () => {
  it('a SUPERADMIN creates a platform rate (201)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest('http://localhost/api/v1/settings/platform-rates', headers, 'POST', { rateBp: 600 });
    const res = await createPlatformRate(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.rate.rateBp).toBe(600);
    createdPlatformRateId = body.rate.id;
  });

  it('lists rates including the fixture (200)', async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest('http://localhost/api/v1/settings/platform-rates', { headers });
    const res = await listPlatformRates(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rates.some((r: { id: string }) => r.id === createdPlatformRateId)).toBe(true);
  });

  // Explicit user request: an in-place update, not just delete-and-recreate.
  it('a SUPERADMIN updates the platform rate in place (200)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest(`http://localhost/api/v1/settings/platform-rates/${createdPlatformRateId}`, headers, 'PATCH', {
      rateBp: 750,
    });
    const res = await updatePlatformRate(req, { params: Promise.resolve({ id: createdPlatformRateId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rate.rateBp).toBe(750);
  });

  it('updating an unknown platform rate 404s', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest('http://localhost/api/v1/settings/platform-rates/00000000-0000-0000-0000-000000000000', headers, 'PATCH', {
      rateBp: 500,
    });
    const res = await updatePlatformRate(req, { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(404);
  });

  it('deletes the rate (204)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest(`http://localhost/api/v1/settings/platform-rates/${createdPlatformRateId}`, headers, 'DELETE');
    const res = await deletePlatformRate(req, { params: Promise.resolve({ id: createdPlatformRateId }) });
    expect(res.status).toBe(204);
    createdPlatformRateId = ''; // already deleted -- afterAll shouldn't try again
  });
});

// DR-104: code is system-generated -- these tests confirm the request body
// never influences it, even if a caller tries to smuggle one in.
describe('POST/GET/PATCH/DELETE /api/v1/settings/coupons', () => {
  it('a SUPERADMIN creates a coupon (201) -- code is generated, never client-supplied', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest('http://localhost/api/v1/settings/coupons', headers, 'POST', {
      discountBp: 1500,
      code: 'I-SHOULD-BE-IGNORED', // not part of CreateCouponInput -- zod strips unknown keys
    });
    const res = await createCoupon(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.coupon.discountBp).toBe(1500);
    expect(body.coupon.code).not.toBe('I-SHOULD-BE-IGNORED');
    expect(body.coupon.code).toMatch(/^CPC-\d{2}-\d{6}-[A-Z]{2}$/);
    expect(body.coupon.redemptionCount).toBe(0);
    createdCouponId = body.coupon.id;
    createdCouponCode = body.coupon.code;
  });

  it('rejects a discountBp above the 50% cap (422)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest('http://localhost/api/v1/settings/coupons', headers, 'POST', { discountBp: 5001 });
    const res = await createCoupon(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(422);
  });

  it('lists coupons including the fixture, with its redemptionCount (200)', async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest('http://localhost/api/v1/settings/coupons', { headers });
    const res = await listCoupons(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    const fixture = body.coupons.find((c: { id: string }) => c.id === createdCouponId);
    expect(fixture).toBeDefined();
    expect(fixture.redemptionCount).toBe(0);
  });

  // DR-144 (explicit user request): update replaces the old deactivate --
  // full replace of discountBp/maxRedemptions/expiresAt (code is immutable).
  it('a SUPERADMIN updates the coupon in place (200)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest(`http://localhost/api/v1/settings/coupons/${createdCouponId}`, headers, 'PATCH', {
      discountBp: 2000,
      maxRedemptions: 5,
    });
    const res = await updateCoupon(req, { params: Promise.resolve({ id: createdCouponId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coupon.discountBp).toBe(2000);
    expect(body.coupon.maxRedemptions).toBe(5);
    expect(body.coupon.code).toBe(createdCouponCode); // code is immutable
    expect(body.coupon.expiresAt).toBeNull(); // omitted on this update -- cleared, not left untouched
  });

  it('updating an unknown coupon 404s', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest('http://localhost/api/v1/settings/coupons/00000000-0000-0000-0000-000000000000', headers, 'PATCH', {
      discountBp: 1000,
    });
    const res = await updateCoupon(req, { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(404);
  });

  it('a SUPERADMIN deletes the coupon (204)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest(`http://localhost/api/v1/settings/coupons/${createdCouponId}`, headers, 'DELETE');
    const res = await deleteCoupon(req, { params: Promise.resolve({ id: createdCouponId }) });
    expect(res.status).toBe(204);
  });

  // Cross-checks against @lib/coupons directly (the exact read path
  // invoicingService.applyCoupon uses) rather than spinning up a whole
  // booking/invoice just to prove this -- validateCoupon rejects before
  // ever touching an invoice. DR-144: a deleted coupon is NOT_FOUND, not a
  // separate INACTIVE reason (that reason no longer exists at all).
  it('the deleted coupon is immediately unusable via validateCoupon (NOT_FOUND, not a soft-off state)', async () => {
    const { validateCoupon } = await import('../../src/lib/coupons');
    expect(await validateCoupon(createdCouponCode)).toEqual({ error: 'NOT_FOUND' });
    createdCouponId = ''; // already deleted -- afterAll shouldn't try again
  });

  it('deleting an unknown coupon 404s', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest('http://localhost/api/v1/settings/coupons/00000000-0000-0000-0000-000000000000', headers, 'DELETE');
    const res = await deleteCoupon(req, { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(404);
  });
});
