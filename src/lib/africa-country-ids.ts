// ISO 3166-1 numeric-3 codes (as strings, matching the `id` field on each
// feature in world-atlas's countries topojson -- see AfricaMap.tsx) for the
// African Union's 55 member states/territories. Used only to color the
// homepage map's "Africa" region -- not a business-rule list, so no
// effective-dating concerns like the tax/visa data elsewhere in this app.
export const AFRICA_COUNTRY_IDS: ReadonlySet<string> = new Set([
  '012', // Algeria
  '024', // Angola
  '204', // Benin
  '072', // Botswana
  '854', // Burkina Faso
  '108', // Burundi
  '132', // Cabo Verde
  '120', // Cameroon
  '140', // Central African Republic
  '148', // Chad
  '174', // Comoros
  '178', // Congo
  '384', // Côte d'Ivoire
  '180', // Democratic Republic of the Congo
  '262', // Djibouti
  '818', // Egypt
  '226', // Equatorial Guinea
  '232', // Eritrea
  '748', // Eswatini
  '231', // Ethiopia
  '266', // Gabon
  '270', // Gambia
  '288', // Ghana
  '324', // Guinea
  '624', // Guinea-Bissau
  '404', // Kenya
  '426', // Lesotho
  '430', // Liberia
  '434', // Libya
  '450', // Madagascar
  '454', // Malawi
  '466', // Mali
  '478', // Mauritania
  '480', // Mauritius
  '504', // Morocco
  '508', // Mozambique
  '516', // Namibia
  '562', // Niger
  '566', // Nigeria
  '646', // Rwanda
  '678', // São Tomé and Príncipe
  '686', // Senegal
  '690', // Seychelles
  '694', // Sierra Leone
  '706', // Somalia
  '710', // South Africa
  '728', // South Sudan
  '729', // Sudan
  '834', // Tanzania
  '768', // Togo
  '788', // Tunisia
  '800', // Uganda
  '732', // Western Sahara
  '894', // Zambia
  '716', // Zimbabwe
]);

// The countries this platform operates in -- get a second, distinct
// highlight color once the map is zoomed in (AfricaMap.tsx). Zambia/
// Zimbabwe added DR-034 (full platform expansion).
export const NAMIBIA_ID = '516';
export const DRC_ID = '180';
export const ZAMBIA_ID = '894';
export const ZIMBABWE_ID = '716';

// Maps each operating country's numeric-3 id (above, keyed off the
// topojson feature's `id`) to the alpha-2 code plan-my-trip's DESTINATIONS
// list uses -- lets the homepage map deep-link a click straight into a
// pre-selected destination (see AfricaMap.tsx).
export const OPERATING_ID_TO_ALPHA2: Readonly<Record<string, string>> = {
  [NAMIBIA_ID]: 'NA',
  [DRC_ID]: 'CD',
  [ZAMBIA_ID]: 'ZM',
  [ZIMBABWE_ID]: 'ZW',
};

