// auth module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import { can, type Permission } from '@lib/rbac';
import { auth } from '@lib/auth';
import { Errors } from '@lib/errors';
import { authRepository } from './repository';
import type { AuthContext, PublicUser } from './domain';

export const authService = {
  async getUser(id: string): Promise<PublicUser | null> {
    return authRepository.findUserById(id);
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
    };
  },
};

export type { AuthContext };
