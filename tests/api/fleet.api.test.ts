import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as listVehicles, POST as createVehicle } from '../../src/app/api/v1/fleet/vehicles/route';
import { GET as getVehicle, PATCH as patchVehicle } from '../../src/app/api/v1/fleet/vehicles/[vehicleId]/route';
import { GET as listDrivers, POST as createDriver } from '../../src/app/api/v1/fleet/drivers/route';
import { GET as getDriver, PATCH as patchDriver } from '../../src/app/api/v1/fleet/drivers/[driverProfileId]/route';

/**
 * First API-level test of the DR-017 fleet module: drives the real route
 * handlers (session resolution, RBAC, service, RLS), same pattern as
 * tests/api/bookings.api.test.ts.
 */
const admin = new PrismaClient();

let orgId: string;
let operatorId: string;
let touristId: string;
let driverUserId: string;
let vehicleId: string;
let driverProfileId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `FLEET-API-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, tourist, driverUser] = await Promise.all([
    admin.user.create({ data: { email: `op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `t-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `drv-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  touristId = tourist.id;
  driverUserId = driverUser.id;
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgId was assigned, Prisma silently
  // drops the undefined where-clause value, turning these into unscoped
  // deleteMany calls that wipe the whole table -- this has hit real
  // production data twice. Skip cleanup entirely rather than risk it.
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.vehicle.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('POST /api/v1/fleet/vehicles', () => {
  it('an operator registers a vehicle (201)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest('http://localhost/api/v1/fleet/vehicles', headers, 'POST', {
      plateNumber: 'N123-ABC',
      make: 'Toyota',
      model: 'Land Cruiser',
      vehicleType: '4x4',
      seatCapacity: 7,
    });
    const res = await createVehicle(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.vehicle.status).toBe('ACTIVE');
    vehicleId = body.vehicle.id;
  });

  it('a TOURIST cannot register a vehicle (403)', async () => {
    const headers = await loginAs(touristId);
    const req = jsonRequest('http://localhost/api/v1/fleet/vehicles', headers, 'POST', {
      plateNumber: 'N999',
      make: 'Toyota',
      model: 'Hilux',
      vehicleType: 'sedan',
      seatCapacity: 4,
    });
    const res = await createVehicle(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid seat capacity (422)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest('http://localhost/api/v1/fleet/vehicles', headers, 'POST', {
      plateNumber: 'N000',
      make: 'Toyota',
      model: 'Hilux',
      vehicleType: 'sedan',
      seatCapacity: 0,
    });
    const res = await createVehicle(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/fleet/vehicles', () => {
  it('an operator lists the org fleet', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest('http://localhost/api/v1/fleet/vehicles', { headers });
    const res = await listVehicles(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vehicles.some((v: { id: string }) => v.id === vehicleId)).toBe(true);
  });
});

describe('GET/PATCH /api/v1/fleet/vehicles/:vehicleId', () => {
  it('an operator gets the vehicle (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/fleet/vehicles/${vehicleId}`, { headers });
    const res = await getVehicle(req, { params: Promise.resolve({ vehicleId }) });
    expect(res.status).toBe(200);
  });

  it('an operator updates the vehicle status (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/fleet/vehicles/${vehicleId}`, headers, 'PATCH', {
      status: 'MAINTENANCE',
    });
    const res = await patchVehicle(req, { params: Promise.resolve({ vehicleId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vehicle.status).toBe('MAINTENANCE');
  });

  it('404s for a non-existent vehicle', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest('http://localhost/api/v1/fleet/vehicles/00000000-0000-0000-0000-000000000000', {
      headers,
    });
    const res = await getVehicle(req, { params: Promise.resolve({ vehicleId: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/fleet/drivers', () => {
  it('an operator creates a driver profile (201)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest('http://localhost/api/v1/fleet/drivers', headers, 'POST', {
      userId: driverUserId,
      licenseNumber: 'DL-001',
    });
    const res = await createDriver(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.driver.userId).toBe(driverUserId);
    driverProfileId = body.driver.id;
  });
});

describe('GET /api/v1/fleet/drivers', () => {
  it('an operator lists all driver profiles', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest('http://localhost/api/v1/fleet/drivers', { headers });
    const res = await listDrivers(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.drivers.some((d: { id: string }) => d.id === driverProfileId)).toBe(true);
  });

  it('the DRIVER themselves cannot list all driver profiles (403, managers only)', async () => {
    const headers = await loginAs(driverUserId);
    const req = new NextRequest('http://localhost/api/v1/fleet/drivers', { headers });
    const res = await listDrivers(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});

describe('GET/PATCH /api/v1/fleet/drivers/:driverProfileId', () => {
  it('an operator gets the driver profile (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/fleet/drivers/${driverProfileId}`, { headers });
    const res = await getDriver(req, { params: Promise.resolve({ driverProfileId }) });
    expect(res.status).toBe(200);
  });

  it('the driver can fetch their own profile (200)', async () => {
    const headers = await loginAs(driverUserId);
    const req = new NextRequest(`http://localhost/api/v1/fleet/drivers/${driverProfileId}`, { headers });
    const res = await getDriver(req, { params: Promise.resolve({ driverProfileId }) });
    expect(res.status).toBe(200);
  });

  it('an operator updates the license number (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/fleet/drivers/${driverProfileId}`, headers, 'PATCH', {
      licenseNumber: 'DL-002',
    });
    const res = await patchDriver(req, { params: Promise.resolve({ driverProfileId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.driver.licenseNumber).toBe('DL-002');
  });
});
