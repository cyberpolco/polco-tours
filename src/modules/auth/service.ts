// auth module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import { generateRandomString, hashPassword } from 'better-auth/crypto';
import { assertCan, can, EDITABLE_ROLES, type Permission, type RoleName } from '@lib/rbac';
import { auth } from '@lib/auth';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { authRepository } from './repository';
import { isSuperAdmin } from './domain';
import type { AuthContext, CreateUserInput, PublicUser, UpdateProfileInput, UpdateUserInput } from './domain';

export const authService = {
  async getUser(id: string): Promise<PublicUser | null> {
    return authRepository.findUserById(id);
  },

  /** Internal backend-to-backend lookup (mirrors getUser). No internal
   * permission check; the caller gates first. */
  async getUserByEmail(email: string): Promise<PublicUser | null> {
    return authRepository.findUserByEmail(email);
  },

  /** Staff booking-on-behalf-of-a-client flows (DR-036): resolves a tourist
   * by email, creating a login-less User row if none exists yet -- tourists
   * never sign up (DR-016), so requiring a pre-existing account here was
   * never consistent with that rule. The created row has no Account/
   * credential row and can never sign in; the client can still find their
   * booking via bookingService.lookupByBookingReference (booking reference +
   * last name), same as a guest checkout. No internal permission check; the
   * caller (booking.create) already gates. */
  async findOrCreateTouristByEmail(ctx: AuthContext, email: string): Promise<PublicUser> {
    const existing = await authRepository.findUserByEmail(email);
    if (existing) return existing;
    if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
    return authRepository.createBareTourist(email, ctx.organizationId);
  },

  /** Self-service only -- ctx.userId is always the target, no ownership
   * param exists to check (DR-013). assertCan is redundant with the route's
   * withAuth gate but matches every other business-action service method's
   * double-check convention (unlike this module's identity primitives). */
  async updateProfile(ctx: AuthContext, input: UpdateProfileInput): Promise<PublicUser> {
    assertCan(ctx, 'profile.write');
    return authRepository.updateProfile(ctx.userId, input);
  },

  /** Central authorization check other modules rely on. */
  authorize(ctx: AuthContext, permission: Permission): boolean {
    return can(ctx, permission);
  },

  /**
   * Resolves the Better Auth session on a request into an AuthContext. Reads
   * the user back through our own repository (not Better Auth's session
   * payload) so roles/organizationId/deletedAt/mustChangePassword are always
   * current, not whatever was true when the session cookie was issued.
   *
   * DR-035: also resolves the DB-backed effective permission set here, once
   * per request -- SUPERADMIN sessions skip the query entirely (its
   * wildcard in rbac.ts's can() never consults `permissions`, so there's
   * nothing to look up).
   */
  async resolveSession(headers: Headers): Promise<AuthContext> {
    const session = await auth.api.getSession({ headers });
    if (!session) throw Errors.unauthorized();

    const user = await authRepository.findUserById(session.user.id);
    if (!user) throw Errors.unauthorized('Account no longer active');

    const permissions = user.roles.includes('SUPERADMIN')
      ? new Set<Permission>()
      : new Set(await authRepository.listPermissionsForRoles(user.roles));

    return {
      userId: user.id,
      roles: user.roles,
      permissions,
      organizationId: user.organizationId,
      sessionId: session.session.id,
      mustChangePassword: user.mustChangePassword,
    };
  },

  /** Admin-only: powers the general user-management page (DR-026) -- every
   * non-deleted user in the org, with their full role set. */
  async listUsers(ctx: AuthContext): Promise<PublicUser[]> {
    assertCan(ctx, 'admin.all');
    if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
    return authRepository.listAll(ctx.organizationId);
  },

  /** Admin-only: creates a staff account with one or more simultaneous roles
   * and a generated one-time password the caller must relay out of band --
   * it is returned exactly once here and never persisted in plaintext or
   * retrievable again (DR-026). Mirrors scripts/create-staff-user.ts's use
   * of auth.api.signUpEmail for real credential hashing. */
  async createUser(ctx: AuthContext, input: CreateUserInput): Promise<{ user: PublicUser; temporaryPassword: string }> {
    assertCan(ctx, 'admin.all');
    if (!ctx.organizationId) throw Errors.forbidden('No organization membership');

    const existing = await authRepository.findUserByEmail(input.email);
    if (existing) throw Errors.conflict('A user with this email already exists');

    const primaryRole = input.roles[0];
    if (!primaryRole) throw Errors.validation('At least one role is required');

    const temporaryPassword = generateRandomString(16, 'a-z', 'A-Z', '0-9');
    const result = await auth.api.signUpEmail({
      body: { name: input.name, email: input.email, password: temporaryPassword },
    });

    await authRepository.finalizeAdminCreatedUser(result.user.id, {
      role: primaryRole,
      phone: input.phone ?? null,
      organizationId: ctx.organizationId,
    });
    await authRepository.createMemberships(result.user.id, ctx.organizationId, input.roles);

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'auth.user_created',
      resourceType: 'User',
      resourceId: result.user.id,
      organizationId: ctx.organizationId,
      metadata: { email: input.email, roles: input.roles },
    });

    const user = await authRepository.findUserById(result.user.id);
    if (!user) throw Errors.internal();
    return { user, temporaryPassword };
  },

  /** Admin-only: soft-deletes a user (DR-026) -- resolveSession/
   * findUserByEmail/findUserById already treat a deletedAt-set user as
   * unauthenticated, so the next request they make fails closed with no
   * separate session-revocation step needed. Blocks self-deactivation. */
  async deactivateUser(ctx: AuthContext, userId: string): Promise<void> {
    assertCan(ctx, 'admin.all');
    if (userId === ctx.userId) throw Errors.conflict('You cannot deactivate your own account');

    const target = await authRepository.findUserById(userId);
    if (!target) throw Errors.notFound('User not found');

    await authRepository.softDeleteUser(userId);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'auth.user_deactivated',
      resourceType: 'User',
      resourceId: userId,
      organizationId: ctx.organizationId ?? undefined,
    });
  },

  /** Self-service: clears the forced-password-change flag after
   * better-auth's own changePassword API confirms the current password and
   * sets the new one (staff/change-password/actions.ts). Not a registered
   * better-auth additionalField, so set directly, same as role/phone. */
  async clearMustChangePassword(userId: string): Promise<void> {
    await authRepository.clearMustChangePassword(userId);
  },

  /** Admin-only: edits an existing user's profile fields and/or role set
   * (DR-035) -- distinct from the permission-matrix editor, which edits
   * what a ROLE grants, not which roles a specific user holds. Blocks
   * self-edit (same "an admin can't accidentally lock themselves out"
   * reasoning as deactivateUser's self-deactivation block -- removing your
   * own admin.all-granting role here would strand you outside the very
   * page you're using; ask another admin instead). */
  async updateUser(ctx: AuthContext, userId: string, input: UpdateUserInput): Promise<PublicUser> {
    assertCan(ctx, 'admin.all');
    if (userId === ctx.userId) throw Errors.conflict('You cannot edit your own account this way');

    const target = await authRepository.findUserById(userId);
    if (!target) throw Errors.notFound('User not found');

    if (input.email && input.email !== target.email) {
      const existing = await authRepository.findUserByEmail(input.email);
      if (existing) throw Errors.conflict('A user with this email already exists');
    }

    const { roles, ...profileFields } = input;
    if (Object.keys(profileFields).length > 0) {
      await authRepository.updateUserFields(userId, profileFields);
    }
    if (roles) {
      if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
      await authRepository.replaceRoles(userId, ctx.organizationId, roles);
    }

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'auth.user_updated',
      resourceType: 'User',
      resourceId: userId,
      organizationId: ctx.organizationId ?? undefined,
      metadata: { ...input },
    });

    const updated = await authRepository.findUserById(userId);
    if (!updated) throw Errors.internal();
    return updated;
  },

  /** Admin-only: generates a fresh one-time password for an existing user,
   * shown exactly once (DR-035) -- closes the gap where a password reset
   * previously required shell/DB access (scripts/set-staff-password.ts).
   * Always forces mustChangePassword so the generated password is never
   * left as the user's long-term one. Blocks self-reset -- the existing
   * self-service change-password flow (staff/change-password) is the
   * correct path for your own account. */
  async resetPassword(ctx: AuthContext, userId: string): Promise<{ temporaryPassword: string }> {
    assertCan(ctx, 'admin.all');
    if (userId === ctx.userId) throw Errors.conflict('Use the change-password page to reset your own password');

    const target = await authRepository.findUserById(userId);
    if (!target) throw Errors.notFound('User not found');

    const temporaryPassword = generateRandomString(16, 'a-z', 'A-Z', '0-9');
    const hashed = await hashPassword(temporaryPassword);
    await authRepository.resetPassword(userId, hashed);

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'auth.password_reset',
      resourceType: 'User',
      resourceId: userId,
      organizationId: ctx.organizationId ?? undefined,
    });

    return { temporaryPassword };
  },

  /** SUPERADMIN-only (DR-035): the full permission-matrix grid, one array
   * per editable role (every role except SUPERADMIN, which is fixed --
   * see rbac.ts's EDITABLE_ROLES). Powers /staff/admin/permissions. */
  async getPermissionMatrix(ctx: AuthContext): Promise<Record<Exclude<RoleName, 'SUPERADMIN'>, Permission[]>> {
    if (!isSuperAdmin(ctx.roles)) throw Errors.forbidden('Only SUPERADMIN may view the permission matrix');

    const rows = await authRepository.listAllRolePermissions();
    const matrix = Object.fromEntries(EDITABLE_ROLES.map((role) => [role, [] as Permission[]])) as Record<
      Exclude<RoleName, 'SUPERADMIN'>,
      Permission[]
    >;
    for (const row of rows) {
      const role = row.role as Exclude<RoleName, 'SUPERADMIN'>;
      if (role in matrix) matrix[role].push(row.permission as Permission);
    }
    return matrix;
  },

  /** SUPERADMIN-only (DR-035): toggles a single (role, permission) grant.
   * SUPERADMIN itself can never be targeted -- it's a hardcoded,
   * unconditional wildcard in rbac.ts, not a DB row, so there is nothing
   * here to toggle for it. */
  async setRolePermission(ctx: AuthContext, role: RoleName, permission: Permission, granted: boolean): Promise<void> {
    if (!isSuperAdmin(ctx.roles)) throw Errors.forbidden('Only SUPERADMIN may edit the permission matrix');
    if (role === 'SUPERADMIN') throw Errors.conflict('SUPERADMIN is a fixed role and cannot be edited');

    if (granted) {
      await authRepository.grantRolePermission(role, permission);
    } else {
      await authRepository.revokeRolePermission(role, permission);
    }

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: granted ? 'auth.permission_granted' : 'auth.permission_revoked',
      resourceType: 'RolePermission',
      resourceId: `${role}:${permission}`,
      organizationId: ctx.organizationId ?? undefined,
      metadata: { role, permission, granted },
    });
  },
};

export type { AuthContext };
