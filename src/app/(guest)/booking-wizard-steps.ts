// Shared step labels for the direct-package-browse journey (DR-024;
// shrunk from 7 to 5 steps in DR-046 when the quiz -- and its own two
// steps, 'Tailor my trip'/'Matches' -- was merged into /plan-my-trip).
// Reordered (add-ons now come right after "Your details", before
// Travelers) and made passport-conditional in a later increment: Passport
// only appears at all once the finalized add-ons included Visa Assistance
// (Booking.requiresPassportUpload) -- see bookingService.setAddons. Callers
// that already know this booking's flag should pass it in; a caller with no
// booking yet (the pre-hold /book/[departureId] page) passes false, the
// only reasonable default before any add-on has been chosen.
// /plan-my-trip is deliberately indicator-free (same precedent as the old
// tailor-made form it replaces): a bespoke request has no departure to
// pick, so it skips straight from submission into this same wizard once
// its Booking exists (and its quotation is accepted), same as this
// journey's own "Your details" step does for a PREDEFINED_PACKAGE hold.
// /packages/[packageId] (picking a departure, upstream of "Your details")
// deliberately stays indicator-free too: it's also used by plain
// browse-without-a-plan visitors, so a progress bar there would
// misrepresent non-wizard traffic.
export function getBookingWizardSteps(requiresPassportUpload: boolean): string[] {
  const steps = ['Your details', 'Add-ons', 'Travelers'];
  if (requiresPassportUpload) steps.push('Passport');
  steps.push('Confirm & Pay');
  return steps;
}
