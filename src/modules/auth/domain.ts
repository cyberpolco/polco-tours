// auth module — domain types & rules. Pure; no framework or DB imports.
// Reference implementation of the Vol. 5 §5.2 module shape:
//   domain (types/rules) · service (logic) · repository (Prisma) · index (public API)
import type { Locale, Role } from '@prisma/client';
import { z } from 'zod';
import { EDITABLE_ROLES, type Permission } from '@lib/rbac';

export interface AuthContext {
  userId: string;
  // DR-026: the union of the user's Membership.role values (their org) plus
  // User.role, deduped -- always non-empty. A plain tourist/guest with no
  // Membership rows still gets a valid one-element array from User.role.
  roles: Role[];
  // DR-035: the union of every DB-backed RolePermission grant across all
  // held roles, resolved once by resolveSession -- satisfies rbac.ts's
  // PermissionSource structurally (roles + permissions), so `can(ctx, ...)`/
  // `assertCan(ctx, ...)` work directly on this context. SUPERADMIN never
  // needs an entry here (see rbac.ts) -- its wildcard bypasses this set
  // entirely.
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
  deletedAt: Date | null; // DR-026: null = active, set = soft-deleted/deactivated
  mustChangePassword: boolean; // DR-026
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

// Admin-only (assertCan('admin.all') in service.ts); creates a staff account
// with one or more simultaneous roles and a generated temporary password
// (DR-026).
export const CreateUserInput = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().regex(E164).nullable().optional(),
  roles: z.array(z.enum(ASSIGNABLE_ROLES)).min(1),
});
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
});
export type UpdateUserInput = z.infer<typeof UpdateUserInput>;

/** A membership must exist before a user may act within an organization. */
export function isOrgMember(ctx: AuthContext, organizationId: string): boolean {
  return ctx.organizationId === organizationId;
}

/** User Management / permission-matrix editor (DR-035): only SUPERADMIN may
 * view or edit the RolePermission table -- the spec's literal "Super Admin
 * can: ... Manage permissions" (not Platform Admin, not Tour Operator).
 * Direct role-identity check, not a Permission literal gate, mirroring
 * immigration/domain.ts's isCountryRegulationWriter -- there is no scenario
 * where a non-SUPERADMIN role should even see this page, unlike country
 * regulations' broader read audience. */
export function isSuperAdmin(roles: Role[]): boolean {
  return roles.includes('SUPERADMIN');
}

// Permission-matrix editor (DR-035). `role` reuses rbac.ts's EDITABLE_ROLES
// (SUPERADMIN excluded -- it's a fixed wildcard, never a DB row) instead of
// duplicating the role list. `permission` isn't validated against the full
// Permission union here (would mean listing every literal a third time) --
// an unrecognized string just creates a harmless, never-checked row; this
// is a SUPERADMIN-only internal tool, not user-facing at scale.
export const SetRolePermissionInput = z.object({
  role: z.enum(EDITABLE_ROLES),
  permission: z.string().min(1),
  granted: z.boolean(),
});
export type SetRolePermissionInput = z.infer<typeof SetRolePermissionInput>;
