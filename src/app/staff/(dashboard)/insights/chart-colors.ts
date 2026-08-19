// Fixed categorical order for every multi-series chart on this page (DR-155)
// -- one step per "Horizon" hue family (tailwind.config.ts's amber/forest/
// gold/navy), not the literal named tokens. This app has no dark theme
// anywhere (no `darkMode` config, no `dark:` class used on any staff page)
// -- these charts stay consistent with that, one palette, no light/dark
// branching. Assigned by position, never cycled/regenerated: series N
// always gets the same color regardless of how many series are present in
// a given render. A category past this list's length folds into "Other"
// (CHART_TRACK, a neutral -- see charts/DonutChart.tsx) rather than
// generating a new hue.
//
// VALIDATED against the dataviz skill's scripts/validate_palette.js
// (--mode light --surface "#F6EFE4", this app's own "bone" background) --
// the raw named tokens (amber DEFAULT/forest DEFAULT/gold DEFAULT/navy.line
// or mist) FAILED (gold too light/low-contrast; forest, navy.line, and
// mist all read as gray -- chroma below the floor). These four are the
// same hue families stepped to a chroma/lightness that actually clears the
// checks: ALL CHECKS PASS, with two WARNs that are legal only because
// every chart here already ships direct labels + a legend (never color
// alone) -- CVD separation on the gold/forest pair sits in the 6-8 floor
// band, and gold's contrast against the bone surface is 2.85:1 (just under
// the 3:1 mark-only bar). Re-run the validator before changing any of
// these four values.
export const CHART_CATEGORICAL: readonly string[] = [
  '#D65B2E', // amber (ember) -- unchanged from the named token, already clears every check
  '#1B8F5A', // forest, stepped more saturated -- the named DEFAULT (#2F6E4F) reads as gray (chroma 0.083, floor is 0.10)
  '#B8860B', // gold, stepped darker/more saturated -- the named DEFAULT (#F2B441) is too light (L 0.81) and too low-contrast (1.8:1)
  '#8B3F82', // navy/dusk-plum family, stepped more saturated -- both navy DEFAULT and navy.line read as gray or too dark
];

export const CHART_TRACK = '#E3D6C8'; // rule -- meter/donut "remaining" track
export const CHART_MUTED_TEXT = '#8C7D78'; // mist

export function categoricalColor(index: number): string {
  // The modulo always lands in-bounds -- safe non-null assertion, same
  // convention as itinerary/service.ts's dayStops[i]!.
  return CHART_CATEGORICAL[index % CHART_CATEGORICAL.length]!;
}
