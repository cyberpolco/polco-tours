'use client';

import { useActionState } from 'react';
import type { Role } from '@prisma/client';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createUserAction, type CreateUserState } from './actions';

const INITIAL_STATE: CreateUserState = {};

export function CreateUserForm({ assignableRoles }: { assignableRoles: readonly Role[] }) {
  const [state, formAction] = useActionState(createUserAction, INITIAL_STATE);

  return (
    <div className="max-w-md space-y-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && (
        <Alert tone="success">
          <span className="block">
            Created <strong>{state.success.email}</strong>. One-time temporary password (shown once, won&apos;t be
            shown again):
          </span>
          <span className="mt-2 block rounded-survey bg-navy px-3 py-2 font-mono text-bone">
            {state.success.temporaryPassword}
          </span>
          <span className="mt-2 block text-xs">
            Relay this to them out of band. They&apos;ll be forced to change it at first sign-in.
          </span>
        </Alert>
      )}
      <form action={formAction} className="space-y-4">
        <FormField label="Name" htmlFor="name">
          <input name="name" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Email" htmlFor="email">
          <input name="email" type="email" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Phone" htmlFor="phone" optional>
          <input name="phone" placeholder="+264812345678" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <div>
          <p className="mb-1 text-sm text-mist">Roles (select one or more)</p>
          <div className="grid grid-cols-2 gap-2">
            {assignableRoles.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={`role_${r}`} />
                {r}
              </label>
            ))}
          </div>
        </div>
        <SubmitButton>Create user</SubmitButton>
      </form>
    </div>
  );
}
