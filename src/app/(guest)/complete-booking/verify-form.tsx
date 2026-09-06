'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { verifyBookingAction, VERIFY_INITIAL_STATE } from './actions';

// Three factors, not the two /find-booking asks for: this unlocks writes
// (accepting a price, adding travellers), so it follows the tighter
// cancel-via-lookup precedent and also requires the email on file.
export function VerifyForm({ defaultReference }: { defaultReference: string }) {
  const t = useTranslations('CompleteBooking');
  const [state, formAction] = useActionState(verifyBookingAction, VERIFY_INITIAL_STATE);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {state.status === 'error' && state.error && <Alert tone="error">{t('verifyFailed')}</Alert>}

      <FormField label={t('bookingReference')} htmlFor="bookingReference">
        <input
          id="bookingReference"
          name="bookingReference"
          required
          defaultValue={defaultReference}
          className="w-full rounded-survey border border-rule px-3 py-2 uppercase"
        />
      </FormField>
      <FormField label={t('lastName')} htmlFor="lastName">
        <input id="lastName" name="lastName" required className="w-full rounded-survey border border-rule px-3 py-2" />
      </FormField>
      <FormField label={t('email')} htmlFor="email">
        <input id="email" name="email" type="email" required className="w-full rounded-survey border border-rule px-3 py-2" />
      </FormField>

      <SubmitButton pendingLabel={t('checking')}>{t('continue')}</SubmitButton>
    </form>
  );
}
