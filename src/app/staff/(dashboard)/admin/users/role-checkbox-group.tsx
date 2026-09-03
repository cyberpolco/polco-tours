'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Role } from '@prisma/client';
import { findIncompatibleRolePair } from '@modules/auth';
import { Alert } from '@/components/ui/Alert';

// DR-221: mirrors domain.ts's findIncompatibleRolePair client-side so an
// incompatible pick is flagged the moment it's checked, instead of only
// after a round trip to the server -- UX only, per charter rule 1.
// CreateUserInput/UpdateUserInput's own superRefine is the real gate.
export function RoleCheckboxGroup({
  assignableRoles,
  defaultSelected = [],
  onValidityChange,
}: {
  assignableRoles: readonly Role[];
  defaultSelected?: readonly Role[];
  onValidityChange?: (isValid: boolean) => void;
}) {
  const t = useTranslations('StaffRoleCheckboxGroup');
  const [selected, setSelected] = useState<Role[]>([...defaultSelected]);
  const conflict = findIncompatibleRolePair(selected);

  useEffect(() => {
    onValidityChange?.(conflict === null);
    // conflict is a derived array literal each render -- key off its
    // contents, not identity, so this doesn't fire every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflict?.[0], conflict?.[1]]);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {assignableRoles.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={`role_${r}`}
              defaultChecked={defaultSelected.includes(r)}
              onChange={(e) =>
                setSelected((prev) => (e.target.checked ? [...prev, r] : prev.filter((role) => role !== r)))
              }
            />
            {r}
          </label>
        ))}
      </div>
      {conflict && (
        <div className="mt-2">
          <Alert tone="error">{t('incompatible', { roleA: conflict[0], roleB: conflict[1] })}</Alert>
        </div>
      )}
    </div>
  );
}
