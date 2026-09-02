/**
 * Static ISO-3166-2-style province/region names for the app's 5 operating
 * countries (Namibia, DRC, Zambia, Zimbabwe, and -- since DR-218 --
 * Botswana) -- no external dependency (charter rule 4), same "static
 * curated list" precedent as country-codes.ts (the former
 * destination-sites.ts precedent moved to a real staff-editable
 * CmsMediaItem list in DR-167). Powers the Site form's country -> province
 * cascading dropdown.
 *
 * Explicit user direction: a Site's country is restricted to these 5
 * (SITE_COUNTRIES below), not the full COUNTRY_CODES world list Hotel/
 * Restaurant/Traveler use -- a site is somewhere on this app's own
 * itinerary, never anywhere else. Each entry here is the complete,
 * current list of that country's top-level administrative divisions
 * (Namibia's 14 regions since the 2013 redelineation; DRC's 26 provinces
 * since the 2015 redistricting; Zambia's 10 provinces since Muchinga split
 * off Northern in 2011; Zimbabwe's 10 provinces, 2 of which -- Harare and
 * Bulawayo -- are also cities with provincial status; Botswana's 10
 * districts plus Gaborone and Francistown, its 2 city-status districts --
 * same "administrative district + provincial-status city" shape as
 * Zimbabwe's list above, deliberately omitting Botswana's smaller town
 * councils, e.g. Lobatse/Selebi-Phikwe/Orapa/Jwaneng/Sowa, for the same
 * reason).
 */
export const SITE_COUNTRIES = [
  { code: 'NA', name: 'Namibia' },
  { code: 'CD', name: 'DR Congo' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'ZW', name: 'Zimbabwe' },
  { code: 'BW', name: 'Botswana' },
] as const;

export type SiteCountryCode = (typeof SITE_COUNTRIES)[number]['code'];

export const SITE_COUNTRY_CODES = SITE_COUNTRIES.map((c) => c.code) as [SiteCountryCode, ...SiteCountryCode[]];

export const PROVINCES_BY_COUNTRY: Record<SiteCountryCode, string[]> = {
  NA: [
    'Erongo',
    'Hardap',
    '‖Karas',
    'Kavango East',
    'Kavango West',
    'Khomas',
    'Kunene',
    'Ohangwena',
    'Omaheke',
    'Omusati',
    'Oshana',
    'Oshikoto',
    'Otjozondjupa',
    'Zambezi',
  ],
  CD: [
    'Bas-Uele',
    'Équateur',
    'Haut-Katanga',
    'Haut-Lomami',
    'Haut-Uele',
    'Ituri',
    'Kasaï',
    'Kasaï-Central',
    'Kasaï-Oriental',
    'Kinshasa',
    'Kongo Central',
    'Kwango',
    'Kwilu',
    'Lomami',
    'Lualaba',
    'Mai-Ndombe',
    'Maniema',
    'Mongala',
    'Nord-Kivu',
    'Nord-Ubangi',
    'Sankuru',
    'Sud-Kivu',
    'Sud-Ubangi',
    'Tanganyika',
    'Tshopo',
    'Tshuapa',
  ],
  ZM: ['Central', 'Copperbelt', 'Eastern', 'Luapula', 'Lusaka', 'Muchinga', 'Northern', 'North-Western', 'Southern', 'Western'],
  ZW: [
    'Bulawayo',
    'Harare',
    'Manicaland',
    'Mashonaland Central',
    'Mashonaland East',
    'Mashonaland West',
    'Masvingo',
    'Matabeleland North',
    'Matabeleland South',
    'Midlands',
  ],
  BW: [
    'Central',
    'Chobe',
    'Francistown',
    'Gaborone',
    'Ghanzi',
    'Kgalagadi',
    'Kgatleng',
    'Kweneng',
    'North-East',
    'North-West',
    'South-East',
    'Southern',
  ],
};
