/**
 * Static curated list of named Namibia/DRC destinations for the "tailor my
 * trip" quiz's sites-to-visit question (DR-024). No Site/Destination entity
 * exists in this app's schema -- picking one just scores a substring match
 * against a package's title/description (scorePackagesForQuiz), the same
 * lightweight approach as the tags question, rather than needing a new
 * relational model for a handful of well-known place names.
 */
export interface DestinationSite {
  name: string;
  country: 'NA' | 'CD';
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
];
