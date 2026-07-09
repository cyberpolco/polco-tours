/**
 * Static ISO-3166 alpha-2 -> country name / E.164 calling code data. No
 * external dependency (charter rule 4) -- the phone/nationality pickers in
 * the booking wizard use this instead of a phone-input library. Flag emoji
 * is computed from the alpha-2 code (regional indicator symbols), not
 * hardcoded per country.
 */
export interface CountryCode {
  alpha2: string;
  name: string;
  dialCode: string;
}

export function flagEmoji(alpha2: string): string {
  const codePoints = alpha2
    .toUpperCase()
    .split('')
    .map((c) => 0x1f1e6 - 65 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export const COUNTRY_CODES: CountryCode[] = [
  { alpha2: 'NA', name: 'Namibia', dialCode: '264' },
  { alpha2: 'CD', name: 'DR Congo', dialCode: '243' },
  { alpha2: 'ZA', name: 'South Africa', dialCode: '27' },
  { alpha2: 'BW', name: 'Botswana', dialCode: '267' },
  { alpha2: 'ZM', name: 'Zambia', dialCode: '260' },
  { alpha2: 'ZW', name: 'Zimbabwe', dialCode: '263' },
  { alpha2: 'AO', name: 'Angola', dialCode: '244' },
  { alpha2: 'CG', name: 'Congo', dialCode: '242' },
  { alpha2: 'TZ', name: 'Tanzania', dialCode: '255' },
  { alpha2: 'KE', name: 'Kenya', dialCode: '254' },
  { alpha2: 'UG', name: 'Uganda', dialCode: '256' },
  { alpha2: 'RW', name: 'Rwanda', dialCode: '250' },
  { alpha2: 'MZ', name: 'Mozambique', dialCode: '258' },
  { alpha2: 'MW', name: 'Malawi', dialCode: '265' },
  { alpha2: 'LS', name: 'Lesotho', dialCode: '266' },
  { alpha2: 'SZ', name: 'Eswatini', dialCode: '268' },
  { alpha2: 'NG', name: 'Nigeria', dialCode: '234' },
  { alpha2: 'GH', name: 'Ghana', dialCode: '233' },
  { alpha2: 'EG', name: 'Egypt', dialCode: '20' },
  { alpha2: 'ET', name: 'Ethiopia', dialCode: '251' },
  { alpha2: 'MA', name: 'Morocco', dialCode: '212' },
  { alpha2: 'DZ', name: 'Algeria', dialCode: '213' },
  { alpha2: 'TN', name: 'Tunisia', dialCode: '216' },
  { alpha2: 'SN', name: 'Senegal', dialCode: '221' },
  { alpha2: 'CI', name: "Cote d'Ivoire", dialCode: '225' },
  { alpha2: 'CM', name: 'Cameroon', dialCode: '237' },
  { alpha2: 'US', name: 'United States', dialCode: '1' },
  { alpha2: 'CA', name: 'Canada', dialCode: '1' },
  { alpha2: 'GB', name: 'United Kingdom', dialCode: '44' },
  { alpha2: 'IE', name: 'Ireland', dialCode: '353' },
  { alpha2: 'FR', name: 'France', dialCode: '33' },
  { alpha2: 'DE', name: 'Germany', dialCode: '49' },
  { alpha2: 'BE', name: 'Belgium', dialCode: '32' },
  { alpha2: 'NL', name: 'Netherlands', dialCode: '31' },
  { alpha2: 'LU', name: 'Luxembourg', dialCode: '352' },
  { alpha2: 'CH', name: 'Switzerland', dialCode: '41' },
  { alpha2: 'AT', name: 'Austria', dialCode: '43' },
  { alpha2: 'ES', name: 'Spain', dialCode: '34' },
  { alpha2: 'PT', name: 'Portugal', dialCode: '351' },
  { alpha2: 'IT', name: 'Italy', dialCode: '39' },
  { alpha2: 'GR', name: 'Greece', dialCode: '30' },
  { alpha2: 'SE', name: 'Sweden', dialCode: '46' },
  { alpha2: 'NO', name: 'Norway', dialCode: '47' },
  { alpha2: 'DK', name: 'Denmark', dialCode: '45' },
  { alpha2: 'FI', name: 'Finland', dialCode: '358' },
  { alpha2: 'PL', name: 'Poland', dialCode: '48' },
  { alpha2: 'CZ', name: 'Czechia', dialCode: '420' },
  { alpha2: 'RO', name: 'Romania', dialCode: '40' },
  { alpha2: 'RU', name: 'Russia', dialCode: '7' },
  { alpha2: 'UA', name: 'Ukraine', dialCode: '380' },
  { alpha2: 'TR', name: 'Turkey', dialCode: '90' },
  { alpha2: 'IL', name: 'Israel', dialCode: '972' },
  { alpha2: 'AE', name: 'United Arab Emirates', dialCode: '971' },
  { alpha2: 'SA', name: 'Saudi Arabia', dialCode: '966' },
  { alpha2: 'IN', name: 'India', dialCode: '91' },
  { alpha2: 'PK', name: 'Pakistan', dialCode: '92' },
  { alpha2: 'CN', name: 'China', dialCode: '86' },
  { alpha2: 'JP', name: 'Japan', dialCode: '81' },
  { alpha2: 'KR', name: 'South Korea', dialCode: '82' },
  { alpha2: 'SG', name: 'Singapore', dialCode: '65' },
  { alpha2: 'MY', name: 'Malaysia', dialCode: '60' },
  { alpha2: 'TH', name: 'Thailand', dialCode: '66' },
  { alpha2: 'ID', name: 'Indonesia', dialCode: '62' },
  { alpha2: 'PH', name: 'Philippines', dialCode: '63' },
  { alpha2: 'VN', name: 'Vietnam', dialCode: '84' },
  { alpha2: 'AU', name: 'Australia', dialCode: '61' },
  { alpha2: 'NZ', name: 'New Zealand', dialCode: '64' },
  { alpha2: 'BR', name: 'Brazil', dialCode: '55' },
  { alpha2: 'AR', name: 'Argentina', dialCode: '54' },
  { alpha2: 'MX', name: 'Mexico', dialCode: '52' },
  { alpha2: 'CL', name: 'Chile', dialCode: '56' },
];

export const COUNTRY_CODES_BY_ALPHA2: Record<string, CountryCode> = Object.fromEntries(
  COUNTRY_CODES.map((c) => [c.alpha2, c]),
);

/** Joins a dial code + local number (as typed, spaces/leading zero allowed)
 * into an E.164 string for the traveler/booking domain schemas to validate. */
export function toE164(dialCode: string, localNumber: string): string {
  const digits = localNumber.trim().replace(/[^\d]/g, '').replace(/^0+/, '');
  return `+${dialCode}${digits}`;
}
