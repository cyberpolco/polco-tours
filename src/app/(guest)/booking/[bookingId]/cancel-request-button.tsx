'use client';

import { useEffect, useState } from 'react';
import { LinkButton } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { cancelBookingAction } from './actions';

const CANCEL_WINDOW_MS = 30_000;

interface Props {
  bookingId: string;
  createdAt: string; // ISO -- Booking.createdAt, not page-load time, so a
  // refresh/re-open doesn't reset the window.
}

function secondsRemaining(createdAt: string): number {
  const deadline = new Date(createdAt).getTime() + CANCEL_WINDOW_MS;
  return Math.max(Math.ceil((deadline - Date.now()) / 1000), 0);
}

// Guest-facing "oops, I made a mistake" grace period on a freshly-submitted
// trip request: Cancel request is only offered for 30s after the booking
// was created, counting down live so the guest can see it running out;
// past that, this swaps to a plain way back to the homepage instead. Timed
// off Booking.createdAt (server truth), not this component's own mount
// time, so a refresh/re-open doesn't reset the window.
export function CancelRequestButton({ bookingId, createdAt }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(() => secondsRemaining(createdAt));

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = secondsRemaining(createdAt);
      setSecondsLeft(remaining);
      if (remaining <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [createdAt]);

  if (secondsLeft <= 0) {
    return (
      <LinkButton href="/" variant="secondary">
        Return home
      </LinkButton>
    );
  }

  return (
    <form action={cancelBookingAction.bind(null, bookingId)}>
      <SubmitButton variant="secondary" pendingLabel="Cancelling…">
        Cancel request ({secondsLeft}s)
      </SubmitButton>
    </form>
  );
}
