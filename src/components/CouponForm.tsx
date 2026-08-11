'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';

export interface CouponActionState {
  error?: string;
}
const INITIAL_STATE: CouponActionState = {};

interface Props {
  appliedCode: string | null; // invoice.couponCode
  editable: boolean; // false once any payment on this invoice has SUCCEEDED
  onApply: (prevState: CouponActionState, formData: FormData) => Promise<CouponActionState>;
  onRemove: () => Promise<void>;
}

// DR-104: shared between the guest booking page and the staff booking-
// detail page -- the only difference between the two is which page's own
// actions.ts functions get bound in. A plain <form action> (not the
// onSubmit+router.push pattern AddonsForm/BookingForm use) is enough here:
// this form never navigates away, it only needs the current route's
// numbers to re-render, which revalidatePath inside the action already
// does natively.
export function CouponForm({ appliedCode, editable, onApply, onRemove }: Props) {
  const [state, formAction] = useActionState(onApply, INITIAL_STATE);
  const t = useTranslations('CouponForm');

  if (appliedCode) {
    return (
      <div className="mt-3 flex items-center gap-3 text-sm">
        <span className="text-mist">{t('applied', { code: appliedCode })}</span>
        {editable && (
          <form action={onRemove}>
            <SubmitButton variant="secondary" size="compact" pendingLabel={t('removing')}>
              {t('remove')}
            </SubmitButton>
          </form>
        )}
      </div>
    );
  }
  if (!editable) return null;

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
      {state.error && (
        <div className="w-full">
          <Alert tone="error">{state.error}</Alert>
        </div>
      )}
      <div>
        <label htmlFor="couponCode" className="mb-1 block text-xs text-mist">
          {t('label')}
        </label>
        <input
          id="couponCode"
          name="code"
          placeholder={t('placeholder')}
          className="w-48 rounded-survey border border-rule px-2 py-2 text-sm uppercase"
        />
      </div>
      <SubmitButton size="compact" pendingLabel={t('applying')}>
        {t('apply')}
      </SubmitButton>
    </form>
  );
}
