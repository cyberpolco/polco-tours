import type { Coordinates } from './geo';

/**
 * Static curated list of towns POLCO TOURS operates in, one entry per town,
 * for the guest-facing Weather feature (DR-113). Deliberately a plain array,
 * not a Prisma model -- this list changes rarely and needs no staff-editing
 * UI (the former "no staff-editing needed" precedent this cited,
 * destination-sites.ts, was itself moved to a real staff-editable
 * CmsMediaItem list in DR-167, once that turned out not to hold for it).
 * Do not "for consistency" this into a DB table without an explicit
 * decision -- the moment staff need to self-edit it (or seasonalNotes),
 * that's a real schema change and needs its own DR.
 *
 * seasonalNotes is scoped NARROWLY to weather-driven travel logistics
 * (rainy season timing, road/access conditions, best months to visit) --
 * it must never restate or duplicate CountryRegulation's travel-advisory
 * content (immigration module, staff-editable, the actual source of truth
 * for that). For any DRC town, especially Goma/Bukavu (near the BR-07
 * security zones documented in this app's regional-compliance context),
 * this stays purely climate-focused and points guests to /contact for
 * current conditions rather than making a safety claim this page has no
 * authority to make.
 *
 * Coordinates below are a starting point from general geographic knowledge,
 * NOT yet verified via the Geocoding API -- refine them the same way DR-088
 * did (scripts/backfill-coordinates.ts) before relying on them for anything
 * precision-sensitive.
 */
export interface WeatherTown {
  slug: string;
  name: string;
  country: 'NA' | 'CD' | 'ZM' | 'ZW';
  coordinates: Coordinates;
  seasonalNotes: string;
}

