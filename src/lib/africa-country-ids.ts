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
