import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireGuestContext } from '@lib/guest-guard';
import { bookingService } from '@modules/booking';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { FormField } from '@/components/ui/FormField';
import { Reveal } from '@/components/ui/Reveal';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { getBookingWizardSteps } from '../../../booking-wizard-steps';
import { uploadPassportAction } from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ error?: string }>;
}

// Only reachable at all once Visa Assistance was picked at the Add-ons step
// (Booking.requiresPassportUpload) -- and when it is, EVERY traveler needs a
// passport uploaded, not just the tour lead (a change from the original
// tour-lead-only rule). Uploads one traveler at a time, looping back here
// until none are left.
export default async function PassportPage({ params, searchParams }: Props) {
  const { bookingId } = await params;
  const { error } = await searchParams;
  const ctx = await requireGuestContext();
  const [booking, travelers] = await Promise.all([
    bookingService.getById(ctx, bookingId),
    bookingService.listTravelers(ctx, bookingId),
  ]);

  if (travelers.length < booking.seats) {
    redirect(`/booking/${bookingId}/travelers/new`);
  }
  if (!booking.requiresPassportUpload) {
    redirect(`/booking/${bookingId}`);
  }
  const nextTraveler = travelers.find((t) => !t.passportDocumentId);
  if (!nextTraveler) {
    redirect(`/booking/${bookingId}`);
  }

  const remaining = travelers.filter((t) => !t.passportDocumentId).length;
  const t = await getTranslations('PassportPage');

  return (
    <Reveal>
      <div className="max-w-md">
        <BackLink href={`/booking/${bookingId}/travelers/new`}>{t('backToTravelers')}</BackLink>
        <StepIndicator steps={await getBookingWizardSteps(true)} currentIndex={3} />
        <p className="eyebrow mt-4 text-mist">{t('setupPassport')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">
          {t('passportTitle', { firstName: nextTraveler.firstName, lastName: nextTraveler.lastName })}
        </h1>
        <p className="mt-1 text-sm text-mist">
          {t('uploadNotice', { remaining, total: travelers.length })}
        </p>
        {error === 'missing_file' && (
          <div className="mt-3">
            <Alert tone="error">{t('choosePdfFile')}</Alert>
          </div>
        )}
        <form action={uploadPassportAction.bind(null, bookingId, nextTraveler.id)} className="mt-6 space-y-4">
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
