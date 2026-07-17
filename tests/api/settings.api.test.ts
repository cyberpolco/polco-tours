import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as listTaxRates, POST as createTaxRate } from '../../src/app/api/v1/settings/tax-rates/route';
import { DELETE as deleteTaxRate } from '../../src/app/api/v1/settings/tax-rates/[id]/route';
import { GET as listPlatformRates, POST as createPlatformRate } from '../../src/app/api/v1/settings/platform-rates/route';
import { DELETE as deletePlatformRate } from '../../src/app/api/v1/settings/platform-rates/[id]/route';

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
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('POST/GET/DELETE /api/v1/settings/tax-rates', () => {
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

  it('deletes the rate (204)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest(`http://localhost/api/v1/settings/tax-rates/${createdTaxRateId}`, headers, 'DELETE');
    const res = await deleteTaxRate(req, { params: Promise.resolve({ id: createdTaxRateId }) });
    expect(res.status).toBe(204);
  });
});

describe('POST/GET/DELETE /api/v1/settings/platform-rates', () => {
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

  it('deletes the rate (204)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest(`http://localhost/api/v1/settings/platform-rates/${createdPlatformRateId}`, headers, 'DELETE');
    const res = await deletePlatformRate(req, { params: Promise.resolve({ id: createdPlatformRateId }) });
    expect(res.status).toBe(204);
    createdPlatformRateId = ''; // already deleted -- afterAll shouldn't try again
  });
});
