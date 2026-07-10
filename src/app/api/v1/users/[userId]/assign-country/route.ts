import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { AssignOfficerCountryInput, authService } from '@modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  userId: string;
}

// Admin-only (SUPERADMIN/PLATFORM_ADMIN via '*') -- assigns an
// IMMIGRATION_OFFICER's country scope (BR-10, DR-019). No staff UI: a
// single-superadmin, admin-only capability this increment.
export const PATCH = withAuth<Params>('admin.all', async (ctx, req: NextRequest, { userId }) => {
  const input = AssignOfficerCountryInput.parse(await req.json());
  const user = await authService.assignOfficerCountry(ctx, userId, input.country);
  return NextResponse.json({ user });
});
