'use client';

import { useFormStatus } from 'react-dom';
import { Button } from './Button';

interface SubmitButtonProps {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary';
}

// Wraps useFormStatus so every server-action form gets a pending/disabled
// state for free -- before this, only BookingForm (which manages its own
// useState) had any pending feedback; every other form in the guest flow
// gave no indication a submit was in flight.
export function SubmitButton({ children, pendingLabel, variant }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? (pendingLabel ?? 'Saving…') : children}
    </Button>
  );
}
