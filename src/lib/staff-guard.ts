import { cache } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { authService, type AuthContext } from '@modules/auth';
import { assertCan, isStaffRole, type Permission } from './rbac';

/**
 * For Server Components/Actions under src/app/staff/(dashboard)/... -- the
 * withAuth (route-guard.ts) equivalent for pages instead of route handlers.
 * Session resolution is memoized per-request via React's cache() (no
 * arguments, so it dedupes correctly across a layout+page render pass);
 * the permission check stays OUTSIDE the cache and runs per call site with
 * its own permission, matching the double-check convention every
 * service.ts already follows. cache() does NOT dedupe across a separate
 * Server Action invocation -- each action re-resolves its own session once,
 * accepted overhead for an internal pilot tool.
 */
const getStaffSession = cache(async (): Promise<AuthContext | null> => {
  try {
    return await authService.resolveSession(await headers());
  } catch {
    return null;
  }
});

/**
 * Bare "is anyone signed in at all" check with NO permission gate and NO
 * mustChangePassword redirect -- the one escape hatch `/staff/change-
 * password` itself needs (DR-026), the same way `/staff/login`/
 * `/staff/forbidden` sit outside `(dashboard)`'s layout gate to avoid a
 * redirect loop. Don't use this anywhere else; requireStaffContext below is
 * the real gate every other staff page/action should call.
 */
export async function requireAnyStaffSession(): Promise<AuthContext> {
  const ctx = await getStaffSession();
  if (!ctx) redirect('/staff/login');
  return ctx;
}

/**
 * `permission` is optional: the `(dashboard)` layout calls this with none,
 * meaning "any staff-side role" (isStaffRole) -- every nested page still
 * passes its own specific permission, unchanged.
 */
export async function requireStaffContext(permission?: Permission): Promise<AuthContext> {
  const ctx = await requireAnyStaffSession();
  // DR-026: a forced password change wins over every other gate here --
  // redirect before the permission check even runs, so an admin-created
  // account with a generated temp password can't reach any real page
  // (including ones it does hold the permission for) until it's changed.
  if (ctx.mustChangePassword) redirect('/staff/change-password');
  if (permission) {
    try {
      assertCan(ctx, permission);
    } catch {
      redirect('/staff/forbidden');
    }
  } else if (!isStaffRole(ctx.roles)) {
    redirect('/staff/forbidden');
  }
  return ctx;
}
