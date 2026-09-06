// Liquid-glass surfaces for the two /weather pages -- explicit user
// request for a photo background with cards that read as translucent
// water/frosted glass, in the vein of Apple's current UI language. Shared
// constants rather than repeated class strings, so the index and the town
// detail page can't drift apart.
//
// Note the `!border-white/30`: Card already applies `border border-rule`,
// which is the same CSS property at the same specificity, so without the
// important modifier which one wins comes down to Tailwind's generated
// class order rather than intent.
//
// The photo/glass treatment is sm+ only (explicit user request: on a phone
// viewport the fixed-aspect hero photo got cropped hard enough by
// `object-cover` to read as overstretched/zoomed-in, not a deliberate
// backdrop). Below `sm` these pages fall back to their original plain-bone
// look -- see the pre-photo commit these constants replaced (git blame this
// file) for where each "mobile" half of a pair below comes from.

// Named -aerial to distinguish it from the pre-existing victoria-falls.png,
// which is a different (ground-level, gorge-and-bridge) shot still used by
// the homepage carousel.
export const WEATHER_HERO_IMAGE = '/images/hero/victoria-falls-aerial.jpg';

/** Full-bleed only at sm+: breaks out of the guest layout's max-w-7xl
 * container so the photo spans the viewport, same trick /find-booking and
 * /plan-my-trip use. On mobile there's no photo to bleed, so the section
 * stays inside the layout's own padded container. */
export const WEATHER_SECTION =
  'relative overflow-hidden py-12 sm:left-1/2 sm:right-1/2 sm:-mx-[50vw] sm:w-screen sm:px-8 sm:py-16';

/** Re-applies the container the section above broke out of, above the photo. */
export const WEATHER_INNER = 'relative mx-auto max-w-7xl';

/** Hidden on mobile along with the hero photo it darkens -- see
 * WEATHER_HERO_IMAGE's `className` at each call site. Heavier than
 * /find-booking's ink/25 at sm+, since here the text sits directly on the
 * photo rather than on a near-opaque bone card. */
export const WEATHER_SCRIM = 'absolute inset-0 hidden bg-ink/45 sm:block';

/** Plain Card look on mobile (no photo behind it to read as "glass" against);
 * the translucent frosted-glass surface only kicks in at sm+. */
export const GLASS_CARD = 'sm:!border-white/30 sm:bg-white/10 sm:shadow-lift sm:backdrop-blur-xl';

// Text is the page's usual navy/mist on mobile (plain bone background);
// switches to light on glass at sm+, where navy/mist would be unreadable
// against the photo.
export const GLASS_HEADING = 'text-navy sm:text-white';
export const GLASS_MUTED = 'text-mist sm:text-white/75';
