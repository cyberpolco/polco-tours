import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../src/modules/auth';
import { trackingService } from '../src/modules/tracking';
import { resolvePermissionsForRoles } from '../src/lib/rbac';
import { withOrg, prisma } from '../src/lib/db';

/**
 * trackingService's business logic was exercised only via
 * tracking.api.test.ts/tracking.security.test.ts (found by an architecture
 * audit) -- both of those thoroughly cover the DR-197 "ghost trip" fix and
 * the future-departure exclusion, but neither fixture includes a Starlink
 * kit not yet paired to a vehicle. getFleetSnapshot's own "Unassigned"/
 * unknown-location fallback (kit.vehicleId/lastLocationAt both null -- a
 * real, ordinary state for a kit that's been registered but not yet
 * installed in a vehicle) had zero coverage anywhere. A direct
 * service-layer test with a minimal fixture (one kit, no vehicle, no
 * assignments) is cheaper and more targeted than duplicating the existing
 * API test's large fixture just to add this one branch.
 */
const admin = new PrismaClient();

let orgId: string;
let operatorId: string;

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `TRACKING-SVC-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;
  const operator = await admin.user.create({
    data: { email: `op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId },
  });
  operatorId = operator.id;
  await withOrg(orgId, (tx) =>
    tx.starlinkKit.create({ data: { organizationId: orgId, kitId: `KIT-UNASSIGNED-${Date.now()}`, status: 'ACTIVE' } }),
  );
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
  await withOrg(orgId, (tx) => tx.starlinkKit.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('trackingService.getFleetSnapshot -- unassigned/unlocated kit fallback', () => {
  it('a Starlink kit with no vehicle and no location shows as "Unassigned"/UNKNOWN, not a crash', async () => {
    const ctx: AuthContext = {
      userId: operatorId,
      roles: ['TOUR_OPERATOR'],
      permissions: resolvePermissionsForRoles(['TOUR_OPERATOR']),
      organizationId: orgId,
      sessionId: 'session-1',
      mustChangePassword: false,
    };

    const snapshot = await trackingService.getFleetSnapshot(ctx);

    expect(snapshot.fleet).toHaveLength(1);
    const kit = snapshot.fleet[0]!;
    expect(kit.vehicleId).toBe('');
    expect(kit.plateNumber).toBe('Unassigned');
    expect(kit.latitude).toBeNull();
    expect(kit.longitude).toBeNull();
    expect(kit.freshness).toBe('UNKNOWN');
    expect(snapshot.activeTrips).toHaveLength(0);
  });
});
