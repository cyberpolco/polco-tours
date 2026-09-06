import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { bookingService, type BookingView } from '@modules/booking';
import { invoicingService } from '@modules/invoicing';
import type { PaymentKind } from '@prisma/client';
import { buildGuestSetupContext } from '@lib/booking-setup-context';
import { Alert } from '@/components/ui/Alert';
import { LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Reveal } from '@/components/ui/Reveal';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { format, formatOrPending, money } from '@lib/money';
import { getBookingWizardSteps } from '../../booking-wizard-steps';
import { acceptQuotationAction, currentSetupBookingId, payAction } from '../actions';

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Setup is done, so the invoice can finally be built (getBillableTotal
// refuses until add-ons + travellers + passports are all complete). Shown
// inline rather than as its own step: there is nothing left to collect,
// only an amount to confirm.
//
// DPO is still stubbed (OI-01) and initiatePayment auto-succeeds (DR-074),
// so this records a payment rather than taking money. When a real gateway
// lands, payAction returns its redirect URL and this UI is unchanged.
async function PaySection({ bookingId, booking }: { bookingId: string; booking: BookingView }) {
  const t = await getTranslations('CompleteBooking');
  const ctx = buildGuestSetupContext(booking);

  let invoice;
  try {
    invoice = await invoicingService.getOrCreateInvoiceForBooking(ctx, bookingId);
  } catch {
    // getBillableTotal throws if anything is still incomplete -- treat that
    // as "not payable yet" rather than crashing the whole checklist.
    return <Alert tone="success">{t('setupComplete')}</Alert>;
  }

  const payments = await invoicingService.listPayments(ctx, invoice.id);
  const settled = payments.some((payment) => payment.status === 'SUCCEEDED' && payment.kind !== 'DEPOSIT');
  if (settled || invoice.status === 'PAID') {
    return (
      <>
        <Alert tone="success">{t('paidInFull')}</Alert>
        <LinkButton href="/find-booking">{t('viewBooking')}</LinkButton>
      </>
    );
  }

  const depositPaid = payments.some((payment) => payment.status === 'SUCCEEDED' && payment.kind === 'DEPOSIT');
  // A late booking forces full payment -- invoicing sets depositAllowed
  // false and canInitiatePayment rejects a DEPOSIT server-side regardless
  // of what is rendered here (DR-198).
  const showDeposit = invoice.depositAllowed && !depositPaid;
  const balanceKind: PaymentKind = depositPaid ? 'BALANCE' : 'FULL';
  const balanceMinor = depositPaid ? invoice.balanceMinor : invoice.totalMinor;

  return (
    <>
      <Alert tone="success">{t('setupComplete')}</Alert>
      <Card>
        <div className="flex items-center justify-between">
          <p className="text-sm text-mist">{t('amountDue')}</p>
          <p className="font-semibold text-navy">{format(money(balanceMinor, invoice.currency))}</p>
        </div>
        <div className="mt-4 space-y-2">
          {showDeposit && (
            <form action={payAction.bind(null, 'DEPOSIT')}>
              <SubmitButton pendingLabel={t('paying')}>
                {t('payDeposit', { amount: format(money(invoice.depositMinor, invoice.currency)) })}
              </SubmitButton>
            </form>
          )}
          <form action={payAction.bind(null, balanceKind)}>
            <SubmitButton variant={showDeposit ? 'secondary' : 'primary'} pendingLabel={t('paying')}>
              {t('payFull', { amount: format(money(balanceMinor, invoice.currency)) })}
            </SubmitButton>
          </form>
        </div>
      </Card>
    </>
  );
}

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
  const addonsDone = !!booking.addonsFinalizedAt;
  const travelersDone = travelers.length >= booking.seats;
  const passportDone = !booking.requiresPassportUpload || travelers.every((traveler) => !!traveler.passportDocumentId);
  const setupComplete = addonsDone && travelersDone && passportDone;

  // Add-ons genuinely must come first, and not only because the session
  // wizard orders it that way: whether Visa Assistance is picked decides if
  // a Passport step exists at all, and getBillableTotal refuses to invoice
  // a booking whose addonsFinalizedAt is null -- so skipping it would leave
  // the guest permanently unable to pay. Picking nothing still finalizes it.
  const nextHref = !addonsDone
    ? '/complete-booking/setup/addons'
    : !travelersDone
      ? '/complete-booking/setup/travelers'
      : '/complete-booking/setup/passport';
  const currentStepIndex = !addonsDone ? 1 : !travelersDone ? 2 : 3;

  return (
    <Reveal>
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <p className="eyebrow text-mist">{t('eyebrow')}</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">{t('setupTitle')}</h1>
          <p className="mt-1 font-mono text-2xl font-bold text-navy">{booking.bookingReference}</p>
        </div>

        {setupComplete ? (
          <PaySection bookingId={bookingId} booking={booking} />
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
