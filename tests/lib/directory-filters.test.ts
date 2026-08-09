import { describe, it, expect } from 'vitest';
import {
  emailDomain,
  listEmailDomains,
  listPhoneDialCodes,
  matchesPhoneDialCode,
  matchesSearch,
  paginate,
} from '../../src/lib/directory-filters';

describe('emailDomain', () => {
  it('extracts and lowercases the domain', () => {
    expect(emailDomain('Lam@CyberPolco.com')).toBe('cyberpolco.com');
  });

  it('returns null for a string with no @', () => {
    expect(emailDomain('not-an-email')).toBeNull();
  });
});

describe('listEmailDomains', () => {
  it('returns distinct domains actually present, sorted alphabetically', () => {
    const people = [
      { name: null, email: 'a@yahoo.com', phone: null },
      { name: null, email: 'b@gmail.com', phone: null },
      { name: null, email: 'c@gmail.com', phone: null },
    ];
    expect(listEmailDomains(people)).toEqual(['gmail.com', 'yahoo.com']);
  });

  it('never invents a domain that is not actually in the data', () => {
    const people = [{ name: null, email: 'a@cyberpolco.com', phone: null }];
    expect(listEmailDomains(people)).toEqual(['cyberpolco.com']);
  });
});

describe('listPhoneDialCodes', () => {
  it('returns distinct dial codes present, sorted numerically, with a country label', () => {
    const people = [
      { name: null, email: 'a@x.com', phone: '+264811234567' }, // Namibia
      { name: null, email: 'b@x.com', phone: '+27821234567' }, // South Africa
      { name: null, email: 'c@x.com', phone: null },
      { name: null, email: 'd@x.com', phone: 'not-a-phone' },
    ];
    const result = listPhoneDialCodes(people);
    expect(result.map((r) => r.dialCode)).toEqual(['27', '264']);
    expect(result[0]?.label).toContain('South Africa');
    expect(result[1]?.label).toContain('Namibia');
  });

  it('labels a dial code shared by multiple countries with a "+N more" suffix', () => {
    const people = [{ name: null, email: 'a@x.com', phone: '+12025550123' }]; // +1: US/CA/... share this
    const result = listPhoneDialCodes(people);
    expect(result).toHaveLength(1);
    expect(result[0]?.label).toMatch(/\+1 \(.+\+\d+ more\)/);
  });
});

describe('matchesPhoneDialCode', () => {
  it('matches when the phone parses to the given dial code', () => {
    expect(matchesPhoneDialCode({ name: null, email: 'a@x.com', phone: '+264811234567' }, '264')).toBe(true);
  });

  it('does not match a different dial code', () => {
    expect(matchesPhoneDialCode({ name: null, email: 'a@x.com', phone: '+264811234567' }, '27')).toBe(false);
  });

  it('does not match when there is no phone at all', () => {
    expect(matchesPhoneDialCode({ name: null, email: 'a@x.com', phone: null }, '264')).toBe(false);
  });
});

describe('matchesSearch', () => {
  const person = { name: 'Jane Doe', email: 'jane@cyberpolco.com', phone: '+264811234567' };

  it('matches (case-insensitively) against name, email, or phone', () => {
    expect(matchesSearch(person, 'jane')).toBe(true);
    expect(matchesSearch(person, 'CYBERPOLCO')).toBe(true);
    expect(matchesSearch(person, '811234')).toBe(true);
  });

  it('matches everything when the query is empty', () => {
    expect(matchesSearch(person, '')).toBe(true);
    expect(matchesSearch(person, '   ')).toBe(true);
  });

  it('does not match an unrelated query', () => {
    expect(matchesSearch(person, 'nope')).toBe(false);
  });

  it('does not blow up on a null name/phone', () => {
    expect(matchesSearch({ name: null, email: 'a@x.com', phone: null }, 'a@x')).toBe(true);
    expect(matchesSearch({ name: null, email: 'a@x.com', phone: null }, 'nope')).toBe(false);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it('slices the requested page at the given page size', () => {
    const result = paginate(items, 1, 10);
    expect(result.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(3);
    expect(result.totalItems).toBe(25);
  });

  it('returns the last (partial) page correctly', () => {
    const result = paginate(items, 3, 10);
    expect(result.items).toEqual([21, 22, 23, 24, 25]);
  });

  it('clamps a page number beyond the last page to the last page', () => {
    const result = paginate(items, 999, 10);
    expect(result.page).toBe(3);
    expect(result.items).toEqual([21, 22, 23, 24, 25]);
  });

  it('clamps a page number below 1 up to 1', () => {
    const result = paginate(items, 0, 10);
    expect(result.page).toBe(1);
  });

  it('treats a non-numeric page as page 1', () => {
    const result = paginate(items, Number('not-a-number'), 10);
    expect(result.page).toBe(1);
  });

  it('an empty list is one (empty) page, not zero', () => {
    const result = paginate([], 1, 10);
    expect(result.totalPages).toBe(1);
    expect(result.items).toEqual([]);
  });
});
