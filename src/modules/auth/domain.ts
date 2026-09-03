// auth module — domain types & rules. Pure; no framework or DB imports.
// Reference implementation of the Vol. 5 §5.2 module shape:
//   domain (types/rules) · service (logic) · repository (Prisma) · index (public API)
import type { Locale, Role } from '@prisma/client';
import { z } from 'zod';
import type { Permission } from '@lib/rbac';

export interface AuthContext {
  userId: string;
  // DR-026: the union of the user's Membership.role values (their org) plus
  // User.role, deduped -- always non-empty. A plain tourist/guest with no
  // Membership rows still gets a valid one-element array from User.role.
  roles: Role[];
  // DR-159: the union of every ROLE_PERMISSIONS grant (rbac.ts, a hardcoded
  // in-code map) across all held roles, resolved once by resolveSession --
  // satisfies rbac.ts's PermissionSource structurally (roles + permissions),
  // so `can(ctx, ...)`/`assertCan(ctx, ...)` work directly on this context.
  // SUPERADMIN never needs an entry here (see rbac.ts) -- its wildcard
  // bypasses this set entirely.
  permissions: ReadonlySet<Permission>;
  organizationId: string | null;
  sessionId: string;
  // DR-026: forces a redirect to /staff/change-password (staff-guard.ts)
  // until cleared -- set true only for admin-created accounts with a
  // generated temporary password, never for self-signup or the bootstrap
  // superadmin (who chose their own password).
  mustChangePassword: boolean;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  role: Role; // primary role (User.role) -- kept for existing single-role consumers
  roles: Role[]; // DR-026: full held role set (Membership rows, falling back to [role])
  organizationId: string | null;
  emailVerified: boolean;
  phone: string | null;
  preferredLocale: Locale;
  deletedAt: Date | null; // DR-026: null = active, set = deactivated or deleted (see deletedPermanently)
  // DR-141: distinguishes a reversible manual Deactivate (false) from a
  // permanent, SUPERADMIN-only Delete (true) -- only meaningful when
  // deletedAt is set; reactivateUser refuses once this is true.
  deletedPermanently: boolean;
  mustChangePassword: boolean; // DR-026
  lastLoginAt: Date | null; // set via databaseHooks.session.create.after in lib/auth.ts
  inactiveAt: Date | null; // DR-084: null = active, set = dormant (sign-in blocked until reactivated)
}

/** DR-155: an aggregate-only projection for the Insights dashboard's Staff
 * stats section -- deliberately no individual email/phone/name, unlike
 * PublicUser, since staff_roster.read is a narrower permission than
 * admin.all (see rbac.ts's own comment on why). */
export interface StaffRosterSummary {
  byRole: Partial<Record<Role, number>>;
  activeCount: number;
  deactivatedCount: number; // deletedAt set, deletedPermanently false
  inactiveCount: number; // DR-084 dormancy: inactiveAt set, deletedAt null
}

/** Pure aggregation -- takes just the roster (not raw Prisma rows) so this
 * stays testable with plain fixture objects. A multi-role user is counted
 * once per role they hold in byRole (so "5 DRIVER" + "3 TOUR_GUIDE" can
 * overlap the same people), but exactly once in the active/deactivated/
 * inactive headcount. */
export function computeStaffRosterSummary(
  users: Array<Pick<PublicUser, 'roles' | 'deletedAt' | 'inactiveAt'>>,
): StaffRosterSummary {
  const byRole: Partial<Record<Role, number>> = {};
  let activeCount = 0;
  let deactivatedCount = 0;
  let inactiveCount = 0;
  for (const u of users) {
    for (const role of u.roles) {
      byRole[role] = (byRole[role] ?? 0) + 1;
    }
    if (u.deletedAt) deactivatedCount++;
    else if (u.inactiveAt) inactiveCount++;
    else activeCount++;
  }
  return { byRole, activeCount, deactivatedCount, inactiveCount };
}

// E.164: optional leading +, 1-15 digits, first digit non-zero.
const E164 = /^\+?[1-9]\d{6,14}$/;

export const UpdateProfileInput = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().regex(E164).nullable().optional(),
  preferredLocale: z.enum(['EN', 'FR']).optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

// TOURIST is deliberately excluded -- tourists only ever come from guest
// checkout (DR-016), never an admin-created account (DR-026). Exported so
// the admin user-management UI's role checklist doesn't duplicate this list.
export const ASSIGNABLE_ROLES = [
  'SUPERADMIN',
  'PLATFORM_ADMIN',
  'TOUR_OPERATOR',
  'TOUR_GUIDE',
  'DRIVER',
  'VEHICLE_OWNER',
  'VISA_FACILITATOR',
] as const;

