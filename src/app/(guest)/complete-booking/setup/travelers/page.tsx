import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { authService } from '@modules/auth';
import { bookingService } from '@modules/booking';
import { parseE164 } from '@lib/country-codes';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { Reveal } from '@/components/ui/Reveal';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { getBookingWizardSteps } from '../../../booking-wizard-steps';
import { TravelerForm } from '../../../traveler-form';
import { addTravelerAction, currentSetupBookingId } from '../../actions';

export const metadata: Metadata = { robots: { index: false, follow: false } };

interface Props {
  searchParams: Promise<{ error?: string }>;
}

// The guest twin of booking/[bookingId]/travelers/new -- same TravelerForm,
// same step indicator; only the way in differs (a signed setup cookie rather
// than a live session).
export default async function SetupTravelersPage({ searchParams }: Props) {
  const bookingId = await currentSetupBookingId();
  if (!bookingId) redirect('/complete-booking');

  const { error } = await searchParams;
  const t = await getTranslations('TravelersPage');
  const [booking, travelers] = await Promise.all([
    bookingService.getForBookingSetup(bookingId),
    bookingService.listTravelersForBookingSetup(bookingId),
  ]);

  // Unlike the session-gated wizard, this flow does NOT force the add-ons
  // step first. A booking arriving here was priced by staff as a quotation
  // the guest has just accepted, so re-picking priced add-ons would change
  // an already-agreed price -- see the DR-257 follow-up. Passports still
  // only apply if staff's own setup already flagged requiresPassportUpload.
  if (travelers.length >= booking.seats) redirect('/complete-booking/setup');

  const hasTourLead = travelers.some((traveler) => traveler.isTourLead);
  const isAddingTourLead = !hasTourLead;
  const travelerNumber = travelers.length + 1;

  // The tour lead's name came off the plan-my-trip contact step and their
  // phone was written onto the anonymous tourist record at the same time --
  // prefill both rather than making them retype what they already told us.
  // (BookingView carries contactFirstName/LastName/Email but no phone, which
  // is why this reads the user row, same as the session-gated page does.)
  const tourist = isAddingTourLead ? await authService.getUser(booking.touristUserId) : null;
  const parsedPhone = tourist?.phone ? parseE164(tourist.phone) : null;

  return (
    <Reveal>
      <div className="mx-auto max-w-lg">
        <BackLink href="/complete-booking/setup">{t('setupTravelers')}</BackLink>
        <StepIndicator steps={await getBookingWizardSteps(booking.requiresPassportUpload)} currentIndex={2} variant="checklist" />
        <p className="eyebrow mt-4 text-mist">{t('setupTravelers')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{t('travelerOf', { number: travelerNumber, total: booking.seats })}</h1>
        <p className="mt-1 text-sm text-mist">{t('enteredOf', { current: travelers.length, total: booking.seats })}</p>

        {error === 'email_in_use' && (
          <div className="mt-4">
            <Alert tone="error">{t('emailInUse')}</Alert>
          </div>
        )}

        <TravelerForm
          action={addTravelerAction}
          isAddingTourLead={isAddingTourLead}
          hasTourLead={hasTourLead}
          travelerNumber={travelerNumber}
          seats={booking.seats}
          prefill={
            isAddingTourLead
              ? {
                  firstName: booking.contactFirstName ?? '',
                  lastName: booking.contactLastName ?? '',
                  dialCode: parsedPhone?.dialCode,
                  localNumber: parsedPhone?.localNumber,
                }
              : undefined
          }
        />
      </div>
    </Reveal>
  );
}
