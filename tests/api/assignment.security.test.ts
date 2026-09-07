import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPackageReference } from '../helpers/package-reference';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { generateBookingReference } from '../../src/modules/booking';
import { GET as listMine } from '../../src/app/api/v1/assignments/mine/route';
import { GET as listForDeparture } from '../../src/app/api/v1/departures/[departureId]/assignments/route';

/**
 * Anti-BOLA (Vol. 8, API1): RLS only isolates by organizationId -- it does
 * NOT stop one TOUR_GUIDE/DRIVER/VEHICLE_OWNER from seeing another's
 * assignment in the same org. That ownership check lives in
 * assignment/service.ts's listMyAssignments; this is the test CLAUDE.md's
 * Definition of Done calls a "security test" beyond RLS.
 */
const admin = new PrismaClient();

let orgId: string;
let guideAId: string;
let guideBId: string;
let driverAUserId: string;
let driverBUserId: string;
let ownerAId: string;
let ownerBId: string;
let assignmentAId: string;
let assignmentBId: string;
let pkgId: string;
let vehicleAId: string;
let driverProfileAId: string;
let depAId: string;
let depBId: string;

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `ASSIGN-SEC-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [guideA, guideB, driverAUser, driverBUser, ownerA, ownerB] = await Promise.all([
    admin.user.create({ data: { email: `guide-a-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
    admin.user.create({ data: { email: `guide-b-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
    admin.user.create({ data: { email: `driver-a-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId } }),
    admin.user.create({ data: { email: `driver-b-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId } }),
    admin.user.create({ data: { email: `owner-a-${Date.now()}@example.test`, role: 'VEHICLE_OWNER', organizationId: orgId } }),
    admin.user.create({ data: { email: `owner-b-${Date.now()}@example.test`, role: 'VEHICLE_OWNER', organizationId: orgId } }),
  ]);
  guideAId = guideA.id;
  guideBId = guideB.id;
  driverAUserId = driverAUser.id;
  driverBUserId = driverBUser.id;
  ownerAId = ownerA.id;
  ownerBId = ownerB.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: 'Assignment Security Fixture',
        description: 'Fixture for assignment anti-BOLA tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED_AVAILABLE',
      },
    });
    pkgId = pkg.id;
    const [depA, depB] = await Promise.all([
      tx.departure.create({
        data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), capacity: 5, status: 'SCHEDULED' },
      }),
      tx.departure.create({
        data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-11-01'), capacity: 5, status: 'SCHEDULED' },
      }),
    ]);

    const [vehicleA, vehicleB] = await Promise.all([
      tx.vehicle.create({
        data: { organizationId: orgId, ownerId: ownerAId, plateNumber: 'SEC-A', make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 5, status: 'ACTIVE' },
      }),
      tx.vehicle.create({
        data: { organizationId: orgId, ownerId: ownerBId, plateNumber: 'SEC-B', make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 5, status: 'ACTIVE' },
      }),
    ]);

    const [driverProfileA, driverProfileB] = await Promise.all([
      tx.driverProfile.create({ data: { organizationId: orgId, userId: driverAUserId, licenseNumber: 'DL-SEC-A', status: 'ACTIVE' } }),
      tx.driverProfile.create({ data: { organizationId: orgId, userId: driverBUserId, licenseNumber: 'DL-SEC-B', status: 'ACTIVE' } }),
    ]);

    const [assignmentA, assignmentB] = await Promise.all([
      tx.assignment.create({
        data: { organizationId: orgId, departureId: depA.id, vehicleId: vehicleA.id, driverProfileId: driverProfileA.id, guideUserId: guideAId },
      }),
      tx.assignment.create({
        data: { organizationId: orgId, departureId: depB.id, vehicleId: vehicleB.id, driverProfileId: driverProfileB.id, guideUserId: guideBId },
      }),
    ]);
    assignmentAId = assignmentA.id;
    assignmentBId = assignmentB.id;
    vehicleAId = vehicleA.id;
    driverProfileAId = driverProfileA.id;
    depAId = depA.id;
    depBId = depB.id;
  });

  // DR-265: listMyAssignments now drops an assignment once every booking on
  // its departure has been deleted -- these two fixture departures need a
  // real, live (non-deleted) booking each, or the assignments above would
  // never surface at all, regardless of which guide/driver/owner is asking.
  // A separate transaction from the block above -- the extra round trips
  // pushed the combined beforeAll past Prisma's 5s interactive-transaction
  // timeout against this sandbox's real (higher-latency) Neon connection.
  await withOrg(orgId, async (tx) => {
    const tourist = await tx.user.create({ data: { email: `assign-sec-tourist-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } });
    await Promise.all([
      tx.booking.create({
        data: {
          organizationId: orgId,
          departureId: depAId,
          touristUserId: tourist.id,
          seats: 1,
          status: 'CONFIRMED',
          priceMinor: 10000,
          currency: 'USD',
          bookingReference: generateBookingReference(),
        },
      }),
      tx.booking.create({
        data: {
          organizationId: orgId,
          departureId: depBId,
          touristUserId: tourist.id,
          seats: 1,
          status: 'CONFIRMED',
          priceMinor: 10000,
          currency: 'USD',
          bookingReference: generateBookingReference(),
        },
      }),
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
  // DR-265's fixture bookings reference both departureId and touristUserId --
  // must go before both the departure and the (later) user cleanup below.
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.driverProfile.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.vehicle.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('anti-BOLA: GET /api/v1/assignments/mine', () => {
  it("guide A's schedule includes only their own assignment", async () => {
    const headers = await loginAs(guideAId);
    const req = new NextRequest('http://localhost/api/v1/assignments/mine', { headers });
    const res = await listMine(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignments.map((a: { id: string }) => a.id)).toEqual([assignmentAId]);
  });

  it("driver A's schedule includes only their own assignment", async () => {
    const headers = await loginAs(driverAUserId);
    const req = new NextRequest('http://localhost/api/v1/assignments/mine', { headers });
    const res = await listMine(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignments.map((a: { id: string }) => a.id)).toEqual([assignmentAId]);
  });

  it("vehicle owner A's schedule includes only their own assignment", async () => {
    const headers = await loginAs(ownerAId);
    const req = new NextRequest('http://localhost/api/v1/assignments/mine', { headers });
    const res = await listMine(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignments.map((a: { id: string }) => a.id)).toEqual([assignmentAId]);
  });

  it("guide B's schedule never includes guide A's assignment", async () => {
    const headers = await loginAs(guideBId);
    const req = new NextRequest('http://localhost/api/v1/assignments/mine', { headers });
    const res = await listMine(req, { params: Promise.resolve({}) });
    const body = await res.json();
    expect(body.assignments.some((a: { id: string }) => a.id === assignmentAId)).toBe(false);
    expect(body.assignments.map((a: { id: string }) => a.id)).toEqual([assignmentBId]);
  });

  // DR-265 (real bug found): Assignment belongs to Departure, not Booking --
  // DR-241's immediate booking hard-delete never touches it, so an
  // assignment used to keep showing on a guide/driver/owner's own schedule
  // forever after the one booking it was for was deleted. This reproduces
  // that exact shape directly (a departure that never got a booking is
  // indistinguishable from one whose booking was hard-deleted -- the row is
  // just gone either way) rather than relying on the three tests above,
  // which only prove the ordinary "has a live booking" path still works.
  it('drops an assignment whose departure has no live booking left', async () => {
    const orphanDepartureId = await withOrg(orgId, async (tx) => {
      const dep = await tx.departure.create({
        data: { organizationId: orgId, tourPackageId: pkgId, startDate: new Date('2027-01-01'), capacity: 5, status: 'SCHEDULED' },
      });
      // Reuses vehicleA/driverProfileA against a different departure --
      // Assignment's only unique constraint is the (departureId, vehicleId)
      // pair, not vehicleId or driverProfileId alone, so this is a valid,
      // ordinary "same driver/vehicle, different trip" shape.
      await tx.assignment.create({
        data: { organizationId: orgId, departureId: dep.id, vehicleId: vehicleAId, driverProfileId: driverProfileAId, guideUserId: guideAId },
      });
      return dep.id;
    });

    const headers = await loginAs(guideAId);
    const req = new NextRequest('http://localhost/api/v1/assignments/mine', { headers });
    const res = await listMine(req, { params: Promise.resolve({}) });
    const body = await res.json();
    // Guide A's real, booked assignment (assignmentA) still shows -- only
    // the orphaned one is dropped.
    expect(body.assignments.map((a: { id: string; departureId: string }) => a.departureId)).not.toContain(orphanDepartureId);
    expect(body.assignments.map((a: { id: string }) => a.id)).toContain(assignmentAId);
  });
});

describe('anti-BOLA: GET /api/v1/departures/:departureId/assignments (manager-only)', () => {
  it('a TOUR_GUIDE cannot use the manager-only per-departure listing (403)', async () => {
    const headers = await loginAs(guideAId);
    const req = new NextRequest('http://localhost/api/v1/departures/any/assignments', { headers });
    const res = await listForDeparture(req, { params: Promise.resolve({ departureId: 'any' }) });
    expect(res.status).toBe(403);
  });
});
