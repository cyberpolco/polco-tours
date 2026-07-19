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

  // Additional African states
  { alpha2: 'SD', name: 'Sudan', dialCode: '249' },
  { alpha2: 'SS', name: 'South Sudan', dialCode: '211' },
  { alpha2: 'SO', name: 'Somalia', dialCode: '252' },
  { alpha2: 'DJ', name: 'Djibouti', dialCode: '253' },
  { alpha2: 'ER', name: 'Eritrea', dialCode: '291' },
  { alpha2: 'LY', name: 'Libya', dialCode: '218' },
  { alpha2: 'TD', name: 'Chad', dialCode: '235' },
  { alpha2: 'NE', name: 'Niger', dialCode: '227' },
  { alpha2: 'ML', name: 'Mali', dialCode: '223' },
  { alpha2: 'BF', name: 'Burkina Faso', dialCode: '226' },
  { alpha2: 'MR', name: 'Mauritania', dialCode: '222' },
  { alpha2: 'GM', name: 'Gambia', dialCode: '220' },
  { alpha2: 'GW', name: 'Guinea-Bissau', dialCode: '245' },
  { alpha2: 'GN', name: 'Guinea', dialCode: '224' },
  { alpha2: 'SL', name: 'Sierra Leone', dialCode: '232' },
  { alpha2: 'LR', name: 'Liberia', dialCode: '231' },
  { alpha2: 'TG', name: 'Togo', dialCode: '228' },
  { alpha2: 'BJ', name: 'Benin', dialCode: '229' },
  { alpha2: 'GA', name: 'Gabon', dialCode: '241' },
  { alpha2: 'GQ', name: 'Equatorial Guinea', dialCode: '240' },
  { alpha2: 'CF', name: 'Central African Republic', dialCode: '236' },
  { alpha2: 'BI', name: 'Burundi', dialCode: '257' },
  { alpha2: 'MG', name: 'Madagascar', dialCode: '261' },
  { alpha2: 'MU', name: 'Mauritius', dialCode: '230' },
  { alpha2: 'SC', name: 'Seychelles', dialCode: '248' },
  { alpha2: 'KM', name: 'Comoros', dialCode: '269' },
  { alpha2: 'CV', name: 'Cabo Verde', dialCode: '238' },
  { alpha2: 'ST', name: 'Sao Tome and Principe', dialCode: '239' },

  // Middle East
  { alpha2: 'JO', name: 'Jordan', dialCode: '962' },
  { alpha2: 'LB', name: 'Lebanon', dialCode: '961' },
  { alpha2: 'SY', name: 'Syria', dialCode: '963' },
  { alpha2: 'IQ', name: 'Iraq', dialCode: '964' },
  { alpha2: 'IR', name: 'Iran', dialCode: '98' },
  { alpha2: 'KW', name: 'Kuwait', dialCode: '965' },
  { alpha2: 'QA', name: 'Qatar', dialCode: '974' },
  { alpha2: 'BH', name: 'Bahrain', dialCode: '973' },
  { alpha2: 'OM', name: 'Oman', dialCode: '968' },
  { alpha2: 'YE', name: 'Yemen', dialCode: '967' },
  { alpha2: 'PS', name: 'Palestine', dialCode: '970' },

  // Additional Asian states
  { alpha2: 'BD', name: 'Bangladesh', dialCode: '880' },
  { alpha2: 'LK', name: 'Sri Lanka', dialCode: '94' },
  { alpha2: 'NP', name: 'Nepal', dialCode: '977' },
  { alpha2: 'BT', name: 'Bhutan', dialCode: '975' },
  { alpha2: 'MM', name: 'Myanmar', dialCode: '95' },
  { alpha2: 'KH', name: 'Cambodia', dialCode: '855' },
  { alpha2: 'LA', name: 'Laos', dialCode: '856' },
  { alpha2: 'MN', name: 'Mongolia', dialCode: '976' },
  { alpha2: 'TW', name: 'Taiwan', dialCode: '886' },
  { alpha2: 'HK', name: 'Hong Kong', dialCode: '852' },
  { alpha2: 'MO', name: 'Macau', dialCode: '853' },
  { alpha2: 'AF', name: 'Afghanistan', dialCode: '93' },
  { alpha2: 'KZ', name: 'Kazakhstan', dialCode: '7' },
  { alpha2: 'UZ', name: 'Uzbekistan', dialCode: '998' },
  { alpha2: 'TM', name: 'Turkmenistan', dialCode: '993' },
  { alpha2: 'KG', name: 'Kyrgyzstan', dialCode: '996' },
  { alpha2: 'TJ', name: 'Tajikistan', dialCode: '992' },
  { alpha2: 'MV', name: 'Maldives', dialCode: '960' },
  { alpha2: 'BN', name: 'Brunei', dialCode: '673' },
  { alpha2: 'TL', name: 'Timor-Leste', dialCode: '670' },

  // Additional European states
  { alpha2: 'IS', name: 'Iceland', dialCode: '354' },
  { alpha2: 'HU', name: 'Hungary', dialCode: '36' },
  { alpha2: 'SK', name: 'Slovakia', dialCode: '421' },
  { alpha2: 'SI', name: 'Slovenia', dialCode: '386' },
  { alpha2: 'HR', name: 'Croatia', dialCode: '385' },
  { alpha2: 'RS', name: 'Serbia', dialCode: '381' },
  { alpha2: 'BA', name: 'Bosnia and Herzegovina', dialCode: '387' },
  { alpha2: 'ME', name: 'Montenegro', dialCode: '382' },
  { alpha2: 'MK', name: 'North Macedonia', dialCode: '389' },
  { alpha2: 'AL', name: 'Albania', dialCode: '355' },
  { alpha2: 'BG', name: 'Bulgaria', dialCode: '359' },
  { alpha2: 'MD', name: 'Moldova', dialCode: '373' },
  { alpha2: 'BY', name: 'Belarus', dialCode: '375' },
  { alpha2: 'LT', name: 'Lithuania', dialCode: '370' },
  { alpha2: 'LV', name: 'Latvia', dialCode: '371' },
  { alpha2: 'EE', name: 'Estonia', dialCode: '372' },
  { alpha2: 'MT', name: 'Malta', dialCode: '356' },
  { alpha2: 'CY', name: 'Cyprus', dialCode: '357' },
  { alpha2: 'MC', name: 'Monaco', dialCode: '377' },
  { alpha2: 'AD', name: 'Andorra', dialCode: '376' },
  { alpha2: 'SM', name: 'San Marino', dialCode: '378' },
  { alpha2: 'LI', name: 'Liechtenstein', dialCode: '423' },
  { alpha2: 'VA', name: 'Vatican City', dialCode: '379' },
  { alpha2: 'XK', name: 'Kosovo', dialCode: '383' },

  // Additional Americas
  { alpha2: 'CO', name: 'Colombia', dialCode: '57' },
  { alpha2: 'PE', name: 'Peru', dialCode: '51' },
  { alpha2: 'VE', name: 'Venezuela', dialCode: '58' },
  { alpha2: 'EC', name: 'Ecuador', dialCode: '593' },
  { alpha2: 'BO', name: 'Bolivia', dialCode: '591' },
  { alpha2: 'PY', name: 'Paraguay', dialCode: '595' },
  { alpha2: 'UY', name: 'Uruguay', dialCode: '598' },
  { alpha2: 'GY', name: 'Guyana', dialCode: '592' },
  { alpha2: 'SR', name: 'Suriname', dialCode: '597' },
  { alpha2: 'PA', name: 'Panama', dialCode: '507' },
  { alpha2: 'CR', name: 'Costa Rica', dialCode: '506' },
  { alpha2: 'NI', name: 'Nicaragua', dialCode: '505' },
  { alpha2: 'HN', name: 'Honduras', dialCode: '504' },
  { alpha2: 'SV', name: 'El Salvador', dialCode: '503' },
  { alpha2: 'GT', name: 'Guatemala', dialCode: '502' },
  { alpha2: 'BZ', name: 'Belize', dialCode: '501' },
  { alpha2: 'CU', name: 'Cuba', dialCode: '53' },
  { alpha2: 'HT', name: 'Haiti', dialCode: '509' },
  { alpha2: 'DO', name: 'Dominican Republic', dialCode: '1' },
  { alpha2: 'JM', name: 'Jamaica', dialCode: '1' },
  { alpha2: 'TT', name: 'Trinidad and Tobago', dialCode: '1' },
  { alpha2: 'BS', name: 'Bahamas', dialCode: '1' },
  { alpha2: 'BB', name: 'Barbados', dialCode: '1' },
  { alpha2: 'AG', name: 'Antigua and Barbuda', dialCode: '1' },
  { alpha2: 'LC', name: 'Saint Lucia', dialCode: '1' },
  { alpha2: 'VC', name: 'Saint Vincent and the Grenadines', dialCode: '1' },
  { alpha2: 'GD', name: 'Grenada', dialCode: '1' },
  { alpha2: 'DM', name: 'Dominica', dialCode: '1' },
  { alpha2: 'KN', name: 'Saint Kitts and Nevis', dialCode: '1' },

  // Additional Oceania
  { alpha2: 'FJ', name: 'Fiji', dialCode: '679' },
  { alpha2: 'PG', name: 'Papua New Guinea', dialCode: '675' },
  { alpha2: 'WS', name: 'Samoa', dialCode: '685' },
  { alpha2: 'TO', name: 'Tonga', dialCode: '676' },
  { alpha2: 'VU', name: 'Vanuatu', dialCode: '678' },
  { alpha2: 'SB', name: 'Solomon Islands', dialCode: '677' },
  { alpha2: 'KI', name: 'Kiribati', dialCode: '686' },
  { alpha2: 'TV', name: 'Tuvalu', dialCode: '688' },
  { alpha2: 'NR', name: 'Nauru', dialCode: '674' },
  { alpha2: 'PW', name: 'Palau', dialCode: '680' },
  { alpha2: 'MH', name: 'Marshall Islands', dialCode: '692' },
  { alpha2: 'FM', name: 'Micronesia', dialCode: '691' },
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

/** Reverses toE164 -- splits a stored E.164 number back into a
 * {dialCode, localNumber} pair for prefilling a dialCode-select +
 * localNumber-input pair (e.g. the tour lead's phone, carried over from an
 * earlier step). Tries the longest matching dial code first (several
 * countries share a 1-digit code like '1', so the longest-prefix match is
 * the only way to avoid guessing wrong on the 2-3 digit ones). Returns null
 * if the number doesn't start with '+' or matches no known dial code. */
export function parseE164(phone: string): { dialCode: string; localNumber: string } | null {
  if (!phone.startsWith('+')) return null;
  const digits = phone.slice(1);
  const dialCodes = [...new Set(COUNTRY_CODES.map((c) => c.dialCode))].sort((a, b) => b.length - a.length);
  const dialCode = dialCodes.find((code) => digits.startsWith(code));
  if (!dialCode) return null;
  return { dialCode, localNumber: digits.slice(dialCode.length) };
}
