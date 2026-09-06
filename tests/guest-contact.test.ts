import { describe, it, expect } from 'vitest';
import { isAnonymousPlaceholderEmail, resolveGuestContact } from '../src/lib/guest-contact';

/**
 * The chain every guest-facing email now resolves through. It was hand-copied
 * into invoicing, visa and ratings before it lived in one place, and the three
 * copies are exactly why the same bug kept reappearing (DR-215 payment
 * receipts, DR-223 visa decisions, then the quotation emails). These lock the
 * ordering down so a future edit can't quietly reintroduce it.
 */
const PLACEHOLDER = 'temp@uhjqu11uap3izad6dbfyahhudvydih5f.com';

const tourist = { email: PLACEHOLDER, phone: '+264810000000', preferredLocale: 'EN' as const };

describe('resolveGuestContact', () => {
  it("prefers the tour lead's own email over everything else", () => {
    const contact = resolveGuestContact({
      booking: { contactEmail: 'booking@example.test' },
      travelers: [
        { isTourLead: false, email: 'other@example.test', phone: null },
        { isTourLead: true, email: 'lead@example.test', phone: '+264811111111' },
      ],
      tourist,
    });
    expect(contact.email).toBe('lead@example.test');
    expect(contact.phone).toBe('+264811111111');
  });

  it('falls back to the booking contact email when there is no tour lead', () => {
    const contact = resolveGuestContact({
      booking: { contactEmail: 'booking@example.test' },
      travelers: [],
      tourist,
    });
    expect(contact.email).toBe('booking@example.test');
  });

  it('reaches the anonymous placeholder only when nothing real exists', () => {
    const contact = resolveGuestContact({ booking: { contactEmail: null }, travelers: [], tourist });
    expect(contact.email).toBe(PLACEHOLDER);
    expect(isAnonymousPlaceholderEmail(contact.email)).toBe(true);
  });

  it('never returns the placeholder when a real address is on the booking', () => {
    const contact = resolveGuestContact({
      booking: { contactEmail: 'booking@example.test' },
      travelers: [],
      tourist,
    });
    expect(isAnonymousPlaceholderEmail(contact.email)).toBe(false);
  });

  it('ignores a tour lead with no email rather than treating it as a match', () => {
    const contact = resolveGuestContact({
      booking: { contactEmail: 'booking@example.test' },
      travelers: [{ isTourLead: true, email: null, phone: null }],
      tourist,
    });
    expect(contact.email).toBe('booking@example.test');
  });

  it('returns null email when there is no address anywhere, so callers can fall back', () => {
    const contact = resolveGuestContact({
      booking: { contactEmail: null },
      travelers: [],
      tourist: { email: null, phone: null, preferredLocale: 'EN' },
    });
    expect(contact.email).toBeNull();
  });

  it("carries the tourist's locale, defaulting to EN when there is no user row", () => {
    expect(resolveGuestContact({ booking: { contactEmail: 'a@b.test' }, travelers: [], tourist }).locale).toBe('EN');
    expect(
      resolveGuestContact({
        booking: { contactEmail: 'a@b.test' },
        travelers: [],
        tourist: { ...tourist, preferredLocale: 'FR' },
      }).locale,
    ).toBe('FR');
    expect(resolveGuestContact({ booking: { contactEmail: 'a@b.test' }, travelers: [], tourist: null }).locale).toBe('EN');
  });
});