export const WEATHER_TOWNS: WeatherTown[] = [
  // Namibia
  {
    slug: 'windhoek',
    name: 'Windhoek',
    country: 'NA',
    coordinates: { latitude: -22.5609, longitude: 17.0658 },
    seasonalNotes: 'Semi-arid, mild year-round. Short rainy season Nov-Apr (afternoon thunderstorms), driest and coolest May-Sep.',
  },
  {
    slug: 'swakopmund',
    name: 'Swakopmund',
    country: 'NA',
    coordinates: { latitude: -22.6787, longitude: 14.5251 },
    seasonalNotes: 'Coastal desert climate -- cool and often foggy year-round, rarely hot. Morning fog is common regardless of season.',
  },
  {
    slug: 'walvis-bay',
    name: 'Walvis Bay',
    country: 'NA',
    coordinates: { latitude: -22.9575, longitude: 14.5053 },
    seasonalNotes: 'Similar coastal climate to nearby Swakopmund -- mild, dry, frequent morning fog, minimal rainfall year-round.',
  },
  {
    slug: 'luderitz',
    name: 'Lüderitz',
    country: 'NA',
    coordinates: { latitude: -26.6481, longitude: 15.1594 },
    seasonalNotes: 'Cool, windy coastal desert town -- strong afternoon winds are common; pack a windbreaker regardless of month.',
  },
  {
    slug: 'etosha-national-park',
    name: 'Etosha National Park',
    country: 'NA',
    coordinates: { latitude: -19.1658, longitude: 15.9186 },
    seasonalNotes: 'Best game viewing in the dry season (May-Oct) when animals concentrate at waterholes; wet season (Nov-Apr) is greener but wildlife disperses.',
  },
  {
    slug: 'sesriem',
    name: 'Sesriem',
    country: 'NA',
    coordinates: { latitude: -24.497, longitude: 15.7987 },
    seasonalNotes: 'Hot desert days year-round, cold nights May-Aug. Sunrise visits to the dunes avoid the worst midday heat.',
  },
  {
    slug: 'katima-mulilo',
    name: 'Katima Mulilo',
    country: 'NA',
    coordinates: { latitude: -17.497, longitude: 24.2696 },
    seasonalNotes: 'Wetter, sub-tropical climate (Zambezi region) -- rainy season Nov-Apr can affect some rural access roads.',
  },
  // DRC
  {
    slug: 'kinshasa',
    name: 'Kinshasa',
    country: 'CD',
    coordinates: { latitude: -4.4419, longitude: 15.2663 },
    seasonalNotes: 'Tropical climate -- two rainy seasons (roughly Oct-Dec and Mar-May), driest Jun-Sep.',
  },
  {
    slug: 'lubumbashi',
    name: 'Lubumbashi',
    country: 'CD',
    coordinates: { latitude: -11.6609, longitude: 27.4794 },
    seasonalNotes: 'Higher-altitude, milder climate than western DRC -- distinct dry season May-Sep, rains Oct-Apr.',
  },
  {
    slug: 'kolwezi',
    name: 'Kolwezi',
    country: 'CD',
    coordinates: { latitude: -10.7167, longitude: 25.4667 },
    seasonalNotes: 'Similar highland climate to Lubumbashi -- dry season May-Sep is the easiest time to travel.',
  },
  {
    slug: 'mbuji-mayi',
    name: 'Mbuji-Mayi',
    country: 'CD',
    coordinates: { latitude: -6.15, longitude: 23.6 },
    seasonalNotes: 'Tropical savanna climate -- a clearer dry season (May-Sep) than western DRC, heavier rains Oct-Apr.',
  },
  {
    slug: 'matadi',
    name: 'Matadi',
    country: 'CD',
    coordinates: { latitude: -5.8167, longitude: 13.45 },
    seasonalNotes: 'Hot, tropical -- rainy season roughly Oct-May, a cooler dry season Jun-Sep.',
  },
  {
    slug: 'boma',
    name: 'Boma',
    country: 'CD',
    coordinates: { latitude: -5.85, longitude: 13.05 },
    seasonalNotes: 'Coastal tropical climate, similar pattern to nearby Matadi -- driest Jun-Sep.',
  },
  {
    slug: 'goma',
    name: 'Goma',
    country: 'CD',
    coordinates: { latitude: -1.6792, longitude: 29.2228 },
    seasonalNotes:
      'Tempered by altitude (Lake Kivu region) -- generally mild, rains most pronounced Sep-May. Check current travel conditions with us before booking.',
  },
  {
    slug: 'bukavu',
    name: 'Bukavu',
    country: 'CD',
    coordinates: { latitude: -2.5083, longitude: 28.8608 },
    seasonalNotes:
      'Similar mild, high-altitude Lake Kivu climate to Goma -- rains most pronounced Sep-May. Check current travel conditions with us before booking.',
  },
  {
    slug: 'kisangani',
    name: 'Kisangani',
    country: 'CD',
    coordinates: { latitude: 0.5167, longitude: 25.2 },
    seasonalNotes: 'Equatorial -- hot and humid year-round with rain possible in any month; no sharply defined dry season.',
  },
  // Zambia
  {
    slug: 'livingstone',
    name: 'Livingstone',
    country: 'ZM',
    coordinates: { latitude: -17.8419, longitude: 25.8543 },
    seasonalNotes: 'Victoria Falls is at its most powerful (and mistiest) Mar-May after the rains; lowest water and clearest views Sep-Dec.',
  },
  {
    slug: 'lusaka',
    name: 'Lusaka',
    country: 'ZM',
    coordinates: { latitude: -15.3875, longitude: 28.3228 },
    seasonalNotes: 'Rainy season Nov-Apr, cool dry season May-Aug, hot dry season Sep-Oct.',
  },
  {
    slug: 'mfuwe',
    name: 'Mfuwe',
    country: 'ZM',
    coordinates: { latitude: -13.2667, longitude: 31.9333 },
    seasonalNotes: 'South Luangwa walking safaris run in the dry season (roughly May-Oct); many camps close during the wettest months.',
  },
  {
    slug: 'siavonga',
    name: 'Siavonga',
    country: 'ZM',
    coordinates: { latitude: -16.5382, longitude: 28.7088 },
    seasonalNotes: 'Hot Lake Kariba climate -- Sep-Nov is the hottest stretch before the rains arrive.',
  },
  {
    slug: 'chipata',
    name: 'Chipata',
    country: 'ZM',
    coordinates: { latitude: -13.6333, longitude: 32.65 },
    seasonalNotes: 'Similar seasonal pattern to Mfuwe -- rains Nov-Apr, dry and best for travel May-Oct.',
  },
  // Zimbabwe
  {
    slug: 'victoria-falls',
    name: 'Victoria Falls',
    country: 'ZW',
    coordinates: { latitude: -17.9243, longitude: 25.8572 },
    seasonalNotes: 'Falls at their most powerful Mar-May; lowest water and best photography conditions Sep-Dec.',
  },
  {
    slug: 'harare',
    name: 'Harare',
    country: 'ZW',
    coordinates: { latitude: -17.8292, longitude: 31.0522 },
    seasonalNotes: 'Rainy season Nov-Mar, mild dry winter Jun-Aug, hot build-up Sep-Oct.',
  },
  {
    slug: 'bulawayo',
    name: 'Bulawayo',
    country: 'ZW',
    coordinates: { latitude: -20.15, longitude: 28.5833 },
    seasonalNotes: 'Similar pattern to Harare -- dry season (Apr-Oct) is the easiest time to visit Matobo Hills.',
  },
  {
    slug: 'hwange-dete',
    name: 'Hwange / Dete',
    country: 'ZW',
    coordinates: { latitude: -18.6, longitude: 27.0167 },
    seasonalNotes: 'Dry season (roughly Jul-Oct) brings the best game viewing as animals concentrate around waterholes.',
  },
  {
    slug: 'masvingo',
    name: 'Masvingo',
    country: 'ZW',
    coordinates: { latitude: -20.0637, longitude: 30.8277 },
    seasonalNotes: 'Rainy season Nov-Mar, dry and mild Apr-Oct -- the easier stretch for visiting Great Zimbabwe.',
  },
];

export function findWeatherTown(slug: string): WeatherTown | undefined {
  return WEATHER_TOWNS.find((t) => t.slug === slug);
}

export function weatherTownsByCountry(): Record<WeatherTown['country'], WeatherTown[]> {
  return {
    NA: WEATHER_TOWNS.filter((t) => t.country === 'NA'),
    CD: WEATHER_TOWNS.filter((t) => t.country === 'CD'),
    ZM: WEATHER_TOWNS.filter((t) => t.country === 'ZM'),
    ZW: WEATHER_TOWNS.filter((t) => t.country === 'ZW'),
  };
}
