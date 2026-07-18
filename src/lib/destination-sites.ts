/**
 * Static curated list of named destinations for the merged "plan my trip"
 * form's sites-to-visit question (DR-024; Zambia/Zimbabwe added DR-034).
 * Originally scored against existing packages (the pre-DR-046 quiz); now
 * (DR-046) a picked site is just stored as guest-preference context on the
 * resulting Booking (Booking.preferredSites) for staff to read when pricing
 * the request -- no Site/Destination entity exists in this app's schema,
 * so this stays a handful of well-known place-name strings rather than a
 * new relational model.
 */
export interface DestinationSite {
  name: string;
  country: 'NA' | 'CD' | 'ZM' | 'ZW';
}

export const DESTINATION_SITES: DestinationSite[] = [
  { name: 'Etosha National Park', country: 'NA' },
  { name: 'Sossusvlei', country: 'NA' },
  { name: 'Fish River Canyon', country: 'NA' },
  { name: 'Skeleton Coast', country: 'NA' },
  { name: 'Swakopmund', country: 'NA' },
  { name: 'Caprivi Strip', country: 'NA' },
  { name: 'Windhoek', country: 'NA' },
  { name: 'Virunga National Park', country: 'CD' },
  { name: 'Kahuzi-Biéga National Park', country: 'CD' },
  { name: 'Congo River', country: 'CD' },
  { name: 'Kinshasa', country: 'CD' },
  { name: 'Salonga National Park', country: 'CD' },
  { name: 'Victoria Falls (Zambia side)', country: 'ZM' },
  { name: 'South Luangwa National Park', country: 'ZM' },
  { name: 'Lower Zambezi National Park', country: 'ZM' },
  { name: 'Livingstone', country: 'ZM' },
  { name: 'Victoria Falls (Zimbabwe side)', country: 'ZW' },
  { name: 'Hwange National Park', country: 'ZW' },
  { name: 'Mana Pools National Park', country: 'ZW' },
  { name: 'Great Zimbabwe Ruins', country: 'ZW' },
];
