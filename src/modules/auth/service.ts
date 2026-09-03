// auth module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { Role } from '@prisma/client';
import { generateRandomString, hashPassword } from 'better-auth/crypto';
import { assertCan, can, resolvePermissionsForRoles, type Permission } from '@lib/rbac';
import { auth } from '@lib/auth';
import { audit } from '@lib/audit';
import { withTransientRetry } from '@lib/db';
import { Errors } from '@lib/errors';
import { withTrustedUserCreate } from '@lib/trusted-user-create';
import { authRepository } from './repository';
import { computeStaffRosterSummary, isClientDirectoryViewer, isSuperAdmin } from './domain';
import type { AuthContext, CreateUserInput, PublicUser, StaffRosterSummary, UpdateProfileInput, UpdateUserInput } from './domain';

export const authService = {
  async getUser(id: string): Promise<PublicUser | null> {
    return authRepository.findUserById(id);
  },

  /** Internal backend-to-backend lookup (mirrors getUser). No internal
   * permission check; the caller gates first. */
  async getUserByEmail(email: string): Promise<PublicUser | null> {
    return authRepository.findUserByEmail(email);
  },

  /** DR-205: internal backend-to-backend lookup (mirrors getUserByEmail) --
   * used by the visa module's new-application staff alert to notify every
   * VISA_FACILITATOR in the org. No internal permission check; the caller
   * gates first (same convention as getUser/getUserByEmail). */
  async listUsersByRole(organizationId: string, role: Role): Promise<PublicUser[]> {
    return authRepository.findUsersByRole(organizationId, role);
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
   * DR-159: also resolves the effective permission set here, once per
   * request, via rbac.ts's resolvePermissionsForRoles -- a pure in-memory
   * lookup against the hardcoded ROLE_PERMISSIONS map, no DB query.
   */
  async resolveSession(headers: Headers): Promise<AuthContext> {
    const session = await auth.api.getSession({ headers });
    if (!session) throw Errors.unauthorized();

    const user = await authRepository.findUserById(session.user.id);
    if (!user) throw Errors.unauthorized('Account no longer active');

    const permissions = resolvePermissionsForRoles(user.roles);

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
   * non-deleted STAFF account in the org (excludes TOURIST -- see
   * listClients below), with their full role set. */
  async listUsers(ctx: AuthContext): Promise<PublicUser[]> {
    assertCan(ctx, 'admin.all');
    if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
    return authRepository.listStaff(ctx.organizationId);
  },

  /** DR-155: the Insights dashboard's Staff-stats section -- an aggregate-
   * only projection (headcount by role, active/deactivated/dormant), gated
   * by staff_roster.read rather than admin.all so TOUR_OPERATOR (which
   * holds insights.read but not the much broader admin.all) can see it
   * without also unlocking user CRUD/the permissions matrix. */
  async getStaffRosterSummary(ctx: AuthContext): Promise<StaffRosterSummary> {
    assertCan(ctx, 'staff_roster.read');
    if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
    const staff = await authRepository.listStaff(ctx.organizationId);
    return computeStaffRosterSummary(staff);
  },

  /** The "Clients" directory -- every bare/anonymous TOURIST contact record
   * in the org (none of which can ever sign in, see createBareTourist's own
   * comment). SUPERADMIN/TOUR_OPERATOR-only, same boundary as manual staff
   * booking creation -- gated on booking.create (the permission those two
   * roles already hold for exactly this reason) plus an explicit role check,
   * same "route/service passes a broader gate, service narrows further"
   * layering as isCountryRegulationWriter/isFleetDeleter. */
  async listClients(ctx: AuthContext): Promise<PublicUser[]> {
    assertCan(ctx, 'booking.create');
    if (!isClientDirectoryViewer(ctx.roles)) throw Errors.forbidden('Only SUPERADMIN/TOUR_OPERATOR may view the client directory');
    if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
    return authRepository.listClients(ctx.organizationId);
  },

  /** SUPERADMIN-only (narrower than listClients above, explicit user
   * direction) -- soft-deletes a client contact record. The actual
   * business-rule guard (no active/future/unreviewed booking) is NOT
   * checked here: it lives in src/lib/client-deletion.ts's
   * assertClientDeletable, called by the Server Action just before this,
   * because auth cannot depend on booking/ratings (booking already depends
   * on auth -- the reverse would be circular, same reasoning as DR-059's
   * itinerary-deletion orchestration). This method only enforces the role
   * gate and performs the write. */
  async deleteClient(ctx: AuthContext, clientUserId: string): Promise<void> {
    assertCan(ctx, 'booking.create');
    if (!isSuperAdmin(ctx.roles)) throw Errors.forbidden('Only SUPERADMIN may delete a client');
    const target = await authRepository.findUserById(clientUserId);
    if (!target) throw Errors.notFound('Client not found');
    await authRepository.softDeleteUser(clientUserId);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'auth.client_deleted',
      resourceType: 'User',
      resourceId: clientUserId,
      organizationId: ctx.organizationId ?? undefined,
    });
  },

  /** Admin-only: creates a staff account with one or more simultaneous roles
   * and a generated one-time password the caller must relay out of band --
   * it is returned exactly once here and never persisted in plaintext or
   * retrievable again (DR-026). Mirrors scripts/create-staff-user.ts's use
   * of auth.api.signUpEmail for real credential hashing. */
  async createUser(ctx: AuthContext, input: CreateUserInput): Promise<{ user: PublicUser; temporaryPassword: string }> {
    assertCan(ctx, 'admin.all');
    if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
    // Captured into a local so it stays narrowed to `string` inside the
    // withTransientRetry closure below -- TS control-flow narrowing on a
    // property access (ctx.organizationId) doesn't survive into a nested
    // function.
    const organizationId = ctx.organizationId;

    const existing = await authRepository.findUserByEmail(input.email);
    if (existing) throw Errors.conflict('A user with this email already exists');

    const primaryRole = input.roles[0];
    if (!primaryRole) throw Errors.validation('At least one role is required');

    // DR-229: role/organizationId/mustChangePassword/phone/emailVerified
    // are now set atomically inside this signUpEmail call's own INSERT, via
    // the trusted signal src/lib/auth.ts's databaseHooks.user.create.before
    // hook reads -- see src/lib/trusted-user-create.ts. This replaces the
    // old insert-then-separate-update pattern that caused DR-221/224/226.
    const temporaryPassword = generateRandomString(16, 'a-z', 'A-Z', '0-9');
    const result = await withTrustedUserCreate(
      { role: primaryRole, organizationId, mustChangePassword: true, phone: input.phone ?? null },
      () => auth.api.signUpEmail({ body: { name: input.name, email: input.email, password: temporaryPassword } }),
    );

    await authRepository.finalizeAdminCreatedUser(result.user.id, {
      roles: input.roles,
      organizationId,
    });

    // DR-221 follow-up, real repro: this audit() write is its own withOrg
    // transaction, just like finalizeAdminCreatedUser's above -- the same
    // transient Neon connectivity blip can hit it too, and without a retry
    // here it crashed createUser with a raw, uncaught Prisma error even
    // though the user account (with every selected role) had already
    // committed successfully one line above. Same retry treatment, not a
    // silent swallow -- NFR-07 still requires this event to be logged.
    await withTransientRetry(() =>
      audit({
        actorUserId: ctx.userId,
        actorRole: ctx.roles[0],
        action: 'auth.user_created',
        resourceType: 'User',
        resourceId: result.user.id,
        organizationId,
        metadata: { email: input.email, roles: input.roles },
      }),
    );

    // DR-229 narrowed this comment's scope: since role/organizationId/
    // mustChangePassword/emailVerified are now set atomically inside
    // signUpEmail's own INSERT (see above), the User row itself is
    // complete the moment signUpEmail resolves -- that part of the old
    // race is gone. What's left: finalizeAdminCreatedUser's Membership
    // rows are still a genuinely separate write, and findUserById ->
    // resolveRoles reads them via yet another connection -- if that write
    // hasn't landed yet, resolveRoles silently returns just the primary
    // role instead of throwing, so this retry-on-null loop stays. (A
    // residual "does a User-row read itself still ever race the now-atomic
    // User-row write" risk was investigated but not fully confirmed either
    // way from code alone -- watch Vercel logs post-deploy for this loop's
    // attempt count before assuming it can shrink further.)
    // findUserById's prisma.user.findUnique returns null on a miss rather
    // than throwing P2025 -- so it slips past withTransientRetry/
    // isTransientDbError entirely, hence this separate retry-on-null loop
    // instead of reusing that helper.
    let user = await authRepository.findUserById(result.user.id);
    for (let attempt = 1; !user && attempt < 4; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
      user = await authRepository.findUserById(result.user.id);
    }
    if (!user) throw Errors.internal();
    return { user, temporaryPassword };
  },

  /** Admin-only: deactivates a user (DR-026) -- resolveSession/
   * findUserByEmail/findUserById already treat a deletedAt-set user as
   * unauthenticated, so the next request they make fails closed with no
   * separate session-revocation step needed. Blocks self-deactivation.
   * DR-141: reversible via reactivateUser below -- softDeleteUser leaves
   * deletedPermanently at its default false, distinguishing this from
   * deleteUser's permanent version. */
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

  /** DR-084/DR-141: clears whichever "not active" state is set -- a
   * dormancy lock (inactiveAt, the automatic 30-day sweep) or a manual
   * Deactivate (deletedAt) -- refusing only once deletedPermanently marks
   * the account as genuinely Deleted, not just Deactivated. Same admin.all
   * gate either way; no SUPERADMIN-only narrowing here (unlike deleteUser)
   * since restoring an account is not itself destructive. Uses
   * findUserByIdIncludingDeleted (not findUserById) since a Deactivated
   * account's own deletedAt would otherwise make it invisible to this very
   * lookup -- a real gap found while adding the Deactivate case here (the
   * pre-existing dormancy-only case never hit it, since dormancy doesn't
   * set deletedAt). */
  async reactivateUser(ctx: AuthContext, userId: string): Promise<void> {
    assertCan(ctx, 'admin.all');
    const target = await authRepository.findUserByIdIncludingDeleted(userId);
    if (!target) throw Errors.notFound('User not found');
    if (target.deletedPermanently) {
      throw Errors.conflict('This account was permanently deleted and cannot be reactivated');
    }
    await authRepository.reactivateUser(userId);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'auth.user_reactivated',
      resourceType: 'User',
      resourceId: userId,
      organizationId: ctx.organizationId ?? undefined,
    });
  },

  /** DR-141 (explicit user request): a genuinely permanent counterpart to
   * deactivateUser -- SUPERADMIN-only (same "route passes via the
   * DB-editable permission matrix, service still rejects" layering as
   * isFleetDeleter/isBookingDeleter/isCountryRegulationWriter), and
   * reactivateUser refuses forever once this runs. Blocks self-delete, same
   * as deactivateUser. Uses findUserByIdIncludingDeleted so a Deactivated
   * (or even already-Deleted) account can still be resolved to act on. */
  async deleteUser(ctx: AuthContext, userId: string): Promise<void> {
    assertCan(ctx, 'admin.all');
    if (!isSuperAdmin(ctx.roles)) throw Errors.forbidden('Only SUPERADMIN may permanently delete a user');
    if (userId === ctx.userId) throw Errors.conflict('You cannot delete your own account');

    const target = await authRepository.findUserByIdIncludingDeleted(userId);
    if (!target) throw Errors.notFound('User not found');
    if (target.deletedPermanently) throw Errors.conflict('This user has already been deleted');

    await authRepository.permanentlyDeleteUser(userId);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'auth.user_deleted',
      resourceType: 'User',
      resourceId: userId,
      organizationId: ctx.organizationId ?? undefined,
    });
  },

  /** DR-084: scheduled-sweep entry point, no ctx -- there is no
   * AuthContext for "the platform's own scheduler," same shape as
   * fleetService.runAvailabilitySweep/bookingService.runScheduledSweep. */
  async runDormancySweep(): Promise<{ usersMarkedDormant: number }> {
    const usersMarkedDormant = await authRepository.markDormantUsers(new Date());
    return { usersMarkedDormant };
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

};

export type { AuthContext };
