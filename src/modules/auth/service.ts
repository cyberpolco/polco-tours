// auth module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import { assertCan, can, type Permission } from '@lib/rbac';
import { auth } from '@lib/auth';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { authRepository } from './repository';
import type { AuthContext, PublicUser, UpdateProfileInput } from './domain';

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
    assertCan(ctx.role, 'profile.write');
    return authRepository.updateProfile(ctx.userId, input);
  },

  /** Central authorization check other modules rely on. */
  authorize(ctx: AuthContext, permission: Permission): boolean {
    return can(ctx.role, permission);
  },

  /**
   * Resolves the Better Auth session on a request into an AuthContext. Reads
   * the user back through our own repository (not Better Auth's session
   * payload) so role/organizationId/deletedAt are always current, not
   * whatever was true when the session cookie was issued.
   */
  async resolveSession(headers: Headers): Promise<AuthContext> {
    const session = await auth.api.getSession({ headers });
    if (!session) throw Errors.unauthorized();

    const user = await authRepository.findUserById(session.user.id);
    if (!user) throw Errors.unauthorized('Account no longer active');

    return {
      userId: user.id,
      role: user.role,
      organizationId: user.organizationId,
      sessionId: session.session.id,
      assignedCountry: user.assignedCountry,
    };
  },

  /** Admin-only: assigns an IMMIGRATION_OFFICER's country scope (BR-10,
   * DR-019) -- first real use of admin.all, which nothing has exercised
   * before either. */
  async assignOfficerCountry(ctx: AuthContext, userId: string, country: string): Promise<PublicUser> {
    assertCan(ctx.role, 'admin.all');

    const target = await authRepository.findUserById(userId);
    if (!target || target.role !== 'IMMIGRATION_OFFICER') {
      throw Errors.validation('userId must reference an IMMIGRATION_OFFICER account');
    }
    if (!target.organizationId) throw Errors.validation('Target user has no organization membership');

    const countries = await authRepository.findOrganizationCountries(target.organizationId);
    if (!countries?.includes(country)) {
      throw Errors.validation(`country must be one of this organization's countries: ${countries?.join(', ') ?? ''}`);
    }

    const updated = await authRepository.updateAssignedCountry(userId, country);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: 'auth.officer_country_assigned',
      resourceType: 'User',
      resourceId: userId,
      organizationId: target.organizationId,
      metadata: { country },
    });
    return updated;
  },

  /** Admin-only: powers the officer-management page (list IMMIGRATION_OFFICER
   * accounts in the org + the org's own countries, for the assign/reassign
   * form) -- DR-020, the UI this admin.all capability was missing. */
  async listOfficers(ctx: AuthContext): Promise<{ officers: PublicUser[]; availableCountries: string[] }> {
    assertCan(ctx.role, 'admin.all');
    if (!ctx.organizationId) throw Errors.forbidden('No organization membership');

    const [officers, countries] = await Promise.all([
      authRepository.listByRole(ctx.organizationId, 'IMMIGRATION_OFFICER'),
      authRepository.findOrganizationCountries(ctx.organizationId),
    ]);
    return { officers, availableCountries: countries ?? [] };
  },
};

export type { AuthContext };
