import { describe, it, expect } from 'vitest';
import { parseE164, toE164 } from '../../src/lib/country-codes';

describe('toE164', () => {
  it('joins a dial code and local number, stripping a leading zero', () => {
    expect(toE164('264', '0811234567')).toBe('+264811234567');
  });

  it('strips non-digit characters from the local number', () => {
    expect(toE164('264', '81 123 4567')).toBe('+264811234567');
  });
});

describe('parseE164', () => {
  it('returns null for a number missing the leading +', () => {
    expect(parseE164('264811234567')).toBeNull();
  });

  it('returns null when no known dial code matches', () => {
    expect(parseE164('+999999999999')).toBeNull();
  });

  it('splits a Namibian number back into dialCode + localNumber', () => {
    expect(parseE164('+264811234567')).toEqual({ dialCode: '264', localNumber: '811234567' });
  });

  it('prefers the longest matching dial code (e.g. 353 over a shorter false-positive prefix)', () => {
    expect(parseE164('+353871234567')).toEqual({ dialCode: '353', localNumber: '871234567' });
  });

  it('round-trips with toE164', () => {
    const e164 = toE164('264', '0811234567');
    expect(parseE164(e164)).toEqual({ dialCode: '264', localNumber: '811234567' });
  });
});
