import { cache } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { authService, type AuthContext } from '@modules/auth';

/**
 * For Server Components/Actions under src/app/(guest)/booking/... -- the
 * requireStaffContext (staff-guard.ts) equivalent for the guest-checkout
 * wizard (DR-016). Unlike staff, there is no specific permission to check
 * here -- TOURIST already holds every grant the wizard steps need -- and no
 * login page to redirect to if no session exists (a guest session is minted
 * by /book/[departureId], the flow's own entry point, not by visiting a page
 * that requires one first).
 */
const getGuestSession = cache(async (): Promise<AuthContext | null> => {
  try {
    return await authService.resolveSession(await headers());
  } catch {
    return null;
  }
});

export async function requireGuestContext(): Promise<AuthContext> {
  const ctx = await getGuestSession();
  if (!ctx) redirect('/');
  return ctx;
}
