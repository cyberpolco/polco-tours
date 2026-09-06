import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { bookingService } from '@modules/booking';
import { BackLink } from '@/components/ui/BackLink';
import { Reveal } from '@/components/ui/Reveal';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { getBookingWizardSteps } from '../../../booking-wizard-steps';
import { currentSetupBookingId, recordPassportAction } from '../../actions';
import { PassportUploadForm } from '../../../passport-upload-form';

export const metadata: Metadata = { robots: { index: false, follow: false } };

// One traveller at a time, looping until none are left -- same shape as the
// session-gated booking/[bookingId]/passport page.
export default async function SetupPassportPage() {
  const bookingId = await currentSetupBookingId();
  if (!bookingId) redirect('/complete-booking');

  const [booking, travelers] = await Promise.all([
    bookingService.getForBookingSetup(bookingId),
    bookingService.listTravelersForBookingSetup(bookingId),
  ]);

  if (travelers.length < booking.seats) redirect('/complete-booking/setup/travelers');
  if (!booking.requiresPassportUpload) redirect('/complete-booking/setup');
  const nextTraveler = travelers.find((traveler) => !traveler.passportDocumentId);
  if (!nextTraveler) redirect('/complete-booking/setup');

  const remaining = travelers.filter((traveler) => !traveler.passportDocumentId).length;
  const t = await getTranslations('PassportPage');

  return (
    <Reveal>
      <div className="mx-auto max-w-md">
        <BackLink href="/complete-booking/setup">{t('backToTravelers')}</BackLink>
        <StepIndicator steps={await getBookingWizardSteps(true)} currentIndex={3} variant="checklist" />
        <p className="eyebrow mt-4 text-mist">{t('setupPassport')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">
          {t('passportTitle', { firstName: nextTraveler.firstName, lastName: nextTraveler.lastName })}
        </h1>
        <p className="mt-1 text-sm text-mist">{t('uploadNotice', { remaining, total: travelers.length })}</p>
        <PassportUploadForm
          recordAction={recordPassportAction.bind(null, nextTraveler.id)}
          nextHref={remaining > 1 ? '/complete-booking/setup/passport' : '/complete-booking/setup'}
        />
      </div>
    </Reveal>
  );
}
