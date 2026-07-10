import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
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
        title: 'Assignment Security Fixture',
        description: 'Fixture for assignment anti-BOLA tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
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
  });
});

afterAll(async () => {
  await withOrg(orgId, (tx) => tx.assignment.deleteMany({ where: { organizationId: orgId } }));
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
});

describe('anti-BOLA: GET /api/v1/departures/:departureId/assignments (manager-only)', () => {
  it('a TOUR_GUIDE cannot use the manager-only per-departure listing (403)', async () => {
    const headers = await loginAs(guideAId);
    const req = new NextRequest('http://localhost/api/v1/departures/any/assignments', { headers });
    const res = await listForDeparture(req, { params: Promise.resolve({ departureId: 'any' }) });
    expect(res.status).toBe(403);
  });
});
