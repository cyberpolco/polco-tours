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

// Guest-facing "oops, I made a mistake" grace period on a freshly-submitted
// trip request: Cancel request is only offered for 30s after the booking
// was created; past that, this swaps to a plain way back to the homepage
// instead. Timed off Booking.createdAt (server truth), not this component's
// own mount time -- ticks down live via a client timer so a guest sitting on
// the page sees the swap happen without needing to reload.
export function CancelRequestButton({ bookingId, createdAt }: Props) {
  const elapsed = () => Date.now() - new Date(createdAt).getTime();
  const [expired, setExpired] = useState(() => elapsed() >= CANCEL_WINDOW_MS);

  useEffect(() => {
    if (expired) return;
    const timer = setTimeout(() => setExpired(true), Math.max(CANCEL_WINDOW_MS - elapsed(), 0));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdAt, expired]);

  if (expired) {
    return (
      <LinkButton href="/" variant="secondary">
        Return home
      </LinkButton>
    );
  }

  return (
    <form action={cancelBookingAction.bind(null, bookingId)}>
      <SubmitButton variant="secondary" pendingLabel="Cancelling…">
        Cancel request
      </SubmitButton>
    </form>
  );
}
