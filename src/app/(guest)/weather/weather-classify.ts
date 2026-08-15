// Pure helpers shared by both the (server-rendered) weather pages and the
// 'use client' WeatherAnimation component. Deliberately NOT in
// weather-animation.tsx: that file is 'use client' (it uses hooks/framer-
// motion), and a server component may only *render* a client module's
// exports as JSX -- calling one of its exports as a plain function throws
// "Attempted to call X() from the server but X is on the client." These two
// functions are called directly (not rendered) by the server-component pages,
// so they must live in a module with no 'use client' directive.
export type ConditionCategory = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow';

export function classifyCondition(conditionText: string): ConditionCategory {
  const text = conditionText.toLowerCase();
  if (text.includes('thunder') || text.includes('storm')) return 'storm';
  if (text.includes('snow') || text.includes('sleet') || text.includes('hail')) return 'snow';
  if (text.includes('rain') || text.includes('shower') || text.includes('drizzle')) return 'rain';
  if (text.includes('cloud') || text.includes('overcast') || text.includes('haze') || text.includes('fog') || text.includes('mist')) {
    return 'cloudy';
  }
  return 'clear';
}

// A restrained gray/green wash so a card carrying an icon/animation reads as
// its own themed surface rather than blending into the page, without the
// sunset palette's warm tones (gold/amber/navy) fighting the icon colors --
// only `clear` gets a (pale) color at all, via the `forest` token's soft
// green; every other condition is a plain gray, darkening with severity.
// Plain string classes (not computed per-render) so Tailwind's static
// analysis picks them up -- this is the one place outside
// tailwind.config.ts itself that needs every class spelled out literally.
export function weatherCardTint(category: ConditionCategory): string {
  switch (category) {
    case 'clear':
      return 'bg-gradient-to-br from-forest-soft via-forest/10 to-transparent';
    case 'cloudy':
      return 'bg-gradient-to-br from-gray-200/70 via-gray-100/40 to-transparent';
    case 'rain':
      return 'bg-gradient-to-br from-gray-400/30 via-gray-300/25 to-transparent';
    case 'storm':
      return 'bg-gradient-to-br from-gray-600/30 via-gray-500/20 to-transparent';
    case 'snow':
      return 'bg-gradient-to-br from-gray-100/80 via-gray-50/50 to-transparent';
  }
}
