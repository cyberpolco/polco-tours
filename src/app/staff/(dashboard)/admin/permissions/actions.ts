'use server';

import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import type { Permission, RoleName } from '@lib/rbac';
import { authService } from '@modules/auth';

export interface RolePermissionChange {
  role: RoleName;
  permission: Permission;
  granted: boolean;
}

// SUPERADMIN-only enforcement lives in authService.setRolePermission itself
// (requireStaffContext('admin.all') here is just the broad route-level
// gate, same layering as every other admin.all-gated action in this app).
// Batched behind an explicit "Save" button in the UI rather than
// auto-submitting per checkbox -- each change still resolves through the
// same single-(role,permission) service call and gets its own audit row as
// before; only the commit point moved from onChange to a deliberate click.
export async function saveRolePermissionChangesAction(changes: RolePermissionChange[]): Promise<void> {
  if (changes.length === 0) return;
  const ctx = await requireStaffContext('admin.all');
  for (const { role, permission, granted } of changes) {
    await authService.setRolePermission(ctx, role, permission, granted);
  }
  revalidatePath('/staff/admin/permissions');
}
