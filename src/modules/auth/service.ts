// auth module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import { can, type Permission } from '@lib/rbac';
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
};

export type { AuthContext };
