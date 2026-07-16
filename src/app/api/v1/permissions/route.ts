import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { SetRolePermissionInput, authService } from '@modules/auth';
import type { Permission } from '@lib/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Route-level gate is admin.all (same broad "some kind of admin" category
// every other /users* route uses) -- the real, narrower SUPERADMIN-only
// enforcement lives one layer down in authService.getPermissionMatrix/
// setRolePermission (DR-035), same "RBAC decides broad category, service
// does the narrower role-identity check" layering as country_regulation.write.
export const GET = withAuth('admin.all', async (ctx) => {
  const matrix = await authService.getPermissionMatrix(ctx);
  return NextResponse.json({ matrix });
});

export const PATCH = withAuth('admin.all', async (ctx, req: NextRequest) => {
  const input = SetRolePermissionInput.parse(await req.json());
  // permission is intentionally not enum-validated by SetRolePermissionInput
  // (see its own comment) -- cast here rather than widen the service's
  // signature away from the real Permission type for its other callers.
  await authService.setRolePermission(ctx, input.role, input.permission as Permission, input.granted);
  const matrix = await authService.getPermissionMatrix(ctx);
  return NextResponse.json({ matrix });
});
