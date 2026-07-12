// Shared step labels spanning the WHOLE guided journey (DR-024) -- quiz
// through payment/quote, not just the 4-page booking wizard this used to
// cover. /packages/[packageId] (picking a departure between Matches and
// Your details) deliberately stays indicator-free: it's also used by
// plain browse-without-quiz visitors, so a progress bar there would
// misrepresent non-wizard traffic.
export const BOOKING_WIZARD_STEPS = [
  'Tailor my trip',
  'Matches',
  'Your details',
  'Travelers',
  'Passport',
  'Add-ons',
  'Confirm & Pay',
];
