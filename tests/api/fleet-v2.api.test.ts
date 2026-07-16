import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatPackageReference } from '@modules/catalog';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';

const { POST: addMaintenanceRecord, GET: listMaintenanceRecords } = await import(
  '../../src/app/api/v1/fleet/vehicles/[vehicleId]/maintenance/route'
);
const { POST: createStarlinkKit } = await import('../../src/app/api/v1/fleet/starlink-kits/route');
const { PATCH: updateStarlinkKit } = await import('../../src/app/api/v1/fleet/starlink-kits/[kitId]/route');
const { POST: setStarlinkLocation } = await import('../../src/app/api/v1/fleet/starlink-kits/[kitId]/location/route');
const { PATCH: setPickupLocation } = await import('../../src/app/api/v1/departures/[departureId]/route');
const { GET: recommendAssignment } = await import(
  '../../src/app/api/v1/departures/[departureId]/recommend-assignment/route'
);

const admin = new PrismaClient();

let orgId: string;
let operatorId: string;
let departureId: string;
let bigVehicleId: string;
let smallVehicleId: string;
let driverProfileId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `FLEET-V2-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const operator = await admin.user.create({
    data: { email: `fleetv2-op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId },
  });
  operatorId = operator.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: 'Fleet V2 Fixture Safari',
        description: 'Fixture for fleet v2 API tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: {
        organizationId: orgId,
        tourPackageId: pkg.id,
        startDate: new Date('2027-05-01'),
        endDate: new Date('2027-05-05'),
        capacity: 4,
        status: 'SCHEDULED',
        pickupLatitude: -22.5609,
        pickupLongitude: 17.0658,
      },
    });
    departureId = departure.id;

    const [bigVehicle, smallVehicle] = await Promise.all([
      tx.vehicle.create({
        data: { organizationId: orgId, plateNumber: 'FLEETV2-BIG', make: 'Toyota', model: 'Coaster', vehicleType: 'minibus', seatCapacity: 12, status: 'ACTIVE' },
      }),
      tx.vehicle.create({
        data: { organizationId: orgId, plateNumber: 'FLEETV2-SMALL', make: 'Toyota', model: 'Corolla', vehicleType: 'sedan', seatCapacity: 3, status: 'ACTIVE' },
      }),
    ]);
    bigVehicleId = bigVehicle.id;
    smallVehicleId = smallVehicle.id;

    const driverUser = await tx.user.create({
      data: { email: `fleetv2-driver-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId },
    });
    const driverProfile = await tx.driverProfile.create({
      data: { organizationId: orgId, userId: driverUser.id, licenseNumber: 'FLEETV2-DL', status: 'ACTIVE' },
    });
    driverProfileId = driverProfile.id;
  });
}, 30_000);

afterAll(async () => {
  if (orgId) {
    await withOrg(orgId, (tx) => tx.starlinkKit.deleteMany({ where: { organizationId: orgId } }));
    await withOrg(orgId, (tx) => tx.maintenanceRecord.deleteMany({ where: { organizationId: orgId } }));
    await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
    await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
    await withOrg(orgId, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: orgId } }));
    await withOrg(orgId, (tx) => tx.vehicle.deleteMany({ where: { organizationId: orgId } }));
    await admin.user.deleteMany({ where: { organizationId: orgId } });
    await admin.organization.delete({ where: { id: orgId } });
  }
  await admin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

describe('fleet v2: maintenance records + Starlink kits (DR-029)', () => {
  it('logs a maintenance record and lists it back', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/fleet/vehicles/${bigVehicleId}/maintenance`, headers, 'POST', {
      performedAt: '2027-01-01',
      description: 'Oil change',
      costMinor: 5000,
      currency: 'USD',
    });
    const res = await addMaintenanceRecord(req, { params: Promise.resolve({ vehicleId: bigVehicleId }) });
    expect(res.status).toBe(201);

    const listReq = new NextRequest(`http://localhost/api/v1/fleet/vehicles/${bigVehicleId}/maintenance`, { headers });
    const listRes = await listMaintenanceRecords(listReq, { params: Promise.resolve({ vehicleId: bigVehicleId }) });
    const body = await listRes.json();
    expect(body.records).toHaveLength(1);
    expect(body.records[0].description).toBe('Oil change');
  }, 30_000);

  it('creates a Starlink kit assigned to a vehicle, then sets its location', async () => {
    const headers = await loginAs(operatorId);
    const createReq = jsonRequest('http://localhost/api/v1/fleet/starlink-kits', headers, 'POST', {
      kitId: `KIT-${Date.now()}`,
      vehicleId: bigVehicleId,
    });
    const createRes = await createStarlinkKit(createReq, { params: Promise.resolve({}) });
    expect(createRes.status).toBe(201);
    const kitId = (await createRes.json()).kit.id;

    const locReq = jsonRequest(`http://localhost/api/v1/fleet/starlink-kits/${kitId}/location`, headers, 'POST', {
      latitude: -22.55,
      longitude: 17.05,
    });
    const locRes = await setStarlinkLocation(locReq, { params: Promise.resolve({ kitId }) });
    expect(locRes.status).toBe(200);
    const kit = (await locRes.json()).kit;
    expect(kit.lastLatitude).toBeCloseTo(-22.55, 5);

    const patchReq = jsonRequest(`http://localhost/api/v1/fleet/starlink-kits/${kitId}`, headers, 'PATCH', {
      status: 'MAINTENANCE',
    });
    const patchRes = await updateStarlinkKit(patchReq, { params: Promise.resolve({ kitId }) });
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json()).kit.status).toBe('MAINTENANCE');
  }, 30_000);

  it('sets a departure pickup location', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(`http://localhost/api/v1/departures/${departureId}`, headers, 'PATCH', {
      latitude: -22.6,
      longitude: 17.1,
    });
    const res = await setPickupLocation(req, { params: Promise.resolve({ departureId }) });
    expect(res.status).toBe(200);
    expect((await res.json()).departure.pickupLatitude).toBeCloseTo(-22.6, 5);
  }, 30_000);

  it('recommends the capacity-fitting vehicle over the too-small one, and excludes the too-small vehicle entirely', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/departures/${departureId}/recommend-assignment`, { headers });
    const res = await recommendAssignment(req, { params: Promise.resolve({ departureId }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    const vehicleIds = body.vehicles.map((v: { vehicle: { id: string } }) => v.vehicle.id);
    expect(vehicleIds).toContain(bigVehicleId); // seatCapacity 12 >= departure.capacity 4
    expect(vehicleIds).not.toContain(smallVehicleId); // seatCapacity 3 < departure.capacity 4, hard-excluded
    expect(body.recommendedVehicleId).toBe(bigVehicleId);
    expect(body.recommendedDriverId).toBe(driverProfileId);
    expect(body.drivers.map((d: { id: string }) => d.id)).toContain(driverProfileId);
  }, 30_000);
});