// DR-221: which of the ASSIGNABLE_ROLES may be held simultaneously by one
// account -- explicitly reviewed and confirmed pair-by-pair (all 21
// combinations), not inferred. Symmetric by construction (if A lists B, B
// lists A) -- see DECISION_LOG DR-221 for the full reviewed matrix.
// SUPERADMIN and PLATFORM_ADMIN are each near-exclusive (one carve-out
// apiece); TOUR_OPERATOR is the one role compatible with everything except
// SUPERADMIN; the three field roles (TOUR_GUIDE/DRIVER/VEHICLE_OWNER) form
// a clique among themselves plus TOUR_OPERATOR; VISA_FACILITATOR only pairs
// with SUPERADMIN/TOUR_OPERATOR.
const ROLE_COMPATIBILITY: Record<(typeof ASSIGNABLE_ROLES)[number], ReadonlySet<Role>> = {
  SUPERADMIN: new Set(['VISA_FACILITATOR']),
  PLATFORM_ADMIN: new Set(['TOUR_OPERATOR']),
  TOUR_OPERATOR: new Set(['PLATFORM_ADMIN', 'TOUR_GUIDE', 'DRIVER', 'VEHICLE_OWNER', 'VISA_FACILITATOR']),
  TOUR_GUIDE: new Set(['TOUR_OPERATOR', 'DRIVER', 'VEHICLE_OWNER']),
  DRIVER: new Set(['TOUR_OPERATOR', 'TOUR_GUIDE', 'VEHICLE_OWNER']),
  VEHICLE_OWNER: new Set(['TOUR_OPERATOR', 'TOUR_GUIDE', 'DRIVER']),
  VISA_FACILITATOR: new Set(['SUPERADMIN', 'TOUR_OPERATOR']),
};

/** Returns the first mutually-incompatible pair found in `roles` (DR-221),
 * or null if every pair held is allowed. A single role is always valid. */
export function findIncompatibleRolePair(roles: Role[]): [Role, Role] | null {
  for (const [i, a] of roles.entries()) {
    for (const b of roles.slice(i + 1)) {
      if (a === b) continue;
      const allowed = ROLE_COMPATIBILITY[a as keyof typeof ROLE_COMPATIBILITY];
      if (!allowed?.has(b)) return [a, b];
    }
  }
  return null;
}

function refineRoleCompatibility(roles: Role[], ctx: z.RefinementCtx): void {
  const conflict = findIncompatibleRolePair(roles);
  if (conflict) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['roles'],
      message: `${conflict[0]} cannot be combined with ${conflict[1]}`,
    });
  }
}

// Admin-only (assertCan('admin.all') in service.ts); creates a staff account
// with one or more simultaneous roles and a generated temporary password
// (DR-026).
export const CreateUserInput = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().regex(E164).nullable().optional(),
  roles: z.array(z.enum(ASSIGNABLE_ROLES)).min(1),
}).superRefine((input, ctx) => refineRoleCompatibility(input.roles, ctx));
export type CreateUserInput = z.infer<typeof CreateUserInput>;

// User Management (DR-035): edit an existing user's own profile fields
// and/or role set (distinct from the permission-matrix editor, which edits
// what a ROLE grants, not which roles a specific user holds). `roles`, when
// provided, REPLACES the user's full held set (matching CreateUserInput's
// "at least one" shape) -- not a partial add/remove list, since a partial
// diff API would need its own add/remove verbs for no real benefit at this
// scale (staff headcount, not thousands of users).
export const UpdateUserInput = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().regex(E164).nullable().optional(),
  roles: z.array(z.enum(ASSIGNABLE_ROLES)).min(1).optional(),
}).superRefine((input, ctx) => {
  if (input.roles) refineRoleCompatibility(input.roles, ctx);
});
export type UpdateUserInput = z.infer<typeof UpdateUserInput>;

/** A membership must exist before a user may act within an organization. */
export function isOrgMember(ctx: AuthContext, organizationId: string): boolean {
  return ctx.organizationId === organizationId;
}

/** SUPERADMIN-only actions (e.g. the removed permission-matrix editor,
 * DR-159, and every other SUPERADMIN-only gate across this app) -- direct
 * role-identity check, not a Permission literal gate, mirroring
 * immigration/domain.ts's isCountryRegulationWriter. */
export function isSuperAdmin(roles: Role[]): boolean {
  return roles.includes('SUPERADMIN');
}

/** The "Clients" directory (bare-tourist contact records, DR-036) is
 * SUPERADMIN/TOUR_OPERATOR/PLATFORM_ADMIN-only (PLATFORM_ADMIN added
 * DR-159) -- explicit user choice, since those are exactly the roles that
 * create/interact with these records. Direct role-identity check, not a
 * Permission literal, same layering as isSuperAdmin above. */
export function isClientDirectoryViewer(roles: Role[]): boolean {
  return roles.includes('SUPERADMIN') || roles.includes('TOUR_OPERATOR') || roles.includes('PLATFORM_ADMIN');
}

// DR-084: user dormancy after 30 days without signing in (staff roles
// only -- see authRepository.markDormantUsers for the TOURIST/SUPERADMIN
// exclusions, which live at the query level since they're about *which*
// users the sweep considers, not this pure threshold check itself).
export const DORMANCY_THRESHOLD_DAYS = 30;

/** `referenceDate` is lastLoginAt if the account has ever signed in, else
 * createdAt -- an account created but never once logged into is exactly as
 * dormant as one that logged in 30+ days ago and never came back. */
export function isDormant(referenceDate: Date, now: Date): boolean {
  const daysSinceActive = (now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceActive > DORMANCY_THRESHOLD_DAYS;
}
