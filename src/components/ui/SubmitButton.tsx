'use client';

import { useFormStatus } from 'react-dom';
import { Button } from './Button';

interface SubmitButtonProps {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'success';
  size?: 'default' | 'compact';
  // Shows a native confirm() dialog before letting the form submit --
  // every irreversible/destructive action (delete, deactivate) across the
  // staff dashboard sets this, per explicit user direction. Cancelling
  // blocks submission entirely (preventDefault on the submit button's own
  // click event stops the form submit it would otherwise trigger).
  confirmMessage?: string;
}

// Wraps useFormStatus so every server-action form gets a pending/disabled
// state for free -- before this, only BookingForm (which manages its own
// useState) had any pending feedback; every other form in the guest flow
// gave no indication a submit was in flight.
export function SubmitButton({ children, pendingLabel, variant, size, confirmMessage }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      onClick={
        confirmMessage
          ? (e) => {
              if (!window.confirm(confirmMessage)) e.preventDefault();
            }
          : undefined
      }
    >
      {pending ? (pendingLabel ?? 'Saving…') : children}
    </Button>
  );
}
