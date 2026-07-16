'use client';

import { useTransition } from 'react';
import type { Permission, RoleName } from '@lib/rbac';
import { toggleRolePermissionAction } from './actions';

// Auto-submits on toggle (no separate "Save" step) -- a permission-matrix
// edit is inherently a single atomic fact ("does role X hold permission Y"),
// not a multi-field form where batching changes makes sense.
export function PermissionCheckbox({
  role,
  permission,
  checked,
}: {
  role: RoleName;
  permission: Permission;
  checked: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      defaultChecked={checked}
      disabled={isPending}
      onChange={(event) => {
        const granted = event.target.checked;
        startTransition(async () => {
          await toggleRolePermissionAction(role, permission, granted);
        });
      }}
    />
  );
}
