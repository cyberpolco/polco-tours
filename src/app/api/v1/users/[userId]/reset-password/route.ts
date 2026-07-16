import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { authService } from '@modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  userId: string;
}

// Admin-only (admin.all, DR-035) -- generates a fresh one-time password for
// an existing user, returned exactly once in this response (same
// reveal-once convention as POST /users' temporaryPassword). Closes the
// gap where a password reset previously required shell/DB access
// (scripts/set-staff-password.ts). Blocks self-reset.
export const POST = withAuth<Params>('admin.all', async (ctx, _req, { userId }) => {
  const { temporaryPassword } = await authService.resetPassword(ctx, userId);
  return NextResponse.json({ temporaryPassword });
});
