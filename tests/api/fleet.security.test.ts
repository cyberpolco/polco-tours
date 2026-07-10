import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { GET as listVehicles, POST as createVehicle } from '../../src/app/api/v1/fleet/vehicles/route';
import { GET as getVehicle } from '../../src/app/api/v1/fleet/vehicles/[vehicleId]/route';
import { GET as getDriver } from '../../src/app/api/v1/fleet/drivers/[driverProfileId]/route';

/**
 * Anti-BOLA (Vol. 8, API1): RLS only isolates by organizationId -- it does
 * NOT stop one VEHICLE_OWNER/DRIVER from reading another's records in the
 * same org. That ownership check lives in fleet/service.ts; this is the test
 * CLAUDE.md's Definition of Done calls a "security test" beyond RLS.
 */
const admin = new PrismaClient();

let orgId: string;
let operatorId: string;
let ownerAId: string;
let ownerBId: string;
let driverAId: string;
let driverBId: string;
let vehicleAId: string;
let driverProfileAId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `FLEET-SEC-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, ownerA, ownerB, driverA, driverB] = await Promise.all([
    admin.user.create({ data: { email: `op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `owner-a-${Date.now()}@example.test`, role: 'VEHICLE_OWNER', organizationId: orgId } }),
    admin.user.create({ data: { email: `owner-b-${Date.now()}@example.test`, role: 'VEHICLE_OWNER', organizationId: orgId } }),
    admin.user.create({ data: { email: `driver-a-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId } }),
    admin.user.create({ data: { email: `driver-b-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  ownerAId = ownerA.id;
  ownerBId = ownerB.id;
  driverAId = driverA.id;
  driverBId = driverB.id;

  await withOrg(orgId, async (tx) => {
    const vehicle = await tx.vehicle.create({
      data: {
        organizationId: orgId,
        ownerId: ownerAId,
        plateNumber: 'OWNER-A-VEH',
        make: 'Toyota',
        model: 'Hilux',
        vehicleType: '4x4',
        seatCapacity: 5,
      },
    });
    vehicleAId = vehicle.id;

    const driverProfile = await tx.driverProfile.create({
      data: { organizationId: orgId, userId: driverAId, licenseNumber: 'DL-A' },
    });
    driverProfileAId = driverProfile.id;
  });
});

afterAll(async () => {
  await withOrg(orgId, (tx) => tx.vehicle.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('anti-BOLA: vehicle ownership', () => {
  it("VEHICLE_OWNER B cannot read VEHICLE_OWNER A's vehicle (404, not 403 -- don't leak existence)", async () => {
    const headers = await loginAs(ownerBId);
    const req = new NextRequest(`http://localhost/api/v1/fleet/vehicles/${vehicleAId}`, { headers });
    const res = await getVehicle(req, { params: Promise.resolve({ vehicleId: vehicleAId }) });
    expect(res.status).toBe(404);
  });

  it('VEHICLE_OWNER A can read their own vehicle (200)', async () => {
    const headers = await loginAs(ownerAId);
    const req = new NextRequest(`http://localhost/api/v1/fleet/vehicles/${vehicleAId}`, { headers });
    const res = await getVehicle(req, { params: Promise.resolve({ vehicleId: vehicleAId }) });
    expect(res.status).toBe(200);
  });

  it("VEHICLE_OWNER B's vehicle list never includes VEHICLE_OWNER A's vehicle", async () => {
    const headers = await loginAs(ownerBId);
    const req = new NextRequest('http://localhost/api/v1/fleet/vehicles', { headers });
    const res = await listVehicles(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vehicles.some((v: { id: string }) => v.id === vehicleAId)).toBe(false);
  });

  it('VEHICLE_OWNER cannot register a vehicle (403, read-only role)', async () => {
    const headers = await loginAs(ownerAId);
    const req = jsonRequest('http://localhost/api/v1/fleet/vehicles', headers, 'POST', {
      plateNumber: 'OWNER-TRY',
      make: 'Toyota',
      model: 'Hilux',
      vehicleType: '4x4',
      seatCapacity: 5,
    });
    const res = await createVehicle(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it('an operator can read any vehicle in the org (200)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/fleet/vehicles/${vehicleAId}`, { headers });
    const res = await getVehicle(req, { params: Promise.resolve({ vehicleId: vehicleAId }) });
    expect(res.status).toBe(200);
  });
});

describe('anti-BOLA: driver profile ownership', () => {
  it("DRIVER B cannot read DRIVER A's profile (404, not 403 -- don't leak existence)", async () => {
    const headers = await loginAs(driverBId);
    const req = new NextRequest(`http://localhost/api/v1/fleet/drivers/${driverProfileAId}`, { headers });
    const res = await getDriver(req, { params: Promise.resolve({ driverProfileId: driverProfileAId }) });
    expect(res.status).toBe(404);
  });

  it('DRIVER A can read their own profile (200)', async () => {
    const headers = await loginAs(driverAId);
    const req = new NextRequest(`http://localhost/api/v1/fleet/drivers/${driverProfileAId}`, { headers });
    const res = await getDriver(req, { params: Promise.resolve({ driverProfileId: driverProfileAId }) });
    expect(res.status).toBe(200);
  });
});