// Full ISO 3166-1 alpha-2 <-> numeric-3 mapping for the same 55 AU member
// states as AFRICA_COUNTRY_IDS above (DR-202) -- lets the homepage map
// highlight/deep-link *any* staff-picked country from the CMS's
// CmsOperatingCountry list, not just the original hardcoded four. `name` is
// deliberately plain, untranslated English (same "large static reference
// list, out of scope for i18n" convention as COUNTRY_CODES/PROVINCES_BY_COUNTRY
// in country-codes.ts) -- both the staff-only country picker and the guest
// map's tooltip render it as-is.
export const AFRICA_COUNTRIES: ReadonlyArray<{ alpha2: string; name: string; numericId: string }> = [
  { alpha2: 'DZ', name: 'Algeria', numericId: '012' },
  { alpha2: 'AO', name: 'Angola', numericId: '024' },
  { alpha2: 'BJ', name: 'Benin', numericId: '204' },
  { alpha2: 'BW', name: 'Botswana', numericId: '072' },
  { alpha2: 'BF', name: 'Burkina Faso', numericId: '854' },
  { alpha2: 'BI', name: 'Burundi', numericId: '108' },
  { alpha2: 'CV', name: 'Cabo Verde', numericId: '132' },
  { alpha2: 'CM', name: 'Cameroon', numericId: '120' },
  { alpha2: 'CF', name: 'Central African Republic', numericId: '140' },
  { alpha2: 'TD', name: 'Chad', numericId: '148' },
  { alpha2: 'KM', name: 'Comoros', numericId: '174' },
  { alpha2: 'CG', name: 'Congo', numericId: '178' },
  { alpha2: 'CI', name: "Côte d'Ivoire", numericId: '384' },
  { alpha2: 'CD', name: 'Democratic Republic of the Congo', numericId: DRC_ID },
  { alpha2: 'DJ', name: 'Djibouti', numericId: '262' },
  { alpha2: 'EG', name: 'Egypt', numericId: '818' },
  { alpha2: 'GQ', name: 'Equatorial Guinea', numericId: '226' },
  { alpha2: 'ER', name: 'Eritrea', numericId: '232' },
  { alpha2: 'SZ', name: 'Eswatini', numericId: '748' },
  { alpha2: 'ET', name: 'Ethiopia', numericId: '231' },
  { alpha2: 'GA', name: 'Gabon', numericId: '266' },
  { alpha2: 'GM', name: 'Gambia', numericId: '270' },
  { alpha2: 'GH', name: 'Ghana', numericId: '288' },
  { alpha2: 'GN', name: 'Guinea', numericId: '324' },
  { alpha2: 'GW', name: 'Guinea-Bissau', numericId: '624' },
  { alpha2: 'KE', name: 'Kenya', numericId: '404' },
  { alpha2: 'LS', name: 'Lesotho', numericId: '426' },
  { alpha2: 'LR', name: 'Liberia', numericId: '430' },
  { alpha2: 'LY', name: 'Libya', numericId: '434' },
  { alpha2: 'MG', name: 'Madagascar', numericId: '450' },
  { alpha2: 'MW', name: 'Malawi', numericId: '454' },
  { alpha2: 'ML', name: 'Mali', numericId: '466' },
  { alpha2: 'MR', name: 'Mauritania', numericId: '478' },
  { alpha2: 'MU', name: 'Mauritius', numericId: '480' },
  { alpha2: 'MA', name: 'Morocco', numericId: '504' },
  { alpha2: 'MZ', name: 'Mozambique', numericId: '508' },
  { alpha2: 'NA', name: 'Namibia', numericId: NAMIBIA_ID },
  { alpha2: 'NE', name: 'Niger', numericId: '562' },
  { alpha2: 'NG', name: 'Nigeria', numericId: '566' },
  { alpha2: 'RW', name: 'Rwanda', numericId: '646' },
  { alpha2: 'ST', name: 'São Tomé and Príncipe', numericId: '678' },
  { alpha2: 'SN', name: 'Senegal', numericId: '686' },
  { alpha2: 'SC', name: 'Seychelles', numericId: '690' },
  { alpha2: 'SL', name: 'Sierra Leone', numericId: '694' },
  { alpha2: 'SO', name: 'Somalia', numericId: '706' },
  { alpha2: 'ZA', name: 'South Africa', numericId: '710' },
  { alpha2: 'SS', name: 'South Sudan', numericId: '728' },
  { alpha2: 'SD', name: 'Sudan', numericId: '729' },
  { alpha2: 'TZ', name: 'Tanzania', numericId: '834' },
  { alpha2: 'TG', name: 'Togo', numericId: '768' },
  { alpha2: 'TN', name: 'Tunisia', numericId: '788' },
  { alpha2: 'UG', name: 'Uganda', numericId: '800' },
  { alpha2: 'EH', name: 'Western Sahara', numericId: '732' },
  { alpha2: 'ZM', name: 'Zambia', numericId: ZAMBIA_ID },
  { alpha2: 'ZW', name: 'Zimbabwe', numericId: ZIMBABWE_ID },
];

export const ALPHA2_TO_NUMERIC_ID: Readonly<Record<string, string>> = Object.fromEntries(
  AFRICA_COUNTRIES.map((c) => [c.alpha2, c.numericId]),
);

export const AFRICA_COUNTRY_NAME_BY_ALPHA2: Readonly<Record<string, string>> = Object.fromEntries(
  AFRICA_COUNTRIES.map((c) => [c.alpha2, c.name]),
);
