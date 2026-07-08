// auth module — domain types & rules. Pure; no framework or DB imports.
// Reference implementation of the Vol. 5 §5.2 module shape:
//   domain (types/rules) · service (logic) · repository (Prisma) · index (public API)
import type { Role } from '@prisma/client';

export interface AuthContext {
  userId: string;
  role: Role;
  organizationId: string | null;
  sessionId: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  organizationId: string | null;
  emailVerified: boolean;
}

/** A membership must exist before a user may act within an organization. */
export function isOrgMember(ctx: AuthContext, organizationId: string): boolean {
  return ctx.organizationId === organizationId;
}
