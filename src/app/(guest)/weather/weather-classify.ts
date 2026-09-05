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

// A restrained wash so a card carrying an icon/animation reads as its own
// themed surface, without the sunset palette's warm tones (gold/amber/navy)
// fighting the icon colors -- only `clear` gets a color at all, via the
// `forest` token's soft green; every other condition is neutral, darkening
// with severity. These gradients now sit on top of a translucent glass card
// over a photo (weather-glass.ts), so the opacities are much lower than a
// wash on a solid bone page would need -- anything heavier turns the glass
// opaque and defeats the effect. Plain string classes (not computed
// per-render) so Tailwind's static analysis picks them up -- this is the one
// place outside tailwind.config.ts itself that needs every class spelled out
// literally.
export function weatherCardTint(category: ConditionCategory): string {
  switch (category) {
    case 'clear':
      return 'bg-gradient-to-br from-forest-soft/30 via-forest/10 to-transparent';
    case 'cloudy':
      return 'bg-gradient-to-br from-white/25 via-white/10 to-transparent';
    case 'rain':
      return 'bg-gradient-to-br from-slate-300/25 via-slate-200/10 to-transparent';
    case 'storm':
      return 'bg-gradient-to-br from-slate-700/35 via-slate-600/15 to-transparent';
    case 'snow':
      return 'bg-gradient-to-br from-white/40 via-white/15 to-transparent';
  }
}
