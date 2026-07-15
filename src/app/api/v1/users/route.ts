import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateUserInput, authService } from '@modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Admin-only (SUPERADMIN/PLATFORM_ADMIN via '*') -- powers the general
// user-management page (DR-026), replacing CLI-only staff account creation.
export const GET = withAuth('admin.all', async (ctx) => {
  const users = await authService.listUsers(ctx);
  return NextResponse.json({ users });
});

// Creates a staff account with one or more simultaneous roles and a
// generated one-time password, returned exactly once in this response.
export const POST = withAuth('admin.all', async (ctx, req: NextRequest) => {
  const input = CreateUserInput.parse(await req.json());
  const { user, temporaryPassword } = await authService.createUser(ctx, input);
  return NextResponse.json({ user, temporaryPassword }, { status: 201 });
});
