import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireGuestContext } from '@lib/guest-guard';
import { bookingService } from '@modules/booking';
import { visaService, type GuestVisaApplicationView } from '@modules/visa';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Reveal } from '@/components/ui/Reveal';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { formatOrPending } from '@lib/money';
import { VISA_FEE_PAYMENT_STATUS_TONE, VISA_STATUS_TONE } from '@lib/status-tones';
import { resubmitVisaAction } from './actions';

// Real per-guest data, not a link-share target -- kept out of search
// indexing (defense-in-depth on data already gated by requireGuestContext/
// lookup credentials, not a security fix by itself). No dynamic title/
// description/OG image work spent on this page for the same reason.
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface Props {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ error?: string }>;
}

// DR-154: guest self-service visa view -- one row per traveler needing a
// visa (booking.requiresPassportUpload), same tour-lead-acts-for-any-traveler
// convention as the initial passport-upload wizard (Traveler isn't its own
// User account). Shows the rejection reason + a re-upload/resubmit form when
// REJECTED, and a download link once APPROVED.
export default async function BookingVisaPage({ params, searchParams }: Props) {
  const { bookingId } = await params;
  const { error } = await searchParams;
  const ctx = await requireGuestContext();
  const booking = await bookingService.getById(ctx, bookingId);
  if (!booking.requiresPassportUpload) {
    redirect(`/booking/${bookingId}`);
  }

  const travelers = await bookingService.listTravelers(ctx, bookingId);
  const applications: GuestVisaApplicationView[] = [];
  for (const traveler of travelers) {
    const application = await visaService.getApplicationForGuest(ctx, bookingId, traveler.id);
    if (application) applications.push(application);
  }

  const t = await getTranslations('BookingVisaPage');
  const tVisaStatus = await getTranslations('VisaStatusLabel');
  const tFeeStatus = await getTranslations('VisaFeePaymentStatusLabel');

  return (
    <Reveal>
      <div className="max-w-md space-y-6">
        <div>
          <BackLink href={`/booking/${bookingId}`}>{t('backToBooking')}</BackLink>
          <p className="eyebrow mt-4 text-mist">{t('eyebrow')}</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">{t('title')}</h1>
        </div>

        {error === 'missing_file' && <Alert tone="error">{t('choosePdfFile')}</Alert>}

        {applications.length === 0 ? (
          <p className="text-sm text-mist">{t('noApplicationsYet')}</p>
        ) : (
          <div className="space-y-4">
            {applications.map((a) => (
              <Card key={a.travelerId} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-navy">{a.travelerName}</p>
                  <Badge tone={VISA_STATUS_TONE[a.status]}>{tVisaStatus(a.status)}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-mist">
                    {t('governmentFeeLabel')}: {formatOrPending(a.governmentFeeMinor, a.governmentFeeCurrency, t('governmentFeeUnspecified'))}
                  </span>
                  <Badge tone={VISA_FEE_PAYMENT_STATUS_TONE[a.feePaymentStatus]}>{tFeeStatus(a.feePaymentStatus)}</Badge>
                </div>
                <p className="text-xs text-mist">{t('governmentFeeDisclaimer')}</p>
                {a.status === 'REJECTED' && (
                  <div className="space-y-3">
                    {a.rejectionReason && <p className="text-sm text-mist">{a.rejectionReason}</p>}
                    <form action={resubmitVisaAction.bind(null, bookingId, a.travelerId)} className="space-y-3">
                      <FormField label={t('passportPdfLabel')} htmlFor={`passport-${a.travelerId}`}>
                        <input
                          type="file"
                          name="passport"
                          id={`passport-${a.travelerId}`}
                          accept="application/pdf"
                          required
                          className="w-full rounded-survey border border-rule px-3 py-2 file:mr-3 file:rounded-pill file:border-0 file:bg-amber/10 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-navy"
                        />
                      </FormField>
                      <SubmitButton size="compact" pendingLabel={t('resubmitting')}>
                        {t('resubmit')}
                      </SubmitButton>
                    </form>
                  </div>
                )}
                {a.status === 'APPROVED' && a.hasDocument && (
                  <a
                    href={`/api/v1/bookings/${bookingId}/travelers/${a.travelerId}/visa/document/guest`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-forest hover:underline"
                  >
                    {t('downloadVisa')}
                  </a>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </Reveal>
  );
}
