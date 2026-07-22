import PlanMyTripForm from './plan-my-trip-form';

interface Props {
  // Populated when a guest arrives via the homepage map's country click
  // (AfricaMap.tsx) -- pre-selects that destination on step 0 instead of
  // starting the wizard empty.
  searchParams: Promise<{ destination?: string }>;
}

// Mirrors plan-my-trip-form.tsx's own local DESTINATIONS codes -- kept in
// sync by hand, same convention as that file's ADDONS/DESTINATIONS comment.
const VALID_DESTINATION_CODES = new Set(['NA', 'CD', 'ZM', 'ZW']);

// Merged entry point (DR-046) -- replaces the old quiz->package-matching
// flow AND the old tailor-made form with a single always-bespoke intake:
// every submission becomes a TAILOR_MADE booking for staff to price, no
// package matching/scoring happens anymore. The form itself is a gradual
// multi-step wizard (DR-047) with its own local progress indicator --
// deliberately NOT the shared BOOKING_WIZARD_STEPS/StepIndicator, since
// this isn't part of the direct-package-browse journey at all: it's the
// other booking origin, with no pre-existing Departure, priced by staff
// afterward via a quotation (see bookingService.createTailorMadeRequest).
export default async function PlanMyTripPage({ searchParams }: Props) {
  const { destination } = await searchParams;
  const initialDestination = destination && VALID_DESTINATION_CODES.has(destination) ? destination : undefined;

  return (
    <div className="max-w-lg">
      <p className="eyebrow mt-4 text-mist">Plan my trip</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">Tell us what you have in mind</h1>
      <p className="mt-1 text-sm text-mist">
        Answer a few questions about the trip you want and our team will send you a quotation.
      </p>
      <PlanMyTripForm initialDestination={initialDestination} />
    </div>
  );
}
