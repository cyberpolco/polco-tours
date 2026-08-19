// analytics module — domain types & rules. Pure; no framework or DB imports.
// Wizard-step-abandonment tracking (DR-155): one row per anonymous
// plan-my-trip session, tracking only the highest step reached -- no field
// values, no better-auth account. Mirrors the 9-step order of
// (guest)/plan-my-trip/plan-my-trip-form.tsx's own STEPS array exactly.
export const WIZARD_STEP_LABELS = [
  'destination',
  'dates',
  'travelers',
  'preferences',
  'sites',
  'yourTrip',
  'addOns',
  'specialRequests',
  'contact',
] as const;

export const WIZARD_STEP_COUNT = WIZARD_STEP_LABELS.length;

export interface WizardFunnelStage {
  step: number;
  label: (typeof WIZARD_STEP_LABELS)[number];
  reachedCount: number;
}

/** Pure aggregation over a flat list of "highest step reached" values --
 * deliberately takes just the numbers (not full DB rows) so this stays
 * testable with no fixture data beyond an array of ints. Cumulative: step N's
 * reachedCount is "how many sessions got to step N or further," so the
 * series is always non-increasing, which is what a funnel chart expects. */
export function computeWizardFunnel(highestSteps: number[]): WizardFunnelStage[] {
  return WIZARD_STEP_LABELS.map((label, step) => ({
    step,
    label,
    reachedCount: highestSteps.filter((s) => s >= step).length,
  }));
}
