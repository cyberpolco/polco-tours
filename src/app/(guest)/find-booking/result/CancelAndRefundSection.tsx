'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { requestCancellationAction, type CancellationActionState } from './actions';

const INITIAL_STATE: CancellationActionState = { status: 'idle' };

interface Props {
  bookingReference: string;
  lastName: string;
  locale: 'en' | 'fr';
  tierLabel: string;
  previewAmountLabel: string | null;
}

/** DR-207: heavily-regulated guest self-service cancel/refund, reached from
 * the bottom of the find-booking result page (only when the booking is
 * still cancellable). Three deliberate steps, never a single click: (1)
 * the tier disclosure is shown up front, unconditionally; (2) "Cancel this
 * booking" reveals a form requiring email + a written reason, re-verified
 * server-side against the tour lead's own on-file email (not just accepted
 * as typed -- see bookingService.cancelForBookingLookup); (3) the submit
 * button itself stays disabled until the "I understand" checkbox is
 * ticked. Success replaces the whole section with a confirmation + a
 * one-time PDF download (data URI -- see actions.ts's own comment on why
 * there's no separate download route for this). */
export function CancelAndRefundSection({ bookingReference, lastName, locale, tierLabel, previewAmountLabel }: Props) {
  const t = useTranslations('CancelAndRefundSection');
  const [revealed, setRevealed] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const boundAction = requestCancellationAction.bind(null, bookingReference, lastName, locale);
  const [state, formAction] = useActionState(boundAction, INITIAL_STATE);

  if (state.status === 'success') {
    return (
      <Card className="mt-2 space-y-3">
        <Alert tone="success">{t('successMessage')}</Alert>
        {previewAmountLabel && (
          <p className="text-sm text-mist">
            {t('refundAmountLabel')}: <span className="font-semibold text-navy">{previewAmountLabel}</span>
          </p>
        )}
        {state.pdfBase64 && (
          <a
            href={`data:application/pdf;base64,${state.pdfBase64}`}
            download={`refund-note-${bookingReference}.pdf`}
            className="inline-block font-semibold text-amber underline"
          >
            {t('downloadRefundNote')}
          </a>
        )}
      </Card>
    );
  }

  return (
    <Card className="mt-2 space-y-3">
      <p className="text-sm text-mist">{t('policyIntro')}</p>
      <p className="text-sm">
        {t('currentTierLead')} <span className="font-semibold text-navy">{tierLabel}</span>
        {previewAmountLabel && <> — {previewAmountLabel}</>}
      </p>

      {!revealed ? (
        <Button variant="secondary" onClick={() => setRevealed(true)}>
          {t('startCancellation')}
        </Button>
      ) : (
        <form action={formAction} className="space-y-4">
          {state.error && <Alert tone="error">{t(`error.${state.error}`)}</Alert>}
          <FormField label={t('emailLabel')} htmlFor="cancel-email">
            <input
              id="cancel-email"
              name="email"
              type="email"
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <FormField label={t('reasonLabel')} htmlFor="cancel-reason">
            <textarea
              id="cancel-reason"
              name="reason"
              required
              rows={3}
              maxLength={1000}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <label className="flex items-start gap-2 text-sm text-mist">
            <input
              type="checkbox"
              name="confirm"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-1"
            />
            {t('understandCheckbox')}
          </label>
          <SubmitButton variant="secondary" disabled={!understood} pendingLabel={t('cancelling')}>
            {t('confirmCancellation')}
          </SubmitButton>
        </form>
      )}
    </Card>
  );
}
