// Shared search/filter/pagination helpers for the staff admin Users and
// Clients directories -- both list a bounded (staff-headcount/client-list
// scale) set of User rows and need the same things: derive filter option
// lists from whatever's actually in the data (never a fixed guess-list of
// "common" email providers), match free-text search, and paginate. Pure,
// no framework/DB import (same domain.ts-shape convention as every module).
import { COUNTRY_CODES, parseE164 } from './country-codes';

export interface DirectoryPerson {
  name: string | null;
  email: string;
  phone: string | null;
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  return at === -1 ? null : email.slice(at + 1).toLowerCase();
}

/** Distinct domains actually present, sorted alphabetically -- the filter
 * dropdown only ever offers choices that exist in the data, never a fixed
 * list of "common" providers guessed in advance. */
export function listEmailDomains(people: DirectoryPerson[]): string[] {
  const domains = new Set<string>();
  for (const p of people) {
    const d = emailDomain(p.email);
    if (d) domains.add(d);
  }
  return [...domains].sort();
}

export interface DialCodeOption {
  dialCode: string;
  label: string; // "+264 (Namibia)" or "+1 (US +12 more)" for a shared code
}

const DIAL_CODE_TO_NAMES: Record<string, string[]> = {};
for (const c of COUNTRY_CODES) {
  (DIAL_CODE_TO_NAMES[c.dialCode] ??= []).push(c.name);
}

function dialCodeLabel(dialCode: string): string {
  const names = DIAL_CODE_TO_NAMES[dialCode] ?? [];
  if (names.length === 0) return `+${dialCode}`;
  if (names.length === 1) return `+${dialCode} (${names[0]})`;
  return `+${dialCode} (${names[0]} +${names.length - 1} more)`;
}

/** Distinct dial codes actually present among people's phone numbers,
 * sorted numerically. Several countries share a dial code (e.g. +1 for
 * US/CA/JM/...), so this filters by dial code, not a single disambiguated
 * country -- parseE164 can't tell those apart from the number alone. */
export function listPhoneDialCodes(people: DirectoryPerson[]): DialCodeOption[] {
  const codes = new Set<string>();
  for (const p of people) {
    if (!p.phone) continue;
    const parsed = parseE164(p.phone);
    if (parsed) codes.add(parsed.dialCode);
  }
  return [...codes].sort((a, b) => Number(a) - Number(b)).map((dialCode) => ({ dialCode, label: dialCodeLabel(dialCode) }));
}

export function matchesPhoneDialCode(person: DirectoryPerson, dialCode: string): boolean {
  if (!person.phone) return false;
  const parsed = parseE164(person.phone);
  return parsed?.dialCode === dialCode;
}

export function matchesSearch(person: DirectoryPerson, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (person.name?.toLowerCase().includes(q) ?? false) ||
    person.email.toLowerCase().includes(q) ||
    (person.phone?.toLowerCase().includes(q) ?? false)
  );
}

export interface PaginatedResult<T> {
  items: T[];
  page: number; // clamped to [1, totalPages]
  totalPages: number;
  totalItems: number;
}

/** Clamps an out-of-range page number rather than returning an empty page
 * or throwing -- a stale bookmarked ?page=9 after a filter narrows the
 * result set should just show the last real page, not nothing. */
export function paginate<T>(items: T[], requestedPage: number, perPage: number): PaginatedResult<T> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const page = Math.min(Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1), totalPages);
  const start = (page - 1) * perPage;
  return { items: items.slice(start, start + perPage), page, totalPages, totalItems };
}
