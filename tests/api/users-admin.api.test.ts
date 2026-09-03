import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';

const { GET: listUsers, POST: createUser } = await import('../../src/app/api/v1/users/route');
const { PATCH: updateUser, DELETE: deactivateUser } = await import('../../src/app/api/v1/users/[userId]/route');
const { POST: resetPassword } = await import('../../src/app/api/v1/users/[userId]/reset-password/route');
const { PATCH: updateProfile } = await import('../../src/app/api/v1/users/me/route');

/** DR-026: admin user-management routes -- distinct from tests/api/users.api.test.ts, which covers the self-service /users/me route. */
const admin = new PrismaClient();

let orgId: string;
let superadminId: string;
let createdUserId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `USERS-ADMIN-API-TEST-${Date.now()}`, countries: ['NA', 'CD'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const superadmin = await admin.user.create({
    data: { email: `sa-${Date.now()}@example.test`, role: 'SUPERADMIN', organizationId: orgId },
  });
  superadminId = superadmin.id;
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
  // DriverProfile/GuideProfile cascade from User (onDelete: Cascade) --
  // Vehicle.ownerId does not, so it's deleted explicitly here.
  await withOrg(orgId, (tx) => tx.vehicle.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.membership.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.auditLog.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('POST /api/v1/users', () => {
  it('a SUPERADMIN creates a user with multiple roles, returning a one-time password (201)', async () => {
    const headers = await loginAs(superadminId);
    const email = `multi-${Date.now()}@example.test`;
    const req = jsonRequest('http://localhost/api/v1/users', headers, 'POST', {
      name: 'Multi Role',
      email,
      phone: '+264812345678',
      roles: ['DRIVER', 'TOUR_GUIDE'],
    });
    const res = await createUser(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.email).toBe(email);
    expect(body.user.roles.sort()).toEqual(['DRIVER', 'TOUR_GUIDE']);
    expect(body.user.mustChangePassword).toBe(true);
    expect(typeof body.temporaryPassword).toBe('string');
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(16);
    createdUserId = body.user.id;

    const memberships = await withOrg(orgId, (tx) => tx.membership.findMany({ where: { userId: createdUserId } }));
    expect(memberships.map((m) => m.role).sort()).toEqual(['DRIVER', 'TOUR_GUIDE']);

    // DR-138: DRIVER/TOUR_GUIDE both auto-provision their 1:1 fleet profile,
    // pre-filled with whatever's available (just userId/organizationId) --
    // everything else (here, licenseNumber) is a PENDING placeholder for
    // staff to fill in later on /staff/fleet/*.
    const driverProfile = await withOrg(orgId, (tx) => tx.driverProfile.findUnique({ where: { userId: createdUserId } }));
    expect(driverProfile?.licenseNumber).toBe('PENDING');
    const guideProfile = await withOrg(orgId, (tx) => tx.guideProfile.findUnique({ where: { userId: createdUserId } }));
    expect(guideProfile).not.toBeNull();
  }, 60_000); // createUser is several sequential DB round-trips (signUpEmail, finalize, memberships, audit, re-fetch); this sandbox's Neon latency can exceed the 20s default

  it('a SUPERADMIN creates a user with three simultaneous roles including TOUR_OPERATOR (201)', async () => {
    // Regression test: TOUR_OPERATOR is a no-op for fleet auto-provisioning
    // (only DRIVER/TOUR_GUIDE/VEHICLE_OWNER provision a profile), but the
    // extra role and the extra DB round-trips it implies were previously
    // untested alongside a real "Something went wrong" (Errors.internal())
    // production report -- root cause was an unguarded re-fetch of the
    // newly created user (findUserById returns null rather than throwing
    // P2025 on a Neon pooler read-after-write lag), now retried.
    const headers = await loginAs(superadminId);
    const email = `triple-${Date.now()}@example.test`;
    const req = jsonRequest('http://localhost/api/v1/users', headers, 'POST', {
      name: 'Triple Role',
      email,
      phone: '+264812345679',
      roles: ['DRIVER', 'TOUR_GUIDE', 'TOUR_OPERATOR'],
    });
    const res = await createUser(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.email).toBe(email);
    expect(body.user.roles.sort()).toEqual(['DRIVER', 'TOUR_GUIDE', 'TOUR_OPERATOR']);

    const memberships = await withOrg(orgId, (tx) => tx.membership.findMany({ where: { userId: body.user.id } }));
    expect(memberships.map((m) => m.role).sort()).toEqual(['DRIVER', 'TOUR_GUIDE', 'TOUR_OPERATOR']);
  }, 60_000);

  it('DR-229: role/organizationId/mustChangePassword/emailVerified are set atomically inside signUpEmail\'s own insert', async () => {
    // Reads the raw User row directly (bypassing authRepository.findUserById
    // /resolveRoles, which also depends on the separate Membership write)
    // to prove the User row itself is already fully correct the moment
    // createUser's signUpEmail call resolves -- this is exactly the
    // assertion that would have failed under the old insert-then-separate-
    // update design (DR-221/224/226).
    const headers = await loginAs(superadminId);
    const email = `atomic-${Date.now()}@example.test`;
    const req = jsonRequest('http://localhost/api/v1/users', headers, 'POST', {
      name: 'Atomic Check',
      email,
      phone: '+264812340001',
      roles: ['DRIVER'],
    });
    const res = await createUser(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();

    const rawUser = await prisma.user.findUnique({ where: { id: body.user.id } });
    expect(rawUser?.role).toBe('DRIVER');
    expect(rawUser?.organizationId).toBe(orgId);
    expect(rawUser?.mustChangePassword).toBe(true);
    expect(rawUser?.emailVerified).toBe(true);
    expect(rawUser?.phone).toBe('+264812340001');
  }, 60_000);

  it('DR-138: creating a VEHICLE_OWNER auto-provisions one placeholder Vehicle', async () => {
    const headers = await loginAs(superadminId);
    const email = `owner-${Date.now()}@example.test`;
    const req = jsonRequest('http://localhost/api/v1/users', headers, 'POST', {
      name: 'New Owner',
      email,
      roles: ['VEHICLE_OWNER'],
    });
    const res = await createUser(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();

    const vehicles = await withOrg(orgId, (tx) => tx.vehicle.findMany({ where: { ownerId: body.user.id } }));
    expect(vehicles).toHaveLength(1);
    const [vehicle] = vehicles;
    expect(vehicle?.plateNumber.startsWith('PENDING-')).toBe(true);
    expect(vehicle?.seatCapacity).toBe(1);
  }, 60_000);

  it('rejects creating a user with an already-used email (409)', async () => {
    const headers = await loginAs(superadminId);
    const existing = await admin.user.findUniqueOrThrow({ where: { id: createdUserId } });
    const req = jsonRequest('http://localhost/api/v1/users', headers, 'POST', {
      name: 'Dup',
      email: existing.email,
      roles: ['DRIVER'],
    });
    const res = await createUser(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(409);
  });

  it('rejects an empty roles array (422)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest('http://localhost/api/v1/users', headers, 'POST', {
      name: 'No Roles',
      email: `noroles-${Date.now()}@example.test`,
      roles: [],
    });
    const res = await createUser(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(422);
  });

  it('a non-admin cannot create a user (403)', async () => {
    const driver = await admin.user.create({
      data: { email: `driver-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId },
    });
    const headers = await loginAs(driver.id);
    const req = jsonRequest('http://localhost/api/v1/users', headers, 'POST', {
      name: 'X',
      email: `x-${Date.now()}@example.test`,
      roles: ['DRIVER'],
    });
    const res = await createUser(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/users', () => {
  it('a SUPERADMIN lists every user in the org (200)', async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest('http://localhost/api/v1/users', { headers });
    const res = await listUsers(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users.map((u: { id: string }) => u.id)).toContain(createdUserId);
  });
});

describe('DELETE /api/v1/users/:userId', () => {
  it('a SUPERADMIN cannot deactivate their own account (409)', async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest(`http://localhost/api/v1/users/${superadminId}`, { method: 'DELETE', headers });
    const res = await deactivateUser(req, { params: Promise.resolve({ userId: superadminId }) });
    expect(res.status).toBe(409);
  });

  it('a SUPERADMIN deactivates another user (204)', async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest(`http://localhost/api/v1/users/${createdUserId}`, { method: 'DELETE', headers });
    const res = await deactivateUser(req, { params: Promise.resolve({ userId: createdUserId }) });
    expect(res.status).toBe(204);

    const updated = await admin.user.findUniqueOrThrow({ where: { id: createdUserId } });
    expect(updated.deletedAt).not.toBeNull();
  });

  it('a deactivated user is immediately treated as unauthenticated (401)', async () => {
    const headers = await loginAs(createdUserId);
    const req = jsonRequest('http://localhost/api/v1/users/me', headers, 'PATCH', { name: 'Still trying' });
    const res = await updateProfile(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it('deactivating an unknown user 404s', async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest('http://localhost/api/v1/users/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
      headers,
    });
    const res = await deactivateUser(req, { params: Promise.resolve({ userId: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(404);
  });
});

/** DR-035: edit an existing user's profile fields and/or role set. */
describe('PATCH /api/v1/users/:userId', () => {
  let editTargetId: string;

  beforeAll(async () => {
    const target = await admin.user.create({
      data: { email: `edit-target-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId },
    });
    editTargetId = target.id;
  });

  it('a SUPERADMIN edits a user\'s name/phone/roles (200)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest(`http://localhost/api/v1/users/${editTargetId}`, headers, 'PATCH', {
      name: 'Renamed Driver',
      phone: '+264811112222',
      roles: ['DRIVER', 'TOUR_GUIDE'],
    });
    const res = await updateUser(req, { params: Promise.resolve({ userId: editTargetId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.name).toBe('Renamed Driver');
    expect(body.user.roles.sort()).toEqual(['DRIVER', 'TOUR_GUIDE']);

    const memberships = await withOrg(orgId, (tx) => tx.membership.findMany({ where: { userId: editTargetId } }));
    expect(memberships.map((m) => m.role).sort()).toEqual(['DRIVER', 'TOUR_GUIDE']);
  });

  it('a SUPERADMIN cannot edit their own account this way (409)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest(`http://localhost/api/v1/users/${superadminId}`, headers, 'PATCH', { name: 'Self Edit' });
    const res = await updateUser(req, { params: Promise.resolve({ userId: superadminId }) });
    expect(res.status).toBe(409);
  });

  it('rejects an edit to an already-used email (409)', async () => {
    const headers = await loginAs(superadminId);
    const existing = await admin.user.findUniqueOrThrow({ where: { id: superadminId } });
    const req = jsonRequest(`http://localhost/api/v1/users/${editTargetId}`, headers, 'PATCH', { email: existing.email });
    const res = await updateUser(req, { params: Promise.resolve({ userId: editTargetId }) });
    expect(res.status).toBe(409);
  });

  it('editing an unknown user 404s', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest(
      'http://localhost/api/v1/users/00000000-0000-0000-0000-000000000000',
      headers,
      'PATCH',
      { name: 'Ghost' },
    );
    const res = await updateUser(req, { params: Promise.resolve({ userId: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(404);
  });

  it('DR-138: adding VEHICLE_OWNER to an existing user via edit auto-provisions a placeholder Vehicle', async () => {
    const target = await admin.user.create({
      data: { email: `edit-owner-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId },
    });
    const headers = await loginAs(superadminId);
    const req = jsonRequest(`http://localhost/api/v1/users/${target.id}`, headers, 'PATCH', {
      roles: ['DRIVER', 'VEHICLE_OWNER'],
    });
    const res = await updateUser(req, { params: Promise.resolve({ userId: target.id }) });
    expect(res.status).toBe(200);

    const vehicles = await withOrg(orgId, (tx) => tx.vehicle.findMany({ where: { ownerId: target.id } }));
    expect(vehicles).toHaveLength(1);

    // Re-submitting the same roles (e.g. re-saving the edit form unchanged)
    // must not pile up a second placeholder vehicle -- guarded by "does this
    // user already own any vehicle."
    const req2 = jsonRequest(`http://localhost/api/v1/users/${target.id}`, headers, 'PATCH', {
      roles: ['DRIVER', 'VEHICLE_OWNER'],
    });
    const res2 = await updateUser(req2, { params: Promise.resolve({ userId: target.id }) });
    expect(res2.status).toBe(200);
    const vehiclesAfterReSubmit = await withOrg(orgId, (tx) => tx.vehicle.findMany({ where: { ownerId: target.id } }));
    expect(vehiclesAfterReSubmit).toHaveLength(1);
  });

  it('DR-138: an edit that never touches roles does not re-run fleet provisioning', async () => {
    const target = await admin.user.create({
      data: { email: `edit-noroles-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId },
    });
    const headers = await loginAs(superadminId);
    const req = jsonRequest(`http://localhost/api/v1/users/${target.id}`, headers, 'PATCH', { name: 'Just A Rename' });
    const res = await updateUser(req, { params: Promise.resolve({ userId: target.id }) });
    expect(res.status).toBe(200);

    const driverProfile = await withOrg(orgId, (tx) => tx.driverProfile.findUnique({ where: { userId: target.id } }));
    expect(driverProfile).toBeNull();
  });
});

/** DR-035: generate-and-reveal-once a new temporary password for an existing user. */
describe('POST /api/v1/users/:userId/reset-password', () => {
  let resetTargetId: string;

  beforeAll(async () => {
    const target = await admin.user.create({
      data: { email: `reset-target-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId },
    });
    resetTargetId = target.id;
  });

  it("a SUPERADMIN resets a user's password, returning it once (200)", async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest(`http://localhost/api/v1/users/${resetTargetId}/reset-password`, {
      method: 'POST',
      headers,
    });
    const res = await resetPassword(req, { params: Promise.resolve({ userId: resetTargetId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.temporaryPassword).toBe('string');
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(16);

    const updated = await admin.user.findUniqueOrThrow({ where: { id: resetTargetId } });
    expect(updated.mustChangePassword).toBe(true);
  });

  it('a SUPERADMIN cannot reset their own password this way (409)', async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest(`http://localhost/api/v1/users/${superadminId}/reset-password`, {
      method: 'POST',
      headers,
    });
    const res = await resetPassword(req, { params: Promise.resolve({ userId: superadminId }) });
    expect(res.status).toBe(409);
  });

  it('resetting an unknown user\'s password 404s', async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest('http://localhost/api/v1/users/00000000-0000-0000-0000-000000000000/reset-password', {
      method: 'POST',
      headers,
    });
    const res = await resetPassword(req, { params: Promise.resolve({ userId: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(404);
  });
});
