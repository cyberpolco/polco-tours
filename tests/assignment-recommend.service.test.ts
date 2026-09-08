import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { testPackageReference } from './helpers/package-reference';
import type { AuthContext } from '../src/modules/auth';
import { assignmentService } from '../src/modules/assignment';
import { resolvePermissionsForRoles } from '../src/lib/rbac';
import { withOrg, prisma } from '../src/lib/db';

/**
 * assignmentService.recommendAssignment (DR-037/DR-247/DR-252) had zero
 * test coverage anywhere -- not in assignment.api.test.ts, not a domain
 * test, despite backing a real staff-facing route
 * (/api/v1/departures/[departureId]/recommend-assignment) and being the
 * one piece of "AI-ish" business logic CLAUDE.md is careful to call an
 * honest rules-based scorer (found by an architecture audit). This proves
 * the two real business rules end to end against a minimal fixture:
 *
 *  - DR-247: a guide whose specialties overlap the departure's package
 *    tags outranks a guide with NO overlap even if the latter has a
 *    strictly higher averageRating.
 *  - DR-252: when the top-ranked guide also holds their own eligible
 *    DriverProfile, that same person is recommended as the driver too,
 *    ahead of an unrelated driver with a higher averageRating.
 */
const admin = new PrismaClient();

let orgId: string;
let operatorId: string;
let departureId: string;
let vehicleId: string;
let matchingGuideUserId: string;
let matchingGuideDriverProfileId: string;
let higherRatedUnrelatedDriverProfileId: string;

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `ASSIGN-RECOMMEND-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const operator = await admin.user.create({
    data: { email: `op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId },
  });
  operatorId = operator.id;

  // One user holds BOTH a GuideProfile (the specialty match, lower rating)
  // AND a DriverProfile (also lower rating than the unrelated driver) --
  // the dual-role person DR-252 is about.
  const dualRoleUser = await admin.user.create({
    data: { email: `dual-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId },
  });
  matchingGuideUserId = dualRoleUser.id;

  const unrelatedDriverUser = await admin.user.create({
    data: { email: `driver-hi-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId },
  });

  const unrelatedGuideUser = await admin.user.create({
    data: { email: `guide-hi-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId },
  });

  // Split into two withOrg calls -- Prisma's 5000ms interactive-transaction
  // timeout is measurably too short for this sandbox's real network path to
  // Neon once a beforeAll does this much sequential work in one transaction
  // (documented gotcha, CLAUDE.md; same fix assignment.api.test.ts's own
  // beforeAll already applies).
  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: 'Recommend Assignment Fixture',
        description: 'Fixture.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED_AVAILABLE',
        tags: ['WILDLIFE'],
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date(Date.now() + 60 * 86400000), endDate: new Date(Date.now() + 64 * 86400000), capacity: 4, status: 'SCHEDULED' },
    });
    departureId = departure.id;

    const vehicle = await tx.vehicle.create({
      data: { organizationId: orgId, plateNumber: `REC-${Date.now()}`, make: 'Toyota', model: 'Hilux', vehicleType: '4x4', seatCapacity: 4, status: 'ACTIVE' },
    });
    vehicleId = vehicle.id;

    const matchingGuideDriverProfile = await tx.driverProfile.create({
      data: { organizationId: orgId, userId: matchingGuideUserId, licenseNumber: 'DL-DUAL', status: 'ACTIVE', averageRating: 3.0 },
    });
    matchingGuideDriverProfileId = matchingGuideDriverProfile.id;
    const unrelatedDriverProfile = await tx.driverProfile.create({
      data: { organizationId: orgId, userId: unrelatedDriverUser.id, licenseNumber: 'DL-HI', status: 'ACTIVE', averageRating: 5.0 },
    });
    higherRatedUnrelatedDriverProfileId = unrelatedDriverProfile.id;
  });

  await withOrg(orgId, async (tx) => {
    await tx.guideProfile.create({
      data: { organizationId: orgId, userId: matchingGuideUserId, status: 'ACTIVE', specialties: ['WILDLIFE'], averageRating: 3.0 },
    });
    await tx.guideProfile.create({
      data: { organizationId: orgId, userId: unrelatedGuideUser.id, status: 'ACTIVE', specialties: [], averageRating: 5.0 },
    });
  });
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

describe('assignmentService.recommendAssignment (DR-247/DR-252)', () => {
  it('picks the specialty-matching guide over a higher-rated unrelated one, and the vehicle that fits capacity', async () => {
    const ctx: AuthContext = {
      userId: operatorId,
      roles: ['TOUR_OPERATOR'],
      permissions: resolvePermissionsForRoles(['TOUR_OPERATOR']),
      organizationId: orgId,
      sessionId: 'session-1',
      mustChangePassword: false,
    };

    const recommendation = await assignmentService.recommendAssignment(ctx, departureId);

    expect(recommendation.recommendedGuideId).toBe(matchingGuideUserId);
    expect(recommendation.recommendedVehicleId).toBe(vehicleId);
  });

  it('DR-252: prefers the top guide\'s own DriverProfile over a higher-rated unrelated driver', async () => {
    const ctx: AuthContext = {
      userId: operatorId,
      roles: ['TOUR_OPERATOR'],
      permissions: resolvePermissionsForRoles(['TOUR_OPERATOR']),
      organizationId: orgId,
      sessionId: 'session-1',
      mustChangePassword: false,
    };

    const recommendation = await assignmentService.recommendAssignment(ctx, departureId);

    expect(recommendation.recommendedDriverId).toBe(matchingGuideDriverProfileId);
    expect(recommendation.recommendedDriverId).not.toBe(higherRatedUnrelatedDriverProfileId);
  });
});
