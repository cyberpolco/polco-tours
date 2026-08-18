// Shared, framework-free day-index -> color palette for the staff Map tab's
// whole-circuit view (DR-150) -- one color per day, used identically by the
// interactive Google Maps JS widget (CSS hex) and the server-rendered
// Static Maps image + PDF (Google's `0xRRGGBB` markers/path color syntax).
// Deliberately a qualitative (categorical) palette, not the site's own
// "Horizon" brand tokens -- a circuit needs many mutually distinguishable
// hues in one view, not a small on-brand set. Cycles (modulo) past its own
// length for an itinerary longer than the palette -- no real safari circuit
// runs 12+ days, but this never throws either way.
const CIRCUIT_DAY_COLORS = [
  'D65B2E',
  '2F6E4F',
  '1F6FEB',
  'C2185B',
  'F2B441',
  '6A4C93',
  '00897B',
  '8D6E63',
  '3B1F3A',
  '558B2F',
  '5C6BC0',
  'E64980',
] as const;

/** Bare hex (no `#`/`0x` prefix) -- format for the target consumer with
 * circuitColorAsCss/circuitColorAsStaticMapsParam below. */
export function circuitColorForDayIndex(index: number): string {
  return CIRCUIT_DAY_COLORS[index % CIRCUIT_DAY_COLORS.length]!;
}

export function circuitColorAsCss(hex: string): string {
  return `#${hex}`;
}

export function circuitColorAsStaticMapsParam(hex: string): string {
  return `0x${hex}`;
}
