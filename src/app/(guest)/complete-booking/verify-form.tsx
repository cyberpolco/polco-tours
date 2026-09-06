'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { verifyBookingAction, type VerifyState } from './actions';

// Three factors, not the two /find-booking asks for: this unlocks writes
// (accepting a price, adding travellers), so it follows the tighter
// cancel-via-lookup precedent and also requires the email on file.
// Defined here, not exported from ./actions -- a 'use server' file may only
// export async functions, and exporting a plain object from one makes Next
// throw `A "use server" file can only export async functions, found object.`
// at runtime. Neither typecheck nor lint catches it; it surfaces only when
// the form is actually submitted (it broke the guest contact form in
// production, caught by CI's Playwright job).
const VERIFY_INITIAL_STATE: VerifyState = { status: 'idle' };

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
