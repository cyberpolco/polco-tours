'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resetPasswordAction, type ResetPasswordState } from './actions';

const INITIAL_STATE: ResetPasswordState = {};

export function ResetPasswordPanel({ userId }: { userId: string }) {
  const [state, formAction] = useActionState(resetPasswordAction.bind(null, userId), INITIAL_STATE);
  const t = useTranslations('StaffEditUser');

  return (
    <div className="space-y-4 border-t border-rule pt-6">
      <h2 className="text-lg font-semibold text-navy">{t('resetPassword')}</h2>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && (
        <Alert tone="success">
          <span className="block">{t('newTempPasswordNotice')}</span>
          <span className="mt-2 block rounded-survey bg-navy px-3 py-2 font-mono text-bone">
            {state.success.temporaryPassword}
          </span>
          <span className="mt-2 block text-xs">{t('relayNotice')}</span>
        </Alert>
      )}
      <form action={formAction}>
        <SubmitButton variant="secondary" pendingLabel={t('resetting')}>
          {t('generateNewPassword')}
        </SubmitButton>
      </form>
    </div>
  );
}
