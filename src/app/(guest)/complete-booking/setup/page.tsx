import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { bookingService } from '@modules/booking';
import { Alert } from '@/components/ui/Alert';
import { LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Reveal } from '@/components/ui/Reveal';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { formatOrPending } from '@lib/money';
import { getBookingWizardSteps } from '../../booking-wizard-steps';
import { acceptQuotationAction, currentSetupBookingId } from '../actions';

export const metadata: Metadata = { robots: { index: false, follow: false } };

// The guest twin of /booking/[bookingId]'s own setup checklist. Same
// addonsDone -> travelersDone -> passportDone ordering and the same
// StepIndicator, so a guest who started in one flow recognises the other --
// only the way they got here (a signed setup cookie, not a session) differs.
export default async function BookingSetupPage() {
  const bookingId = await currentSetupBookingId();
  if (!bookingId) redirect('/complete-booking');

  const t = await getTranslations('CompleteBooking');
  const booking = await bookingService.getForBookingSetup(bookingId);

  // Accepting the price comes first -- until then there is no agreed trip to
  // collect a manifest for (DR-047).
  if (booking.status === 'QUOTATION_SENT') {
    return (
      <Reveal>
        <div className="mx-auto max-w-md space-y-6">
          <div>
            <p className="eyebrow text-mist">{t('eyebrow')}</p>
            <h1 className="mt-1 text-2xl font-bold text-navy">{t('quotationTitle')}</h1>
            <p className="mt-1 font-mono text-2xl font-bold text-navy">{booking.bookingReference}</p>
          </div>
          <Alert tone="success">
            {t('quotationReady', { price: formatOrPending(booking.priceMinor, booking.currency) })}
          </Alert>
          <form action={acceptQuotationAction}>
            <SubmitButton pendingLabel={t('accepting')}>{t('acceptQuotation')}</SubmitButton>
          </form>
        </div>
      </Reveal>
    );
  }

  if (booking.status === 'AWAITING_QUOTATION') {
    return (
      <Reveal>
        <div className="mx-auto max-w-md space-y-4">
          <p className="eyebrow text-mist">{t('eyebrow')}</p>
          <h1 className="text-2xl font-bold text-navy">{booking.bookingReference}</h1>
          <Alert tone="success">{t('awaitingQuotation')}</Alert>
        </div>
      </Reveal>
    );
  }

  const travelers = await bookingService.listTravelersForBookingSetup(bookingId);
  const travelersDone = travelers.length >= booking.seats;
  const passportDone = !booking.requiresPassportUpload || travelers.every((traveler) => !!traveler.passportDocumentId);
  // Deliberately no add-ons step here (unlike the session-gated wizard): the
  // price in the quotation the guest just accepted already reflects what
  // staff scoped, so re-opening priced add-ons would move an agreed number.
  // See the DR-257 follow-up if that should change.
  const setupComplete = travelersDone && passportDone;

  const nextHref = !travelersDone ? '/complete-booking/setup/travelers' : '/complete-booking/setup/passport';
  const currentStepIndex = !travelersDone ? 2 : 3;

  return (
    <Reveal>
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <p className="eyebrow text-mist">{t('eyebrow')}</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">{t('setupTitle')}</h1>
          <p className="mt-1 font-mono text-2xl font-bold text-navy">{booking.bookingReference}</p>
        </div>

        {setupComplete ? (
          <>
            <Alert tone="success">{t('setupComplete')}</Alert>
            {/* Paying still lives on the session-gated flow -- see the
                DR-257 follow-up. /find-booking remains the way in for it. */}
            <LinkButton href="/find-booking">{t('viewBooking')}</LinkButton>
          </>
        ) : (
          <>
            <StepIndicator steps={await getBookingWizardSteps(booking.requiresPassportUpload)} currentIndex={currentStepIndex} variant="checklist" />
            <Card>
              <p className="text-sm text-mist">{t('setupIntro')}</p>
              <div className="mt-4">
                <LinkButton href={nextHref}>{t('continueSetup')}</LinkButton>
              </div>
            </Card>
          </>
        )}
      </div>
    </Reveal>
  );
}
