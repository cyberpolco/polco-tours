'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resetPasswordAction, type ResetPasswordState } from './actions';

const INITIAL_STATE: ResetPasswordState = {};

export function ResetPasswordPanel({ userId }: { userId: string }) {
  const [state, formAction] = useActionState(resetPasswordAction.bind(null, userId), INITIAL_STATE);

  return (
    <div className="space-y-4 border-t border-rule pt-6">
      <h2 className="text-lg font-semibold text-navy">Reset password</h2>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && (
        <Alert tone="success">
          <span className="block">New one-time temporary password (shown once, won&apos;t be shown again):</span>
          <span className="mt-2 block rounded-survey bg-navy px-3 py-2 font-mono text-bone">
            {state.success.temporaryPassword}
          </span>
          <span className="mt-2 block text-xs">
            Relay this to them out of band. They&apos;ll be forced to change it at next sign-in.
          </span>
        </Alert>
      )}
      <form action={formAction}>
        <SubmitButton variant="secondary" pendingLabel="Resetting…">
          Generate new password
        </SubmitButton>
      </form>
    </div>
  );
}
