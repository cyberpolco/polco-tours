// auth module — repository. The only place that touches the DB for this module.
import type { Role } from '@prisma/client';
import { prisma, withOrg } from '@lib/db';
import type { PublicUser, UpdateProfileInput } from './domain';

interface RawUser {
  id: string;
  email: string;
  name: string | null;
  role: PublicUser['role'];
  organizationId: string | null;
  emailVerified: boolean;
  phone: string | null;
  preferredLocale: PublicUser['preferredLocale'];
  deletedAt: Date | null;
  mustChangePassword: boolean;
}

function toPublicUser(u: RawUser, roles: Role[]): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    roles,
    organizationId: u.organizationId,
    emailVerified: u.emailVerified,
    phone: u.phone,
    preferredLocale: u.preferredLocale,
    deletedAt: u.deletedAt,
    mustChangePassword: u.mustChangePassword,
  };
}

/**
 * DR-026: the union of Membership.role values (for the user's own org) plus
 * User.role, deduped. `organization_members` is RLS-protected (unlike
 * `users`), so this must go through withOrg -- a plain unscoped `prisma`
 * read would silently see zero membership rows (deny-by-default), not an
 * error, which would be a much harder bug to notice than a thrown one.
 */
async function resolveRoles(u: RawUser): Promise<Role[]> {
  if (!u.organizationId) return [u.role];
  const memberships = await withOrg(u.organizationId, (tx) => tx.membership.findMany({ where: { userId: u.id } }));
  return [...new Set([u.role, ...memberships.map((m) => m.role)])];
}

export const authRepository = {
  async findUserByEmail(email: string): Promise<PublicUser | null> {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u || u.deletedAt) return null;
    return toPublicUser(u, await resolveRoles(u));
  },

  async findUserById(id: string): Promise<PublicUser | null> {
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u || u.deletedAt) return null;
    return toPublicUser(u, await resolveRoles(u));
  },

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
    const u = await prisma.user.update({ where: { id: userId }, data: input });
    return toPublicUser(u, await resolveRoles(u));
  },

  /** DR-026: every non-deleted user in the org, for the admin user-management
   * page (authService.listUsers). */
  async listAll(organizationId: string): Promise<PublicUser[]> {
    const users = await withOrg(organizationId, (tx) =>
      tx.user.findMany({ where: { organizationId, deletedAt: null }, orderBy: { email: 'asc' } }),
    );
    return Promise.all(users.map(async (u) => toPublicUser(u, await resolveRoles(u))));
  },

  /** DR-026: finishes what auth.api.signUpEmail can't set directly (role/
   * phone/organizationId aren't registered better-auth additionalFields, so
   * they must be written via a plain Prisma update, same pattern
   * scripts/create-staff-user.ts already uses) -- also flips emailVerified
   * and mustChangePassword for an admin-created account with a generated
   * temporary password. */
  async finalizeAdminCreatedUser(
    userId: string,
    input: { role: Role; phone: string | null; organizationId: string },
  ): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        role: input.role,
        phone: input.phone,
        organizationId: input.organizationId,
        emailVerified: true,
        mustChangePassword: true,
      },
    });
  },

  /** DR-026: inserts one Membership row per role a newly-created user holds. */
  async createMemberships(userId: string, organizationId: string, roles: Role[]): Promise<void> {
    await withOrg(organizationId, (tx) =>
      tx.membership.createMany({ data: roles.map((role) => ({ userId, organizationId, role })) }),
    );
  },

  /** DR-026: soft-delete -- see the deletedAt read-side checks above and in
   * authService.resolveSession, which already treat this as "gone". */
  async softDeleteUser(userId: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
  },

  /** DR-026: clears the forced-password-change flag after a successful
   * self-service change (better-auth's changePassword API). */
  async clearMustChangePassword(userId: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { mustChangePassword: false } });
  },
};
