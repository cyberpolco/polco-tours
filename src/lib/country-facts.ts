/**
 * Static reference facts for the homepage map's hover tooltip (Namibia and
 * DR Congo -- the only two countries this platform currently operates in).
 * No external dependency (charter rule 4). Figures are recent public
 * estimates for orientation only, not live/official data -- population in
 * particular shifts year to year, so treat these as approximate, same
 * "verify before treating as ground truth" spirit as the tax/visa figures
 * in CLAUDE.md's domain-context section.
 */
export interface CountryFact {
  id: string; // ISO 3166-1 numeric-3, matches the topojson feature id
  name: string;
  capital: string;
  languages: string;
  currency: string;
  population: string;
  areaKm2: string;
}

export const COUNTRY_FACTS: Record<string, CountryFact> = {
  '516': {
    id: '516',
    name: 'Namibia',
    capital: 'Windhoek',
    languages: 'English (official); Afrikaans, German, Oshiwambo widely spoken',
    currency: 'Namibian Dollar (NAD)',
    population: '~2.6 million (est.)',
    areaKm2: '~825,615 km²',
  },
  '180': {
    id: '180',
    name: 'Democratic Republic of the Congo',
    capital: 'Kinshasa',
    languages: 'French (official); Lingala, Kikongo, Swahili, Tshiluba',
    currency: 'Congolese Franc (CDF)',
    population: '~102 million (est.)',
    areaKm2: '~2,344,858 km²',
  },
};
