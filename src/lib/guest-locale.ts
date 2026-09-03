import { cookies } from 'next/headers';
import type { Locale } from '@prisma/client';

/**
 * Maps the guest-facing `locale` cookie (seeded by src/middleware.ts, set
 * explicitly by the language-switcher's set-locale-action.ts -- 'en'|'fr',
 * see src/i18n/request.ts) to the Prisma `Locale` enum, so a guest booking
 * action can snapshot which language the guest was actually browsing/
 * booking in onto their own User.preferredLocale -- the field notify()/
 * notifyEmail() read to pick which language a booking/payment/visa
 * notification renders in (notifications/service.ts).
 *
 * Real gap this closes: nothing ever wrote this before -- every guest
 * checkout's User row kept preferredLocale at its schema default (EN)
 * forever, so a guest who booked entirely in French still got every
 * automated email in English. Returns undefined for a missing/unrecognized
 * cookie so a caller can spread this into an UpdateProfileInput and leave
 * an existing value untouched (Prisma drops undefined data fields) rather
 * than accidentally resetting it.
 */
export async function resolveGuestPreferredLocale(): Promise<Locale | undefined> {
  const value = (await cookies()).get('locale')?.value;
  if (value === 'fr') return 'FR';
  if (value === 'en') return 'EN';
  return undefined;
}
