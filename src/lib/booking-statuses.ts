import type { BookingStatus } from '@prisma/client';

// Shared by the Bookings hub, the "All" list, and the per-status list
// (DR-098) -- lives here, not exported from bookings/page.tsx, because
// Next.js's App Router rejects any named export from a page.tsx file
// other than its own well-known ones (default, generateMetadata, etc.);
// `next build`'s own type-checking catches this, plain `tsc --noEmit`
// does not. DRAFT stays omitted -- no creation path ever actually sets
// it (see booking/domain.ts's TRANSITIONS comment), so a card/filter
// option for it could never match anything.
export const FILTERABLE_BOOKING_STATUSES: BookingStatus[] = [
  'AWAITING_QUOTATION',
  'QUOTATION_SENT',
  'AWAITING_DEPOSIT',
  'DEPOSIT_PAID',
  'FULLY_PAID',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
];
