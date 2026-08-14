// DR-108/DR-111: turns an AWAITING_QUOTATION TAILOR_MADE request into a
// real, reusable DRAFT TourPackage, prefilled from the guest's own
// plan-my-trip answers. Composes booking + catalog here, one level up from
// both modules -- same convention as fleet-availability.ts/client-deletion.ts
// -- rather than inside either module's service. Shared by the manual
// "Create customized package" button and the auto-trigger that fires once a
// tailor-made booking's traveler/passport setup finishes (DR-111), so the
// composition logic exists in exactly one place.
import type { AuthContext } from '@modules/auth';
import { bookingService } from '@modules/booking';
import { catalogService, type TourPackageView } from '@modules/catalog';

export async function createCustomizedPackageFromBooking(ctx: AuthContext, bookingId: string): Promise<TourPackageView> {
  const booking = await bookingService.getById(ctx, bookingId);

  const country = booking.customCountry ?? booking.preferredCountries[0];
  if (!country) throw new Error('This request has no destination country to create a package for');

  let durationDays: number | undefined;
  if (booking.customTravelStart && booking.customTravelEnd) {
    const days = Math.round((booking.customTravelEnd.getTime() - booking.customTravelStart.getTime()) / 86_400_000) + 1;
    if (days > 0) durationDays = days;
  }

  const sections: string[] = [`Travelers: ${booking.seats}`];
  if (booking.preferredSites.length > 0) sections.push(`Preferred sites: ${booking.preferredSites.join(', ')}`);
  if (booking.preferredAddons.length > 0) sections.push(`Requested add-ons: ${booking.preferredAddons.join(', ')}`);
  if (booking.specialRequests) sections.push(`Special requests: ${booking.specialRequests}`);
  const contactName = [booking.contactFirstName, booking.contactLastName].filter(Boolean).join(' ');
  if (contactName || booking.contactEmail) {
    sections.push(`Contact: ${contactName}${booking.contactEmail ? ` (${booking.contactEmail})` : ''}`);
  }
  const description = [booking.customDescription?.trim(), ...sections].filter(Boolean).join('\n\n');

  const pkg = await catalogService.createPackage(ctx, {
    title: `Tailor-made trip -- ${booking.bookingReference}`,
    description,
    country,
    currency: 'USD',
    durationDays,
    tags: booking.preferredTags,
  });
  await bookingService.setCustomizedPackage(ctx, bookingId, pkg.id);
  return pkg;
}
