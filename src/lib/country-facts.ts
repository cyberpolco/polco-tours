/**
 * Static reference facts for the homepage map's hover tooltip (Namibia, DR
 * Congo, Zambia, and Zimbabwe -- the four countries this platform operates
 * in, DR-034). No external dependency (charter rule 4). Figures are recent
 * public estimates for orientation only, not live/official data --
 * population in particular shifts year to year, so treat these as
 * approximate, same "verify before treating as ground truth" spirit as the
 * tax/visa figures in CLAUDE.md's domain-context section.
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
  '894': {
    id: '894',
    name: 'Zambia',
    capital: 'Lusaka',
    languages: 'English (official); Bemba, Nyanja, Tonga, and other Bantu languages',
    currency: 'Zambian Kwacha (ZMW)',
    population: '~20 million (est.)',
    areaKm2: '~752,618 km²',
  },
  '716': {
    id: '716',
    name: 'Zimbabwe',
    capital: 'Harare',
    languages: 'English, Shona, Ndebele (official, among 16 recognized languages)',
    currency: 'US Dollar (widely used); Zimbabwe Gold (ZWG)',
    population: '~16 million (est.)',
    areaKm2: '~390,757 km²',
  },
};
