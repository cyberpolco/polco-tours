import { generateBookingReference } from '../../src/modules/booking';
import { prisma, withOrg } from '../../src/lib/db';

/**
 * Seeds a TAILOR_MADE booking already at QUOTATION_SENT -- the state a real
 * guest lands in from the quotation email's CTA (DR-257). No Traveler
 * manifest exists yet (the whole point of the flow this backs), so the
 * three-factor verify step falls back to Booking.contactLastName/
 * contactEmail, same DR-057 fallback bookingService.verifyForBookingSetup
 * itself uses. Tenant-scoped tables MUST go through withOrg -- RLS is live
 * for the app under test, same as every other e2e fixture.
 */
export async function seedQuotedTailorMadeBooking(): Promise<{
  bookingReference: string;
  contactLastName: string;
  contactEmail: string;
}> {
  const org = await prisma.organization.findFirstOrThrow({ where: { isPrimary: true } });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const contactLastName = 'Quoted';
  const contactEmail = `e2e-complete-booking-${suffix}@example.test`;

  // A real phone on the tourist record so the travelers step's own
  // required phone input is prefilled (parsedPhone in
  // complete-booking/setup/travelers/page.tsx) -- there is no earlier
  // "your details" step in this flow (unlike the session-gated wizard) to
  // collect it first.
  const tourist = await prisma.user.create({
    data: {
      email: `e2e-cb-tourist-${suffix}@example.test`,
      role: 'TOURIST',
      organizationId: org.id,
      emailVerified: true,
      phone: '+264811234567',
    },
  });

  const bookingReference = generateBookingReference();
  await withOrg(org.id, (tx) =>
    tx.booking.create({
      data: {
        organizationId: org.id,
        origin: 'TAILOR_MADE',
        touristUserId: tourist.id,
        seats: 1,
        bookingReference,
        customCountry: 'NA',
        status: 'QUOTATION_SENT',
        priceMinor: 50000,
        currency: 'USD',
        contactFirstName: 'Quote',
        contactLastName,
        contactEmail,
      },
    }),
  );

  return { bookingReference, contactLastName, contactEmail };
}
