'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import type { Role } from '@prisma/client';
import type { PublicUser } from '@modules/auth';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { updateUserAction, type UpdateUserState } from './actions';

const INITIAL_STATE: UpdateUserState = {};

export function EditUserForm({
  userId,
  user,
  assignableRoles,
}: {
  userId: string;
  user: Pick<PublicUser, 'name' | 'email' | 'phone' | 'roles'>;
  assignableRoles: readonly Role[];
}) {
  const [state, formAction] = useActionState(updateUserAction.bind(null, userId), INITIAL_STATE);
  const t = useTranslations('StaffEditUser');

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-navy">{t('editUser')}</h2>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <form action={formAction} className="space-y-4">
        <FormField label={t('name')} htmlFor="name">
          <input name="name" defaultValue={user.name ?? ''} required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('email')} htmlFor="email">
          <input
            name="email"
            type="email"
            defaultValue={user.email}
            required
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label={t('phone')} htmlFor="phone" optional>
          <input
            name="phone"
            defaultValue={user.phone ?? ''}
            placeholder="+264812345678"
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <div>
          <p className="mb-1 text-sm text-mist">{t('rolesLabel')}</p>
          <div className="grid grid-cols-2 gap-2">
            {assignableRoles.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={`role_${r}`} defaultChecked={user.roles.includes(r)} />
                {r}
              </label>
            ))}
          </div>
        </div>
        <SubmitButton>{t('saveChanges')}</SubmitButton>
      </form>
    </div>
  );
}
