'use server';

import { redirect } from 'next/navigation';
import { requireAnyStaffSession } from '@lib/staff-guard';
import { authService } from '@modules/auth';

// The actual password change itself happens client-side (authClient
// .changePassword, same convention as /staff/login's authClient.signIn.email)
// since better-auth's own current-password verification + hashing already
// runs there against the live session cookie -- this action only clears the
// server-side mustChangePassword flag (not a registered better-auth
// additionalField, so it can't be set via the client SDK) once that's done,
// then redirects into the dashboard.
export async function clearMustChangePasswordAction(): Promise<void> {
  const ctx = await requireAnyStaffSession();
  await authService.clearMustChangePassword(ctx.userId);
  redirect('/staff/bookings');
}
