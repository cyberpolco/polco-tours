import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { UpdateProfileInput, authService } from '@modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The first "no target id" route -- ctx.userId is always the subject, so
// there's no ownership param to spoof (DR-013).
export const PATCH = withAuth('profile.write', async (ctx, req: NextRequest) => {
  const input = UpdateProfileInput.parse(await req.json());
  const user = await authService.updateProfile(ctx, input);
  return NextResponse.json({ user });
});
