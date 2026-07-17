import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';

const { GET: getPermissions, PATCH: patchPermissions } = await import('../../src/app/api/v1/permissions/route');
const { GET: listVehicles } = await import('../../src/app/api/v1/fleet/vehicles/route');

/**
 * DR-035: the runtime permission-matrix editor. RolePermission is
 * platform-wide reference data (no organizationId/RLS, same precedent as
 * TaxRate/CountryRegulation) -- these tests mutate the SAME table every
 * other environment reads from, so every toggle uses either a fictitious
 * permission string (never checked by any real route) or is carefully
 * restored to its original seeded state in afterAll.
 */
const admin = new PrismaClient();

let orgId: string;
let superadminId: string;
let platformAdminId: string;

// Fictitious -- SetRolePermissionInput doesn't enum-validate permission
// strings (see its own comment), so an unrecognized string is a safe,
// harmless row nothing else will ever check.
const FICTITIOUS_PERMISSION = '__dr035_test_permission__';
const FICTITIOUS_ROLE = 'TOUR_GUIDE' as const;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `PERMISSIONS-API-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [superadmin, platformAdmin] = await Promise.all([
    admin.user.create({ data: { email: `sa-perm-${Date.now()}@example.test`, role: 'SUPERADMIN', organizationId: orgId } }),
    admin.user.create({ data: { email: `pa-perm-${Date.now()}@example.test`, role: 'PLATFORM_ADMIN', organizationId: orgId } }),
  ]);
  superadminId = superadmin.id;
  platformAdminId = platformAdmin.id;
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
  // Belt-and-braces: remove the fictitious row and restore PLATFORM_ADMIN's
  // real fleet.read grant regardless of whether the tests below already did
  // so -- never leave shared, platform-wide reference data in a mutated
  // state after this file finishes.
  await admin.rolePermission.deleteMany({ where: { role: FICTITIOUS_ROLE, permission: FICTITIOUS_PERMISSION } });
  await admin.rolePermission.upsert({
    where: { role_permission: { role: 'PLATFORM_ADMIN', permission: 'fleet.read' } },
    update: {},
    create: { role: 'PLATFORM_ADMIN', permission: 'fleet.read' },
  });
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('GET /api/v1/permissions', () => {
  it('a SUPERADMIN sees the full matrix, keyed by every EDITABLE_ROLE (200)', async () => {
    const headers = await loginAs(superadminId);
    const res = await getPermissions(new NextRequest('http://localhost/api/v1/permissions', { headers }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.matrix).sort()).toEqual(
      ['DRIVER', 'PLATFORM_ADMIN', 'TOUR_GUIDE', 'TOUR_OPERATOR', 'TOURIST', 'VEHICLE_OWNER', 'VISA_FACILITATOR'].sort(),
    );
    expect(body.matrix.PLATFORM_ADMIN).toContain('fleet.read');
    expect(body.matrix.SUPERADMIN).toBeUndefined();
  });
});

describe('PATCH /api/v1/permissions', () => {
  it('a SUPERADMIN can grant then revoke a permission, reflected immediately in GET (200)', async () => {
    const headers = await loginAs(superadminId);

    const grantRes = await patchPermissions(
      jsonRequest('http://localhost/api/v1/permissions', headers, 'PATCH', {
        role: FICTITIOUS_ROLE,
        permission: FICTITIOUS_PERMISSION,
        granted: true,
      }),
      { params: Promise.resolve({}) },
    );
    expect(grantRes.status).toBe(200);
    const grantBody = await grantRes.json();
    expect(grantBody.matrix[FICTITIOUS_ROLE]).toContain(FICTITIOUS_PERMISSION);

    const revokeRes = await patchPermissions(
      jsonRequest('http://localhost/api/v1/permissions', headers, 'PATCH', {
        role: FICTITIOUS_ROLE,
        permission: FICTITIOUS_PERMISSION,
        granted: false,
      }),
      { params: Promise.resolve({}) },
    );
    expect(revokeRes.status).toBe(200);
    const revokeBody = await revokeRes.json();
    expect(revokeBody.matrix[FICTITIOUS_ROLE]).not.toContain(FICTITIOUS_PERMISSION);
  });

  it('SUPERADMIN cannot be targeted -- excluded from EDITABLE_ROLES, rejected at validation (422)', async () => {
    // SetRolePermissionInput's role field is z.enum(EDITABLE_ROLES), which
    // deliberately excludes SUPERADMIN -- so this never reaches
    // authService.setRolePermission's own `role === 'SUPERADMIN'` conflict
    // check (that branch is unreachable from this route; validation is the
    // real gate here). Stale test previously expected 409 from that
    // now-unreachable service-layer check.
    const headers = await loginAs(superadminId);
    const res = await patchPermissions(
      jsonRequest('http://localhost/api/v1/permissions', headers, 'PATCH', {
        role: 'SUPERADMIN',
        permission: 'admin.all',
        granted: true,
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(422);
  });

  it(
    "revoking PLATFORM_ADMIN's fleet.read takes effect on the very next request, and re-granting it restores access (critical DR-035 behavior)",
    async () => {
      const superadminHeaders = await loginAs(superadminId);
      const platformAdminHeaders = await loginAs(platformAdminId);

      // Sanity check: PLATFORM_ADMIN starts with real fleet access (seeded).
      const before = await listVehicles(new NextRequest('http://localhost/api/v1/fleet/vehicles', { headers: platformAdminHeaders }), {
        params: Promise.resolve({}),
      });
      expect(before.status).toBe(200);

      // Revoke it via the matrix editor.
      const revokeRes = await patchPermissions(
        jsonRequest('http://localhost/api/v1/permissions', superadminHeaders, 'PATCH', {
          role: 'PLATFORM_ADMIN',
          permission: 'fleet.read',
          granted: false,
        }),
        { params: Promise.resolve({}) },
      );
      expect(revokeRes.status).toBe(200);

      // The very next request from the SAME already-logged-in PLATFORM_ADMIN
      // session now 403s -- proves permissions are resolved live per request
      // (authService.resolveSession), not cached at login time.
      const during = await listVehicles(new NextRequest('http://localhost/api/v1/fleet/vehicles', { headers: platformAdminHeaders }), {
        params: Promise.resolve({}),
      });
      expect(during.status).toBe(403);

      // Re-grant restores access immediately.
      const regrantRes = await patchPermissions(
        jsonRequest('http://localhost/api/v1/permissions', superadminHeaders, 'PATCH', {
          role: 'PLATFORM_ADMIN',
          permission: 'fleet.read',
          granted: true,
        }),
        { params: Promise.resolve({}) },
      );
      expect(regrantRes.status).toBe(200);

      const after = await listVehicles(new NextRequest('http://localhost/api/v1/fleet/vehicles', { headers: platformAdminHeaders }), {
        params: Promise.resolve({}),
      });
      expect(after.status).toBe(200);
    },
    30_000,
  );
});
