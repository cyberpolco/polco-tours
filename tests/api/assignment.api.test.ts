import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatPackageReference } from '@modules/catalog';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import {
  GET as listAssignments,
  POST as createAssignment,
} from '../../src/app/api/v1/departures/[departureId]/assignments/route';
import { DELETE as deleteAssignment } from '../../src/app/api/v1/assignments/[assignmentId]/route';

/**
 * First API-level test of the DR-018 assignment module: drives the real
 * route handlers (session resolution, RBAC, service, RLS), same pattern as
 * tests/api/fleet.api.test.ts.
 */
const admin = new PrismaClient();

let orgId: string;
let operatorId: string;
let touristId: string;
let guideId: string;
let otherRoleGuideId: string; // a second user, NOT TOUR_GUIDE, for the invalid-guide test
let departureAId: string;
let departureBId: string; // overlaps departureA's dates
let departureCId: string; // does not overlap departureA's dates
let activeVehicleId: string;
let maintenanceVehicleId: string;
let activeDriverProfileId: string;
let suspendedDriverProfileId: string;
let activeGuideId: string; // has an ACTIVE GuideProfile (DR-030)
let suspendedGuideId: string; // has a SUSPENDED GuideProfile (DR-030)
let profilelessGuideId: string; // TOUR_GUIDE with no GuideProfile at all (DR-030)
let departureDId: string;
let departureEId: string; // overlaps departureD's dates

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `ASSIGN-API-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [operator, tourist, guide, otherGuide] = await Promise.all([
    admin.user.create({ data: { email: `op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `t-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `guide-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
    admin.user.create({ data: { email: `notguide-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId } }),
  ]);
  operatorId = operator.id;
  touristId = tourist.id;
  guideId = guide.id;
  otherRoleGuideId = otherGuide.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: 'Assignment Fixture Safari',
        description: 'Fixture for assignment API tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const [depA, depB, depC] = await Promise.all([
      tx.departure.create({
        data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), endDate: new Date('2026-09-05'), capacity: 5, status: 'SCHEDULED' },
      }),
      tx.departure.create({
        data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-09-03'), endDate: new Date('2026-09-08'), capacity: 5, status: 'SCHEDULED' },
      }),
      tx.departure.create({
        data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-10-01'), endDate: new Date('2026-10-05'), capacity: 5, status: 'SCHEDULED' },
      }),
    ]);
    departureAId = depA.id;
    departureBId = depB.id;
    departureCId = depC.id;

    const [activeVehicle, maintenanceVehicle] = await Promise.all([
      tx.vehicle.create({
        data: { organizationId: orgId, plateNumber: 'ACTIVE-1', make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 5, status: 'ACTIVE' },
      }),
      tx.vehicle.create({
        data: { organizationId: orgId, plateNumber: 'MAINT-1', make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 5, status: 'MAINTENANCE' },
      }),
    ]);
    activeVehicleId = activeVehicle.id;
    maintenanceVehicleId = maintenanceVehicle.id;

    const driverUsers = await Promise.all([
      tx.user.create({ data: { email: `driver-active-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId } }),
      tx.user.create({ data: { email: `driver-suspended-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId } }),
    ]);
    const [activeDriverProfile, suspendedDriverProfile] = await Promise.all([
      tx.driverProfile.create({ data: { organizationId: orgId, userId: driverUsers[0].id, licenseNumber: 'DL-ACTIVE', status: 'ACTIVE' } }),
      tx.driverProfile.create({ data: { organizationId: orgId, userId: driverUsers[1].id, licenseNumber: 'DL-SUSPENDED', status: 'SUSPENDED' } }),
    ]);
    activeDriverProfileId = activeDriverProfile.id;
    suspendedDriverProfileId = suspendedDriverProfile.id;

    const [depD, depE] = await Promise.all([
      tx.departure.create({
        data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-11-01'), endDate: new Date('2026-11-05'), capacity: 5, status: 'SCHEDULED' },
      }),
      tx.departure.create({
        data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-11-03'), endDate: new Date('2026-11-08'), capacity: 5, status: 'SCHEDULED' },
      }),
    ]);
    departureDId = depD.id;
    departureEId = depE.id;
  });

  // Split into a second withOrg call -- Prisma's 5000ms interactive-
  // transaction timeout is measurably too short for this sandbox's real
  // network path to Neon once a beforeAll does this much sequential work in
  // one transaction (documented gotcha, CLAUDE.md).
  await withOrg(orgId, async (tx) => {
    const guideUsers = await Promise.all([
      tx.user.create({ data: { email: `guide-active-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
      tx.user.create({ data: { email: `guide-suspended-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
      tx.user.create({ data: { email: `guide-noprofile-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
    ]);
    activeGuideId = guideUsers[0].id;
    suspendedGuideId = guideUsers[1].id;
    profilelessGuideId = guideUsers[2].id;
    await Promise.all([
      tx.guideProfile.create({ data: { organizationId: orgId, userId: activeGuideId, status: 'ACTIVE' } }),
      tx.guideProfile.create({ data: { organizationId: orgId, userId: suspendedGuideId, status: 'SUSPENDED' } }),
      // profilelessGuideId deliberately gets no GuideProfile row.
    ]);
  });
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
  await withOrg(orgId, (tx) => tx.assignment.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.guideProfile.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.vehicle.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('POST /api/v1/departures/:departureId/assignments', () => {
  it('an operator creates an assignment with a guide (201)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(
      `http://localhost/api/v1/departures/${departureAId}/assignments`,
      headers,
      'POST',
      { vehicleId: activeVehicleId, driverProfileId: activeDriverProfileId, guideUserId: guideId },
    );
    const res = await createAssignment(req, { params: Promise.resolve({ departureId: departureAId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.assignment.guideUserId).toBe(guideId);
  });

  it('a TOURIST cannot create an assignment (403)', async () => {
    const headers = await loginAs(touristId);
    const req = jsonRequest(
      `http://localhost/api/v1/departures/${departureCId}/assignments`,
      headers,
      'POST',
      { vehicleId: activeVehicleId, driverProfileId: activeDriverProfileId },
    );
    const res = await createAssignment(req, { params: Promise.resolve({ departureId: departureCId }) });
    expect(res.status).toBe(403);
  });

  it('rejects a MAINTENANCE vehicle (409)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(
      `http://localhost/api/v1/departures/${departureCId}/assignments`,
      headers,
      'POST',
      { vehicleId: maintenanceVehicleId, driverProfileId: activeDriverProfileId },
    );
    const res = await createAssignment(req, { params: Promise.resolve({ departureId: departureCId }) });
    expect(res.status).toBe(409);
  });

  it('rejects a SUSPENDED driver (409)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(
      `http://localhost/api/v1/departures/${departureCId}/assignments`,
      headers,
      'POST',
      { vehicleId: activeVehicleId, driverProfileId: suspendedDriverProfileId },
    );
    const res = await createAssignment(req, { params: Promise.resolve({ departureId: departureCId }) });
    expect(res.status).toBe(409);
  });

  it('rejects a guideUserId that is not a TOUR_GUIDE (422)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(
      `http://localhost/api/v1/departures/${departureCId}/assignments`,
      headers,
      'POST',
      { vehicleId: activeVehicleId, driverProfileId: activeDriverProfileId, guideUserId: otherRoleGuideId },
    );
    const res = await createAssignment(req, { params: Promise.resolve({ departureId: departureCId }) });
    expect(res.status).toBe(422);
  });

  it('rejects double-booking the same vehicle+driver on an overlapping departure (409)', async () => {
    // departureA already has activeVehicleId/activeDriverProfileId assigned (first test above).
    // departureB's dates (Sep 3-8) overlap departureA's (Sep 1-5).
    const headers = await loginAs(operatorId);
    const req = jsonRequest(
      `http://localhost/api/v1/departures/${departureBId}/assignments`,
      headers,
      'POST',
      { vehicleId: activeVehicleId, driverProfileId: activeDriverProfileId },
    );
    const res = await createAssignment(req, { params: Promise.resolve({ departureId: departureBId }) });
    expect(res.status).toBe(409);
  });

  it('allows the same vehicle+driver on a non-overlapping departure (201)', async () => {
    // departureC (Oct 1-5) does not overlap departureA (Sep 1-5).
    const headers = await loginAs(operatorId);
    const req = jsonRequest(
      `http://localhost/api/v1/departures/${departureCId}/assignments`,
      headers,
      'POST',
      { vehicleId: activeVehicleId, driverProfileId: activeDriverProfileId },
    );
    const res = await createAssignment(req, { params: Promise.resolve({ departureId: departureCId }) });
    expect(res.status).toBe(201);
  });

  it('rejects assigning the same vehicle to the same departure twice (409)', async () => {
    // departureC already has activeVehicleId assigned (previous test) -- try again with a different driver.
    const headers = await loginAs(operatorId);
    const req = jsonRequest(
      `http://localhost/api/v1/departures/${departureCId}/assignments`,
      headers,
      'POST',
      { vehicleId: activeVehicleId, driverProfileId: activeDriverProfileId },
    );
    const res = await createAssignment(req, { params: Promise.resolve({ departureId: departureCId }) });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/v1/departures/:departureId/assignments -- guide ACTIVE-status + overlap gap (DR-030)', () => {
  it('rejects a SUSPENDED guide (409)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(
      `http://localhost/api/v1/departures/${departureDId}/assignments`,
      headers,
      'POST',
      { vehicleId: activeVehicleId, driverProfileId: activeDriverProfileId, guideUserId: suspendedGuideId },
    );
    const res = await createAssignment(req, { params: Promise.resolve({ departureId: departureDId }) });
    expect(res.status).toBe(409);
  });

  it('allows a TOUR_GUIDE with no GuideProfile at all (profile is optional, not required)', async () => {
    const headers = await loginAs(operatorId);
    const req = jsonRequest(
      `http://localhost/api/v1/departures/${departureDId}/assignments`,
      headers,
      'POST',
      { vehicleId: activeVehicleId, driverProfileId: activeDriverProfileId, guideUserId: profilelessGuideId },
    );
    const res = await createAssignment(req, { params: Promise.resolve({ departureId: departureDId }) });
    expect(res.status).toBe(201);
  });

  it('rejects double-booking the same guide on an overlapping departure (409)', async () => {
    // Assign activeGuideId to departureD (Nov 1-5) via a fresh vehicle/driver
    // pair scoped just to this test, then try to assign the same guide to
    // departureE (Nov 3-8, overlapping) -- that second attempt must 409.
    const vehicle = await withOrg(orgId, (tx) =>
      tx.vehicle.create({ data: { organizationId: orgId, plateNumber: `GUIDE-OVERLAP-${Date.now()}`, make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 5, status: 'ACTIVE' } }),
    );
    const driverUser = await withOrg(orgId, (tx) =>
      tx.user.create({ data: { email: `guide-overlap-driver-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId } }),
    );
    const driverProfile = await withOrg(orgId, (tx) =>
      tx.driverProfile.create({ data: { organizationId: orgId, userId: driverUser.id, licenseNumber: `DL-GO-${Date.now()}`, status: 'ACTIVE' } }),
    );

    const assignHeaders = await loginAs(operatorId);
    const assignReq = jsonRequest(
      `http://localhost/api/v1/departures/${departureDId}/assignments`,
      assignHeaders,
      'POST',
      { vehicleId: vehicle.id, driverProfileId: driverProfile.id, guideUserId: activeGuideId },
    );
    const assignRes = await createAssignment(assignReq, { params: Promise.resolve({ departureId: departureDId }) });
    expect(assignRes.status).toBe(201);

    // Now try to assign the same guide to departureE, which overlaps departureD's dates.
    const vehicle2 = await withOrg(orgId, (tx) =>
      tx.vehicle.create({ data: { organizationId: orgId, plateNumber: `GUIDE-OVERLAP-2-${Date.now()}`, make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 5, status: 'ACTIVE' } }),
    );
    const driverUser2 = await withOrg(orgId, (tx) =>
      tx.user.create({ data: { email: `guide-overlap-driver-2-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId } }),
    );
    const driverProfile2 = await withOrg(orgId, (tx) =>
      tx.driverProfile.create({ data: { organizationId: orgId, userId: driverUser2.id, licenseNumber: `DL-GO2-${Date.now()}`, status: 'ACTIVE' } }),
    );
    const overlapHeaders = await loginAs(operatorId);
    const overlapReq = jsonRequest(
      `http://localhost/api/v1/departures/${departureEId}/assignments`,
      overlapHeaders,
      'POST',
      { vehicleId: vehicle2.id, driverProfileId: driverProfile2.id, guideUserId: activeGuideId },
    );
    const overlapRes = await createAssignment(overlapReq, { params: Promise.resolve({ departureId: departureEId }) });
    expect(overlapRes.status).toBe(409);
  }, 40_000); // more sequential DB round-trips than any other test here -- same timeout-bump precedent as booking-lookup.test.ts
});

describe('GET /api/v1/departures/:departureId/assignments', () => {
  it('an operator lists departureA\'s assignments', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/departures/${departureAId}/assignments`, { headers });
    const res = await listAssignments(req, { params: Promise.resolve({ departureId: departureAId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignments.length).toBe(1);
    expect(body.assignments[0].vehicleId).toBe(activeVehicleId);
  });

  it('a TOURIST cannot list assignments (403)', async () => {
    const headers = await loginAs(touristId);
    const req = new NextRequest(`http://localhost/api/v1/departures/${departureAId}/assignments`, { headers });
    const res = await listAssignments(req, { params: Promise.resolve({ departureId: departureAId }) });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/assignments/:assignmentId', () => {
  it('an operator removes an assignment (204), then it is gone from the list', async () => {
    const headers = await loginAs(operatorId);

    const listReq = new NextRequest(`http://localhost/api/v1/departures/${departureCId}/assignments`, { headers });
    const listRes = await listAssignments(listReq, { params: Promise.resolve({ departureId: departureCId }) });
    const { assignments } = await listRes.json();
    const assignmentId = assignments[0].id;

    const delReq = new NextRequest(`http://localhost/api/v1/assignments/${assignmentId}`, { method: 'DELETE', headers });
    const delRes = await deleteAssignment(delReq, { params: Promise.resolve({ assignmentId }) });
    expect(delRes.status).toBe(204);

    const listReq2 = new NextRequest(`http://localhost/api/v1/departures/${departureCId}/assignments`, { headers });
    const listRes2 = await listAssignments(listReq2, { params: Promise.resolve({ departureId: departureCId }) });
    const body2 = await listRes2.json();
    expect(body2.assignments.some((a: { id: string }) => a.id === assignmentId)).toBe(false);
  });

  it('404s for a non-existent assignment', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest('http://localhost/api/v1/assignments/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
      headers,
    });
    const res = await deleteAssignment(req, { params: Promise.resolve({ assignmentId: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(404);
  });
});
