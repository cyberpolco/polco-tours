// auth module — repository. The only place that touches the DB for this module.
import type { Role } from '@prisma/client';
import { prisma, withOrg } from '@lib/db';
import { DORMANCY_THRESHOLD_DAYS } from './domain';
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
  deletedPermanently: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  inactiveAt: Date | null;
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
    deletedPermanently: u.deletedPermanently,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
    inactiveAt: u.inactiveAt,
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

  /** DR-141: unlike findUserById above, does NOT exclude a deletedAt-set
   * row -- reactivateUser/deleteUser both need to resolve a Deactivated (or
   * already-Deleted) account to act on it, exactly the accounts
   * findUserById's blanket exclusion was written to hide from every other
   * caller (a real gap found while building this: findUserById's exclusion
   * meant reactivating a Deactivated, not just dormant, user always 404'd,
   * even though that same account still shows up on /staff/admin/users). */
  async findUserByIdIncludingDeleted(id: string): Promise<PublicUser | null> {
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) return null;
    return toPublicUser(u, await resolveRoles(u));
  },

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
    const u = await prisma.user.update({ where: { id: userId }, data: input });
    return toPublicUser(u, await resolveRoles(u));
  },

  /** DR-036: a login-less User row for a staff-entered client email --
   * `role` defaults to TOURIST and no Account/credential row is ever
   * created, so this person can never sign in (tourists never sign up,
   * DR-016). Exists purely so Booking.touristUserId has a real row to point
   * at; the client can still find their booking via
   * bookingService.lookupByBookingReference, same as a guest checkout. */
  async createBareTourist(email: string, organizationId: string): Promise<PublicUser> {
    const u = await prisma.user.create({ data: { email, organizationId } });
    return toPublicUser(u, await resolveRoles(u));
  },

  /** DR-026: every STAFF account in the org (i.e. everyone except TOURIST,
   * which is exclusively the bare-client-record role -- see
   * createBareTourist above and listClients below) for the admin
   * user-management page (authService.listUsers). Explicitly excludes
   * TOURIST since staff-created client records and guest anonymous-session
   * accounts would otherwise clutter a page meant for managing staff
   * roles/passwords, neither of which apply to a client at all.
   *
   * Deliberately does NOT filter deletedAt (DR-091: the page's own Status
   * filter needs to be able to show Deactivated accounts too) -- the page
   * hides them by default in-memory instead, replicating what used to be a
   * hard DB-level exclusion. DR-141: a permanently Deleted account IS
   * excluded here at the DB level, unlike a plain Deactivate -- explicit
   * user request ("a deleted user shouldn't be listed"), and unlike
   * Deactivated there's no reactivate-from-this-page path that would ever
   * need one to still be visible/actionable here. Its audit trail
   * (`auth.user_deleted`) still exists in `audit_logs` regardless. */
  async listStaff(organizationId: string): Promise<PublicUser[]> {
    const users = await withOrg(organizationId, (tx) =>
      tx.user.findMany({ where: { organizationId, role: { not: 'TOURIST' }, deletedPermanently: false }, orderBy: { email: 'asc' } }),
    );
    return Promise.all(users.map(async (u) => toPublicUser(u, await resolveRoles(u))));
  },

  /** The "Clients" directory -- every TOURIST-role record in the org,
   * whichever of the 3 booking-creation paths brought them in (guest
   * package browse, guest /plan-my-trip, or staff-created via
   * findOrCreateTouristByEmail). None of these can ever sign in (no
   * Account/credential row for a staff-created one; better-auth's own
   * anonymous-session mechanism for a guest one), so this is a read-only
   * contact directory, not a user-management surface. */
  async listClients(organizationId: string): Promise<PublicUser[]> {
    const users = await withOrg(organizationId, (tx) =>
      tx.user.findMany({ where: { organizationId, deletedAt: null, role: 'TOURIST' }, orderBy: { email: 'asc' } }),
    );
    return Promise.all(users.map(async (u) => toPublicUser(u, await resolveRoles(u))));
  },

  /** DR-205: every active user holding `role` as their PRIMARY role in the
   * org -- powers the visa-queue "new application" staff alert
   * (VISA_FACILITATOR). Deliberately mirrors listStaff/listClients'
   * `role` (User.role), not a Membership union -- a facilitator holding
   * the role only as a secondary Membership is a real gap this doesn't
   * cover, same scope limitation those two existing directory queries
   * already accept. */
  async findUsersByRole(organizationId: string, role: Role): Promise<PublicUser[]> {
    const users = await withOrg(organizationId, (tx) =>
      tx.user.findMany({ where: { organizationId, role, deletedAt: null }, orderBy: { email: 'asc' } }),
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

  /** DR-026: soft-delete ("Deactivate") -- see the deletedAt read-side checks
   * above and in authService.resolveSession, which already treat this as
   * "gone". Reversible (DR-141: reactivateUser clears deletedAt again) --
   * deletedPermanently stays at its default false, distinguishing this from
   * permanentlyDeleteUser below. Also backs authService.deleteClient
   * (DR-036/085), which reuses this same method for a bare-tourist client
   * record. */
  async softDeleteUser(userId: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
  },

  /** DR-141: "Delete" -- unlike softDeleteUser above, this can never be
   * undone (authService.reactivateUser refuses once deletedPermanently is
   * true). SUPERADMIN-only, gated one layer up in the service. */
  async permanentlyDeleteUser(userId: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date(), deletedPermanently: true } });
  },

  /** DR-084: scheduled-sweep entry point -- staff roles only (TOURIST
   * accounts are anonymous-session-based, "hasn't logged in" doesn't
   * apply) and excludes SUPERADMIN (the one hardcoded, permanently-
   * uneditable role -- locking out the only superadmin would strand the
   * whole platform with no one left able to reactivate them). `users` has
   * no RLS (unlike tenant tables, see CLAUDE.md's own gotcha on this), so
   * this is a single global updateMany, no per-org loop needed like
   * fleetRepository.sweepInactivityAllOrganizations. Never touches an
   * already-dormant (inactiveAt set) or already-deactivated (deletedAt
   * set) row -- idempotent to re-run. */
  async markDormantUsers(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - DORMANCY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
    const result = await prisma.user.updateMany({
      where: {
        deletedAt: null,
        inactiveAt: null,
        role: { notIn: ['TOURIST', 'SUPERADMIN'] },
        OR: [{ lastLoginAt: { lt: cutoff } }, { lastLoginAt: null, createdAt: { lt: cutoff } }],
      },
      data: { inactiveAt: now },
    });
    return result.count;
  },

  /** DR-084/DR-141: clears BOTH a dormancy lock (inactiveAt, the automatic
   * 30-day sweep) and a manual Deactivate (deletedAt) in one call -- from
   * the caller's perspective both mean "make this account active again",
   * and clearing whichever one happens to be set is simpler than two
   * separate repository methods for what's the same user-facing action.
   * The service layer refuses to call this at all once deletedPermanently
   * is true, so a genuinely deleted user's deletedAt is never cleared here. */
  async reactivateUser(userId: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { inactiveAt: null, deletedAt: null } });
  },

  /** DR-026: clears the forced-password-change flag after a successful
   * self-service change (better-auth's changePassword API). */
  async clearMustChangePassword(userId: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { mustChangePassword: false } });
  },

};
