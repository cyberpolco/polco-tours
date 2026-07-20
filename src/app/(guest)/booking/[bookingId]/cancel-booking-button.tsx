'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { cancelBookingAction } from './actions';

const CANCEL_WINDOW_MS = 30_000;

interface Props {
  bookingId: string;
  // ISO -- Invoice.createdAt, not this component's own mount time or
  // Booking.createdAt. By the time a guest reaches this Confirm & Pay
  // screen (setup complete: add-ons/travelers/passport all done), the
  // booking itself may be many minutes old -- timing off Booking.createdAt
  // the way CancelRequestButton does for the earlier TAILOR_MADE inquiry
  // screen would mean this button often starts already-expired. The
  // invoice is lazily created exactly once setup completes and this screen
  // is first reachable, so its createdAt is the right "you just got here"
  // reference point, and it's still server truth (a reload doesn't reset
  // the window).
  invoiceCreatedAt: string;
}

function secondsRemaining(invoiceCreatedAt: string): number {
  const deadline = new Date(invoiceCreatedAt).getTime() + CANCEL_WINDOW_MS;
  return Math.max(Math.ceil((deadline - Date.now()) / 1000), 0);
}

// Guest-facing "you can still change your mind" window on a package
// booking's Confirm & Pay screen: Cancel booking is only clickable for 30s
// after the invoice was created, counting down live; past that it goes
// inert in place rather than swapping to something else (unlike
// CancelRequestButton's "Return home" -- there's no sensible redirect here,
// the guest is mid setup/payment).
export function CancelBookingButton({ bookingId, invoiceCreatedAt }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(() => secondsRemaining(invoiceCreatedAt));

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = secondsRemaining(invoiceCreatedAt);
      setSecondsLeft(remaining);
      if (remaining <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [invoiceCreatedAt]);

  if (secondsLeft <= 0) {
    return (
      <div>
        <Button variant="secondary" disabled>
          Cancel booking
        </Button>
        <p className="mt-1 text-xs text-mist">The 30-second cancellation window has passed.</p>
      </div>
    );
  }

  return (
    <form action={cancelBookingAction.bind(null, bookingId)}>
      <SubmitButton variant="secondary" pendingLabel="Cancelling…">
        Cancel booking ({secondsLeft}s)
      </SubmitButton>
    </form>
  );
}
