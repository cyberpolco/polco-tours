import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { authService } from '@modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  userId: string;
}

// Admin-only (SUPERADMIN/PLATFORM_ADMIN via '*') -- soft-deletes (deactivates)
// a user (DR-026). DELETE is the right verb for the caller's intent even
// though the implementation is a soft update (deletedAt), not a row removal.
// Blocks deactivating your own account (see authService.deactivateUser).
export const DELETE = withAuth<Params>('admin.all', async (ctx, _req, { userId }) => {
  await authService.deactivateUser(ctx, userId);
  return new NextResponse(null, { status: 204 });
});
