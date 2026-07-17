import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as listStaffRates, POST as createStaffRate } from '../../src/app/api/v1/finance/rates/staff/route';
import { DELETE as deleteStaffRate } from '../../src/app/api/v1/finance/rates/staff/[id]/route';
import { GET as listHotelRates, POST as createHotelRate } from '../../src/app/api/v1/finance/rates/hotel/route';
import { GET as listTransportRates, POST as createTransportRate } from '../../src/app/api/v1/finance/rates/transport/route';
import { GET as listFoodBeverageRates, POST as createFoodBeverageRate } from '../../src/app/api/v1/finance/rates/food-beverage/route';
import { GET as listActivityFees, POST as createActivityFee } from '../../src/app/api/v1/finance/rates/activity/route';
import { GET as listImmigrationCostRates, POST as createImmigrationCostRate } from '../../src/app/api/v1/finance/rates/immigration-cost/route';

/**
 * Finance Module (DR-039) -- Operational Rates CRUD. These six tables are
 * platform-wide (no organizationId, no RLS, same precedent as TaxRate), so
 * fixtures only need a SUPERADMIN user, not an org -- but one is still
 * created for realism/consistency with the rest of this test suite.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;
const TEST_COUNTRY = 'ZZ'; // fictitious, avoids colliding with real seeded rows

let orgId: string;
let superadminId: string;
let createdStaffRateId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `FINANCE-RATES-API-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const superadmin = await admin.user.create({
    data: { email: `superadmin-finance-${suffix}@example.test`, role: 'SUPERADMIN', organizationId: orgId },
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
  await admin.staffRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.hotelRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.transportRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.foodBeverageRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.activityFee.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.immigrationCostRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('POST/GET/DELETE /api/v1/finance/rates/staff', () => {
  it('a SUPERADMIN creates a staff rate (201)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest('http://localhost/api/v1/finance/rates/staff', headers, 'POST', {
      country: TEST_COUNTRY,
      role: 'DRIVER',
      dailyRateMinor: 10000,
      currency: 'USD',
    });
    const res = await createStaffRate(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.rate.country).toBe(TEST_COUNTRY);
    createdStaffRateId = body.rate.id;
  });

  it('lists rates including the fixture (200)', async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest('http://localhost/api/v1/finance/rates/staff', { headers });
    const res = await listStaffRates(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rates.some((r: { id: string }) => r.id === createdStaffRateId)).toBe(true);
  });

  it('deletes the rate (204)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest(`http://localhost/api/v1/finance/rates/staff/${createdStaffRateId}`, headers, 'DELETE');
    const res = await deleteStaffRate(req, { params: Promise.resolve({ id: createdStaffRateId }) });
    expect(res.status).toBe(204);
  });
});

describe('the other five rate categories (smoke test)', () => {
  it('creates and lists a hotel rate', async () => {
    const headers = await loginAs(superadminId);
    const createReq = jsonRequest('http://localhost/api/v1/finance/rates/hotel', headers, 'POST', {
      country: TEST_COUNTRY,
      roomCategory: 'Standard',
      nightlyRateMinor: 5000,
      currency: 'USD',
    });
    expect((await createHotelRate(createReq, { params: Promise.resolve({}) })).status).toBe(201);
    const listReq = new NextRequest('http://localhost/api/v1/finance/rates/hotel', { headers });
    const listRes = await listHotelRates(listReq, { params: Promise.resolve({}) });
    expect((await listRes.json()).rates.some((r: { country: string }) => r.country === TEST_COUNTRY)).toBe(true);
  });

  it('creates and lists a transport rate', async () => {
    const headers = await loginAs(superadminId);
    const createReq = jsonRequest('http://localhost/api/v1/finance/rates/transport', headers, 'POST', {
      country: TEST_COUNTRY,
      fuelEstimateMinor: 3000,
      tollFeesMinor: 500,
      parkingFeesMinor: 200,
      vehicleOperatingCostMinor: 1000,
      currency: 'USD',
    });
    expect((await createTransportRate(createReq, { params: Promise.resolve({}) })).status).toBe(201);
    const listReq = new NextRequest('http://localhost/api/v1/finance/rates/transport', { headers });
    const listRes = await listTransportRates(listReq, { params: Promise.resolve({}) });
    expect((await listRes.json()).rates.some((r: { country: string }) => r.country === TEST_COUNTRY)).toBe(true);
  });

  it('creates and lists a food/beverage rate', async () => {
    const headers = await loginAs(superadminId);
    const createReq = jsonRequest('http://localhost/api/v1/finance/rates/food-beverage', headers, 'POST', {
      country: TEST_COUNTRY,
      category: 'BREAKFAST',
      perUnitMinor: 1000,
      currency: 'USD',
    });
    expect((await createFoodBeverageRate(createReq, { params: Promise.resolve({}) })).status).toBe(201);
    const listReq = new NextRequest('http://localhost/api/v1/finance/rates/food-beverage', { headers });
    const listRes = await listFoodBeverageRates(listReq, { params: Promise.resolve({}) });
    expect((await listRes.json()).rates.some((r: { country: string }) => r.country === TEST_COUNTRY)).toBe(true);
  });

  it('creates and lists an activity fee', async () => {
    const headers = await loginAs(superadminId);
    const createReq = jsonRequest('http://localhost/api/v1/finance/rates/activity', headers, 'POST', {
      country: TEST_COUNTRY,
      name: 'Fixture park entrance',
      feeMinor: 2000,
      currency: 'USD',
    });
    expect((await createActivityFee(createReq, { params: Promise.resolve({}) })).status).toBe(201);
    const listReq = new NextRequest('http://localhost/api/v1/finance/rates/activity', { headers });
    const listRes = await listActivityFees(listReq, { params: Promise.resolve({}) });
    expect((await listRes.json()).fees.some((r: { country: string }) => r.country === TEST_COUNTRY)).toBe(true);
  });

  it('creates and lists an immigration cost rate', async () => {
    const headers = await loginAs(superadminId);
    const createReq = jsonRequest('http://localhost/api/v1/finance/rates/immigration-cost', headers, 'POST', {
      country: TEST_COUNTRY,
      visaFeeMinor: 5000,
      processingFeeMinor: 1000,
      invitationLetterFeeMinor: 500,
      borderPermitFeeMinor: 200,
      currency: 'USD',
    });
    expect((await createImmigrationCostRate(createReq, { params: Promise.resolve({}) })).status).toBe(201);
    const listReq = new NextRequest('http://localhost/api/v1/finance/rates/immigration-cost', { headers });
    const listRes = await listImmigrationCostRates(listReq, { params: Promise.resolve({}) });
    expect((await listRes.json()).rates.some((r: { country: string }) => r.country === TEST_COUNTRY)).toBe(true);
  });
});
