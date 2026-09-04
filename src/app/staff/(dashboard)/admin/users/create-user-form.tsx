'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Role } from '@prisma/client';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createUserAction, type CreateUserState } from './actions';
import { RoleCheckboxGroup } from './role-checkbox-group';

const INITIAL_STATE: CreateUserState = {};

export function CreateUserForm({ assignableRoles }: { assignableRoles: readonly Role[] }) {
  const [state, formAction] = useActionState(createUserAction, INITIAL_STATE);
  const [rolesValid, setRolesValid] = useState(true);
  const t = useTranslations('StaffCreateUserForm');

  return (
    <div className="max-w-md space-y-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && (
        <Alert tone="success">
          <span className="block">{t('createdNotice', { email: state.success.email })}</span>
          <span className="mt-2 block rounded-survey bg-navy px-3 py-2 font-mono text-bone">
            {state.success.temporaryPassword}
          </span>
          <span className="mt-2 block text-xs">{t('relayNotice')}</span>
        </Alert>
      )}
      <form action={formAction} className="space-y-4">
        <FormField label={t('name')} htmlFor="name">
          {/* autocomplete="off" -- this enters a new account's details, not
              the signed-in staff member's own profile, so the browser
              shouldn't offer to fill in their saved name/email/phone here. */}
          <input name="name" required autoComplete="off" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('email')} htmlFor="email">
          <input name="email" type="email" required autoComplete="off" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('phone')} htmlFor="phone" optional>
          <input name="phone" placeholder="+264812345678" autoComplete="off" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <div>
          <p className="mb-1 text-sm text-mist">{t('rolesLabel')}</p>
          <RoleCheckboxGroup assignableRoles={assignableRoles} onValidityChange={setRolesValid} />
        </div>
        <SubmitButton disabled={!rolesValid}>{t('createUser')}</SubmitButton>
      </form>
    </div>
  );
}
