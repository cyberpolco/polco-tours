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

// Named -aerial to distinguish it from the pre-existing victoria-falls.png,
// which is a different (ground-level, gorge-and-bridge) shot still used by
// the homepage carousel.
export const WEATHER_HERO_IMAGE = '/images/hero/victoria-falls-aerial.jpg';

/** Full-bleed: breaks out of the guest layout's max-w-7xl container so the
 * photo spans the viewport, same trick /find-booking and /plan-my-trip use. */
export const WEATHER_SECTION =
  'relative left-1/2 right-1/2 -mx-[50vw] w-screen overflow-hidden px-4 py-12 sm:px-8 sm:py-16';

/** Re-applies the container the section above broke out of, above the photo. */
export const WEATHER_INNER = 'relative mx-auto max-w-7xl';

/** Darkens the photo enough for white text and for the glass to read as
 * glass -- heavier than /find-booking's ink/25, since here the text sits
 * directly on the photo rather than on a near-opaque bone card. */
export const WEATHER_SCRIM = 'absolute inset-0 bg-ink/45';

export const GLASS_CARD = '!border-white/30 bg-white/10 shadow-lift backdrop-blur-xl';

// Text on glass is light, not the page's usual navy/mist -- those are tuned
// for the bone background and would be unreadable here.
export const GLASS_HEADING = 'text-white';
export const GLASS_MUTED = 'text-white/75';
