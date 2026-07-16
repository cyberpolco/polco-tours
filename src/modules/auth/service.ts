// auth module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import { generateRandomString } from 'better-auth/crypto';
import { assertCan, can, type Permission } from '@lib/rbac';
import { auth } from '@lib/auth';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { authRepository } from './repository';
import type { AuthContext, CreateUserInput, PublicUser, UpdateProfileInput } from './domain';

export const authService = {
  async getUser(id: string): Promise<PublicUser | null> {
    return authRepository.findUserById(id);
  },

  /** Internal backend-to-backend lookup (mirrors getUser) -- used by staff
   * booking-on-behalf-of-a-client flows to resolve an existing tourist by
   * email. No internal permission check; the caller gates first. */
  async getUserByEmail(email: string): Promise<PublicUser | null> {
    return authRepository.findUserByEmail(email);
  },

  /** Self-service only -- ctx.userId is always the target, no ownership
   * param exists to check (DR-013). assertCan is redundant with the route's
   * withAuth gate but matches every other business-action service method's
   * double-check convention (unlike this module's identity primitives). */
  async updateProfile(ctx: AuthContext, input: UpdateProfileInput): Promise<PublicUser> {
    assertCan(ctx.roles, 'profile.write');
    return authRepository.updateProfile(ctx.userId, input);
  },

  /** Central authorization check other modules rely on. */
  authorize(ctx: AuthContext, permission: Permission): boolean {
    return can(ctx.roles, permission);
  },

  /**
   * Resolves the Better Auth session on a request into an AuthContext. Reads
   * the user back through our own repository (not Better Auth's session
   * payload) so roles/organizationId/deletedAt/mustChangePassword are always
   * current, not whatever was true when the session cookie was issued.
   */
  async resolveSession(headers: Headers): Promise<AuthContext> {
    const session = await auth.api.getSession({ headers });
    if (!session) throw Errors.unauthorized();

    const user = await authRepository.findUserById(session.user.id);
    if (!user) throw Errors.unauthorized('Account no longer active');

    return {
      userId: user.id,
      roles: user.roles,
      organizationId: user.organizationId,
      sessionId: session.session.id,
      mustChangePassword: user.mustChangePassword,
    };
  },

  /** Admin-only: powers the general user-management page (DR-026) -- every
   * non-deleted user in the org, with their full role set. */
  async listUsers(ctx: AuthContext): Promise<PublicUser[]> {
    assertCan(ctx.roles, 'admin.all');
    if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
    return authRepository.listAll(ctx.organizationId);
  },

  /** Admin-only: creates a staff account with one or more simultaneous roles
   * and a generated one-time password the caller must relay out of band --
   * it is returned exactly once here and never persisted in plaintext or
   * retrievable again (DR-026). Mirrors scripts/create-staff-user.ts's use
   * of auth.api.signUpEmail for real credential hashing. */
  async createUser(ctx: AuthContext, input: CreateUserInput): Promise<{ user: PublicUser; temporaryPassword: string }> {
    assertCan(ctx.roles, 'admin.all');
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
    assertCan(ctx.roles, 'admin.all');
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
};

export type { AuthContext };
