import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdateUserInput, authService } from '@modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  userId: string;
}

// Admin-only (admin.all, DR-026/DR-035) -- edits an existing user's profile
// fields and/or role set. Blocks self-edit (see authService.updateUser).
export const PATCH = withAuth<Params>('admin.all', async (ctx, req: NextRequest, { userId }) => {
  const input = UpdateUserInput.parse(await req.json());
  const user = await authService.updateUser(ctx, userId, input);
  return NextResponse.json({ user });
});

// Admin-only (admin.all) -- soft-deletes (deactivates) a user (DR-026).
// DELETE is the right verb for the caller's intent even though the
// implementation is a soft update (deletedAt), not a row removal. Blocks
// deactivating your own account (see authService.deactivateUser).
export const DELETE = withAuth<Params>('admin.all', async (ctx, _req, { userId }) => {
  await authService.deactivateUser(ctx, userId);
  return new NextResponse(null, { status: 204 });
});
