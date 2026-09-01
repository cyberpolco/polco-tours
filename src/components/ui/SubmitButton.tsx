'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';

interface SubmitButtonProps {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'success';
  size?: 'default' | 'compact';
  // Shows an in-app confirm dialog (DR-109) before letting the form submit
  // -- every irreversible/destructive action (delete, deactivate) across
  // the staff dashboard sets this, per explicit user direction. Cancelling
  // blocks submission entirely; confirming programmatically re-submits the
  // same form the button belongs to.
  confirmMessage?: string;
  // DR-207: an extra caller-supplied gate on top of the pending state below
  // -- e.g. CancelAndRefundSection's "I understand" checkbox. ORed with
  // `pending`, never overrides it.
  disabled?: boolean;
  // Passed straight through to the underlying Button -- e.g. `w-full` for a
  // button inside a fixed-width stacked action panel (visa-queue's redesign).
  className?: string;
}

// Wraps useFormStatus so every server-action form gets a pending/disabled
// state for free -- before this, only BookingForm (which manages its own
// useState) had any pending feedback; every other form in the guest flow
// gave no indication a submit was in flight.
export function SubmitButton({ children, pendingLabel, variant, size, confirmMessage, disabled, className }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const t = useTranslations('Common');
  const [pendingForm, setPendingForm] = useState<HTMLFormElement | null>(null);

  return (
    <>
      <Button
        type="submit"
        variant={variant}
        size={size}
        className={className}
        disabled={pending || disabled}
        onClick={
          confirmMessage
            ? (e) => {
                e.preventDefault();
                setPendingForm(e.currentTarget.form);
              }
            : undefined
        }
      >
        {pending ? (pendingLabel ?? t('saving')) : children}
      </Button>
      {pendingForm && confirmMessage && (
        <ConfirmDialog
          message={confirmMessage}
          confirmLabel={t('confirm')}
          cancelLabel={t('cancel')}
          onCancel={() => setPendingForm(null)}
          onConfirm={() => {
            pendingForm.requestSubmit();
            setPendingForm(null);
          }}
        />
      )}
    </>
  );
}
