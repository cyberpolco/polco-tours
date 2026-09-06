import type { Locale } from '@prisma/client';

// How to actually reach a guest by email/SMS.
//
// A guest checkout has no real account: bookings ride better-auth's
// anonymous plugin, which fills `User.email` with an undeliverable
// `temp@<random>.com` placeholder. So notify()'s usual User-lookup chain
// silently mails a domain that does not exist -- the bug behind DR-215
// (payment receipts), DR-223 (visa decisions) and the quotation emails.
//
// The real address is whatever the guest typed: the tour lead Traveler's
// own email for a PREDEFINED_PACKAGE booking (DR-194), or
// Booking.contactEmail for a TAILOR_MADE request. `User.email` stays last
// in the chain only so a staff-created booking (a real account, real
// address) still resolves.
//
// This was hand-copied into invoicing, visa and ratings before it lived
// anywhere; one definition so the chain can't drift between them.

export interface GuestContactSources {
  booking: { contactEmail: string | null };
  travelers: readonly { isTourLead: boolean; email: string | null; phone: string | null }[];
  tourist: { email: string | null; phone: string | null; preferredLocale: Locale } | null;
}

export interface GuestContact {
  email: string | null;
  phone: string | null;
  locale: Locale;
}

export function resolveGuestContact({ booking, travelers, tourist }: GuestContactSources): GuestContact {
  const lead = travelers.find((traveler) => traveler.isTourLead);
  return {
    email: lead?.email ?? booking.contactEmail ?? tourist?.email ?? null,
    phone: lead?.phone ?? tourist?.phone ?? null,
    locale: tourist?.preferredLocale ?? 'EN',
  };
}

/** True for better-auth's anonymous-plugin placeholder. Only used to keep
 * the tests honest about what the bug actually looked like -- production
 * code should never need to branch on this, since resolveGuestContact
 * already prefers a real address over it. */
export function isAnonymousPlaceholderEmail(email: string | null): boolean {
  return email !== null && /^temp@[a-z0-9]+\.com$/i.test(email);
}
