import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireGuestContext } from '@lib/guest-guard';
import { bookingService } from '@modules/booking';
import { BackLink } from '@/components/ui/BackLink';
import { Reveal } from '@/components/ui/Reveal';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { getBookingWizardSteps } from '../../../booking-wizard-steps';
import { recordPassportAction } from './actions';
import { PassportUploadForm } from '../../../passport-upload-form';

// Real per-guest data, not a link-share target -- kept out of search
// indexing (defense-in-depth on data already gated by requireGuestContext/
// lookup credentials, not a security fix by itself). No dynamic title/
// description/OG image work spent on this page for the same reason.
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface Props {
  params: Promise<{ bookingId: string }>;
}

// Only reachable at all once Visa Assistance was picked at the Add-ons step
// (Booking.requiresPassportUpload) -- and when it is, EVERY traveler needs a
// passport uploaded, not just the tour lead (a change from the original
// tour-lead-only rule). Uploads one traveler at a time, looping back here
// until none are left.
export default async function PassportPage({ params }: Props) {
  const { bookingId } = await params;
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
        <StepIndicator steps={await getBookingWizardSteps(true)} currentIndex={3} variant="checklist" />
        <p className="eyebrow mt-4 text-mist">{t('setupPassport')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">
          {t('passportTitle', { firstName: nextTraveler.firstName, lastName: nextTraveler.lastName })}
        </h1>
        <p className="mt-1 text-sm text-mist">
          {t('uploadNotice', { remaining, total: travelers.length })}
        </p>
        <PassportUploadForm
          recordAction={recordPassportAction.bind(null, bookingId, nextTraveler.id)}
          nextHref={remaining > 1 ? `/booking/${bookingId}/passport` : `/booking/${bookingId}`}
        />
      </div>
    </Reveal>
  );
}
