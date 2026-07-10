// auth module — domain types & rules. Pure; no framework or DB imports.
// Reference implementation of the Vol. 5 §5.2 module shape:
//   domain (types/rules) · service (logic) · repository (Prisma) · index (public API)
import type { Locale, Role } from '@prisma/client';
import { z } from 'zod';

export interface AuthContext {
  userId: string;
  role: Role;
  organizationId: string | null;
  sessionId: string;
  // ISO-3166 alpha-2; IMMIGRATION_OFFICER only (BR-10 country-scoping, DR-019).
  assignedCountry: string | null;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  organizationId: string | null;
  emailVerified: boolean;
  phone: string | null;
  preferredLocale: Locale;
  assignedCountry: string | null;
}

// E.164: optional leading +, 1-15 digits, first digit non-zero.
const E164 = /^\+?[1-9]\d{6,14}$/;

export const UpdateProfileInput = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().regex(E164).nullable().optional(),
  preferredLocale: z.enum(['EN', 'FR']).optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

// Admin-only (assertCan('admin.all') in service.ts); assigns an
// IMMIGRATION_OFFICER's country scope (BR-10, DR-019).
export const AssignOfficerCountryInput = z.object({
  country: z.string().length(2),
});
export type AssignOfficerCountryInput = z.infer<typeof AssignOfficerCountryInput>;

/** A membership must exist before a user may act within an organization. */
export function isOrgMember(ctx: AuthContext, organizationId: string): boolean {
  return ctx.organizationId === organizationId;
}
