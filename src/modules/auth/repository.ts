// auth module — repository. The only place that touches the DB for this module.
import type { Role } from '@prisma/client';
import type { Permission } from '@lib/rbac';
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

  /** DR-035: edit an already-created user's profile fields. Deliberately
   * separate from updateProfile (self-service only, DR-013) -- this is the
   * admin-facing equivalent, called on behalf of someone else. */
  async updateUserFields(userId: string, input: { name?: string; email?: string; phone?: string | null }): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: input });
  },

  /** DR-035: replaces a user's full held role set (all existing Membership
   * rows for this org + the primary User.role) -- not a partial add/remove,
   * matching createMemberships/CreateUserInput's "give me the full set"
   * shape. `withOrg`'s callback already runs inside one transaction (its
   * `tx` type deliberately omits `$transaction` -- Prisma doesn't support
   * nesting), so these three statements are already atomic as-is. */
  async replaceRoles(userId: string, organizationId: string, roles: Role[]): Promise<void> {
    const primaryRole = roles[0];
    if (!primaryRole) throw new Error('replaceRoles requires at least one role');
    await withOrg(organizationId, async (tx) => {
      await tx.membership.deleteMany({ where: { userId, organizationId } });
      await tx.membership.createMany({ data: roles.map((role) => ({ userId, organizationId, role })) });
      await tx.user.update({ where: { id: userId }, data: { role: primaryRole } });
    });
  },

  /** DR-035: admin-facing password reset -- same shape as
   * scripts/set-staff-password.ts's Account upsert (hashed the same way
   * better-auth's own sign-up flow does), but reachable from the staff UI
   * instead of requiring shell/DB access. Always forces mustChangePassword
   * so the generated password is never the user's last one. */
  async resetPassword(userId: string, hashedPassword: string): Promise<void> {
    const existing = await prisma.account.findFirst({ where: { userId, providerId: 'credential' } });
    if (existing) {
      await prisma.account.update({ where: { id: existing.id }, data: { password: hashedPassword } });
    } else {
      await prisma.account.create({
        data: { userId, providerId: 'credential', accountId: userId, password: hashedPassword },
      });
    }
    await prisma.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
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

  /** DR-035: the union of every DB-backed grant across the given roles --
   * called once per request by resolveSession. RolePermission is
   * platform-wide reference data (no organizationId/RLS, same as TaxRate/
   * CountryRegulation), so this queries the bare `prisma` client directly,
   * never `withOrg`. SUPERADMIN is never passed in here in practice (its
   * wildcard is checked before this in rbac.ts's can()), but querying for
   * it would just harmlessly return nothing, since it never holds rows.
   */
  async listPermissionsForRoles(roles: Role[]): Promise<Permission[]> {
    const rows = await prisma.rolePermission.findMany({
      where: { role: { in: roles } },
      select: { permission: true },
    });
    return [...new Set(rows.map((r) => r.permission))] as Permission[];
  },

  /** DR-035: every row in the platform-wide RolePermission table -- powers
   * the permission-matrix editor's full grid (grouped by role in the
   * service layer). Same bare-`prisma`-client convention as
   * listPermissionsForRoles (no organizationId/RLS on this table). */
  async listAllRolePermissions(): Promise<{ role: Role; permission: string }[]> {
    return prisma.rolePermission.findMany({ select: { role: true, permission: true } });
  },

  /** DR-035: idempotent grant -- the matrix editor toggles a checkbox on,
   * not "create if not exists then error if it does". */
  async grantRolePermission(role: Role, permission: Permission): Promise<void> {
    await prisma.rolePermission.upsert({
      where: { role_permission: { role, permission } },
      update: {},
      create: { role, permission },
    });
  },

  async revokeRolePermission(role: Role, permission: Permission): Promise<void> {
    await prisma.rolePermission.deleteMany({ where: { role, permission } });
  },
};
