'use client';

import { useMemo, useState, useTransition } from 'react';
import type { Permission, RoleName } from '@lib/rbac';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { saveRolePermissionChangesAction } from './actions';

type EditableRole = Exclude<RoleName, 'SUPERADMIN'>;
type Matrix = Record<EditableRole, Permission[]>;

function cellKey(role: string, permission: string): string {
  return `${role}:${permission}`;
}

function toCellMap(matrix: Matrix, roles: readonly EditableRole[], permissions: readonly Permission[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const role of roles) {
    for (const permission of permissions) {
      map[cellKey(role, permission)] = matrix[role].includes(permission);
    }
  }
  return map;
}

// Buffers every checkbox toggle in local state and only calls the server
// once "Save changes" is pressed (previously auto-submitted per checkbox,
// one request per click) -- lets an admin review a batch of role changes
// before committing them, and "Discard changes" cheaply reverts without a
// round trip. Each saved cell still resolves through the existing
// single-(role,permission) setRolePermission call and gets its own audit
// row; only the UI's commit point changed.
export function PermissionMatrixForm({
  matrix,
  roles,
  permissions,
}: {
  matrix: Matrix;
  roles: readonly EditableRole[];
  permissions: readonly Permission[];
}) {
  const savedCells = useMemo(() => toCellMap(matrix, roles, permissions), [matrix, roles, permissions]);
  const [cells, setCells] = useState(savedCells);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dirtyKeys = Object.keys(cells).filter((key) => cells[key] !== savedCells[key]);
  const dirtyCount = dirtyKeys.length;

  function toggle(role: EditableRole, permission: Permission) {
    const key = cellKey(role, permission);
    setCells((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSave() {
    setError(null);
    const changes = dirtyKeys.map((key) => {
      const separatorIndex = key.indexOf(':');
      const role = key.slice(0, separatorIndex) as RoleName;
      const permission = key.slice(separatorIndex + 1) as Permission;
      return { role, permission, granted: Boolean(cells[key]) };
    });
    startTransition(async () => {
      try {
        await saveRolePermissionChangesAction(changes);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save changes');
      }
    });
  }

  function handleDiscard() {
    setCells(savedCells);
    setError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || dirtyCount === 0}
          className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
        >
          {isPending ? 'Saving…' : dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}` : 'Save changes'}
        </button>
        {dirtyCount > 0 && !isPending && (
          <button type="button" onClick={handleDiscard} className="text-sm text-mist hover:text-ink">
            Discard changes
          </button>
        )}
        {error && <p className="text-sm text-amber">{error}</p>}
      </div>
      <div className="overflow-x-auto">
        {/* table-fixed + a percentage colgroup, not the shared component's
            default auto layout, so every role column gets the exact same
            share of the table's width regardless of how long its name is
            ("DRIVER" vs. "VISA_FACILITATOR") -- with auto layout each
            column only ever sizes to its own content. Percentages (rather
            than a fixed rem width per column) also mean the table actually
            stretches to fill however wide its container is -- this page
            wraps the whole thing in a full-bleed container specifically so
            there's real width for these percentages to expand into. */}
        <Table className="w-full table-fixed">
          <colgroup>
            <col className="w-[30%]" />
            {roles.map((role) => (
              <col key={role} className="w-[10%]" />
            ))}
          </colgroup>
          <thead>
            <TableHeaderRow>
              <Th>Permission</Th>
              {roles.map((role) => (
                <Th key={role} className="px-2 text-center text-sm leading-tight">
                  {role}
                </Th>
              ))}
            </TableHeaderRow>
          </thead>
          <tbody>
            {permissions.map((permission) => (
              <Tr key={permission}>
                <Td className="whitespace-nowrap font-mono text-xs">{permission}</Td>
                {roles.map((role) => (
                  <Td key={role}>
                    <div className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={cells[cellKey(role, permission)]}
                        disabled={isPending}
                        onChange={() => toggle(role, permission)}
                      />
                    </div>
                  </Td>
                ))}
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
