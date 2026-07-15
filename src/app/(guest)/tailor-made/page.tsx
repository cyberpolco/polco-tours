import TailorMadeForm from './tailor-made-form';

// A standalone entry point, deliberately without StepIndicator -- this isn't
// part of the quiz->package->pay journey (BOOKING_WIZARD_STEPS), it's the
// other booking origin: no pre-existing Departure, priced by staff afterward
// via a quotation (see bookingService.createTailorMadeRequest).
export default function TailorMadePage() {
  return (
    <div className="max-w-md">
      <p className="eyebrow mt-4 text-mist">Tailor-made trip</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">Tell us what you have in mind</h1>
      <p className="mt-1 text-sm text-mist">
        Not seeing the right package? Describe the trip you want and our team will send you a quotation.
      </p>
      <TailorMadeForm />
    </div>
  );
}
