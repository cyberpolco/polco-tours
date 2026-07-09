import { cache } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { authService, type AuthContext } from '@modules/auth';
import { assertCan, type Permission } from './rbac';

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

export async function requireStaffContext(permission: Permission): Promise<AuthContext> {
  const ctx = await getStaffSession();
  if (!ctx) redirect('/staff/login');
  try {
    assertCan(ctx.role, permission);
  } catch {
    redirect('/staff/forbidden');
  }
  return ctx;
}
