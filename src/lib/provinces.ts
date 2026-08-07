/**
 * Static ISO-3166-2-style province/region names for the app's 4 operating
 * countries (Namibia, DRC, Zambia, Zimbabwe) -- no external dependency
 * (charter rule 4), same "static curated list" precedent as
 * destination-sites.ts/country-codes.ts. Powers the Site form's
 * country -> province cascading dropdown; a country with no entry here
 * (anything outside these 4) falls back to a free-text province input.
 */
export const PROVINCES_BY_COUNTRY: Record<string, string[]> = {
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
};
