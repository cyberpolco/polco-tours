import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '@prisma/client';

/**
 * Trusted signal for databaseHooks.user.create.before (src/lib/auth.ts),
 * set only by code that has already passed its own permission check
 * (authService.createUser's assertCan(ctx, 'admin.all'), or
 * scripts/create-staff-user.ts's operator-run CLI). This module grants no
 * permission itself -- it only carries values across the hook boundary.
 * Node's AsyncLocalStorage isolates this per-async-context: concurrent,
 * unrelated requests never see each other's signal.
 */
export interface TrustedUserCreateSignal {
  role: Role;
  organizationId: string;
  mustChangePassword: boolean;
  phone: string | null;
}

const storage = new AsyncLocalStorage<TrustedUserCreateSignal>();

/** Runs `work` with `signal` visible to getTrustedUserCreateSignal() for
 * the duration of `work` (including everything it awaits) and nothing else. */
export function withTrustedUserCreate<T>(signal: TrustedUserCreateSignal, work: () => Promise<T>): Promise<T> {
  return storage.run(signal, work);
}

/** undefined for every public/guest signup and any unrelated request --
 * truthy only inside a withTrustedUserCreate(...) callback. */
export function getTrustedUserCreateSignal(): TrustedUserCreateSignal | undefined {
  return storage.getStore();
}
