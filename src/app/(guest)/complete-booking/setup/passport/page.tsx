import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { bookingService } from '@modules/booking';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { FormField } from '@/components/ui/FormField';
import { Reveal } from '@/components/ui/Reveal';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { getBookingWizardSteps } from '../../../booking-wizard-steps';
import { currentSetupBookingId, uploadPassportAction } from '../../actions';

export const metadata: Metadata = { robots: { index: false, follow: false } };

interface Props {
  searchParams: Promise<{ error?: string }>;
}

// One traveller at a time, looping until none are left -- same shape as the
// session-gated booking/[bookingId]/passport page.
export default async function SetupPassportPage({ searchParams }: Props) {
  const bookingId = await currentSetupBookingId();
  if (!bookingId) redirect('/complete-booking');

  const { error } = await searchParams;
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
        {error === 'missing_file' && (
          <div className="mt-3">
            <Alert tone="error">{t('choosePdfFile')}</Alert>
          </div>
        )}
        <form action={uploadPassportAction.bind(null, nextTraveler.id)} className="mt-6 space-y-4">
          <FormField label={t('passportPdfLabel')} htmlFor="passport">
            <input
              type="file"
              name="passport"
              accept="application/pdf"
              required
              className="w-full rounded-survey border border-rule px-3 py-2 file:mr-3 file:rounded-pill file:border-0 file:bg-amber/10 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-navy"
            />
          </FormField>
          <SubmitButton pendingLabel={t('uploading')}>{t('uploadAndContinue')}</SubmitButton>
        </form>
      </div>
    </Reveal>
  );
}
