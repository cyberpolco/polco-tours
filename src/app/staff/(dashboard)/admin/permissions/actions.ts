'use server';

import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import type { Permission, RoleName } from '@lib/rbac';
import { authService } from '@modules/auth';

// SUPERADMIN-only enforcement lives in authService.setRolePermission itself
// (requireStaffContext('admin.all') here is just the broad route-level
// gate, same layering as every other admin.all-gated action in this app).
export async function toggleRolePermissionAction(role: RoleName, permission: Permission, granted: boolean): Promise<void> {
  const ctx = await requireStaffContext('admin.all');
  await authService.setRolePermission(ctx, role, permission, granted);
  revalidatePath('/staff/admin/permissions');
}
