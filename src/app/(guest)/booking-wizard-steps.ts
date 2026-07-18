// Shared step labels for the direct-package-browse journey (DR-024;
// shrunk from 7 to 5 steps in DR-046 when the quiz -- and its own two
// steps, 'Tailor my trip'/'Matches' -- was merged into /plan-my-trip).
// /plan-my-trip is deliberately indicator-free (same precedent as the old
// tailor-made form it replaces): a bespoke request has no departure to
// pick, so it skips straight from submission into the Travelers/Passport/
// Add-ons/Confirm-&-Pay steps below once its Booking exists, same as this
// journey's own "Your details" step does for a PREDEFINED_PACKAGE hold.
// /packages/[packageId] (picking a departure, upstream of "Your details")
// deliberately stays indicator-free too: it's also used by plain
// browse-without-a-plan visitors, so a progress bar there would
// misrepresent non-wizard traffic.
export const BOOKING_WIZARD_STEPS = ['Your details', 'Travelers', 'Passport', 'Add-ons', 'Confirm & Pay'];
