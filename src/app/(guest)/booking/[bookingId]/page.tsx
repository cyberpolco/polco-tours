import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireGuestContext } from '@lib/guest-guard';
import { format, formatOrPending, money } from '@lib/money';
import { bookingService, isBookingLocked } from '@modules/booking';
import { canDownloadInvoicePdf, invoicingService } from '@modules/invoicing';
import { visaService, type GuestVisaApplicationView } from '@modules/visa';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Reveal } from '@/components/ui/Reveal';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { BOOKING_STATUS_TONE, PAYMENT_STATUS_TONE } from '@lib/status-tones';
import { CouponForm } from '@/components/CouponForm';
import { getBookingWizardSteps } from '../../booking-wizard-steps';
import { acceptQuotationAction, applyCouponAction, initiatePaymentAction, removeCouponAction } from './actions';
import { CancelBookingButton } from './cancel-booking-button';
import { CancelRequestButton } from './cancel-request-button';

// Real per-guest data, not a link-share target -- kept out of search
// indexing (defense-in-depth on data already gated by requireGuestContext/
// lookup credentials, not a security fix by itself). No dynamic title/
// description/OG image work spent on this page for the same reason.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Anything but the terminal/in-flight statuses (IN_PROGRESS/COMPLETED/
// CANCELLED/REFUNDED, plus unreachable DRAFT) can still be cancelled by the
// tourist -- see canTransition's TRANSITIONS table in modules/booking/domain.ts
// (kept internal to the module; this list is the UI's own, deliberately
// hand-matched to it rather than exporting the internal helper).
const CANCELLABLE_STATUSES = ['AWAITING_QUOTATION', 'QUOTATION_SENT', 'AWAITING_DEPOSIT', 'DEPOSIT_PAID', 'FULLY_PAID', 'CONFIRMED'];

interface Props {
  params: Promise<{ bookingId: string }>;
}

export default async function BookingHomePage({ params }: Props) {
  const { bookingId } = await params;
  const ctx = await requireGuestContext();

  let booking;
  try {
    booking = await bookingService.getById(ctx, bookingId);
  } catch {
    notFound();
  }

  const t = await getTranslations('BookingHome');
  const tCommon = await getTranslations('Common');
  const tStatus = await getTranslations('BookingStatusLabel');
  const tPaymentStatus = await getTranslations('PaymentStatusLabel');
  const tPaymentKind = await getTranslations('PaymentKindLabel');

  // DR-047: a TAILOR_MADE request is "just an inquiry" until a quotation
  // exists and is accepted -- explicit user direction to remove the
  // Travelers/Passport/Add-ons/Confirm-&-Pay steps from this stage
  // entirely, not just defer them. `AWAITING_QUOTATION`/`QUOTATION_SENT`
  // are TAILOR_MADE-only statuses -- a PREDEFINED_PACKAGE booking never
  // reaches either (its old "Request a quotation" escape hatch was
  // removed; this branch is origin-scoped defensively, not because either
  // origin can currently land here in both ways).
  if (booking.origin === 'TAILOR_MADE' && (booking.status === 'AWAITING_QUOTATION' || booking.status === 'QUOTATION_SENT')) {
    return (
      <Reveal>
        <div className="max-w-md space-y-6">
          <div>
            <p className="eyebrow mt-4 text-mist">{t('yourTripRequest')}</p>
            <p className="mt-2 text-xs uppercase tracking-wide text-mist">{t('yourBookingReference')}</p>
            <p className="mt-1 font-mono text-3xl font-bold text-navy">{booking.bookingReference}</p>
            <p className="mt-2 text-sm text-mist">{t('keepReferenceHandy')}</p>
            <p className="mt-3 flex items-center gap-2 text-mist">
              {t('seats', { count: booking.seats })} ·{' '}
              <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{tStatus(booking.status)}</Badge>
            </p>
          </div>
          {booking.status === 'AWAITING_QUOTATION' && <Alert tone="success">{t('receivedTripRequest')}</Alert>}
          {booking.status === 'QUOTATION_SENT' && (
            <div className="space-y-3">
              <Alert tone="success">
                {t('quotationReady', { price: formatOrPending(booking.priceMinor, booking.currency) })}
              </Alert>
              <form action={acceptQuotationAction.bind(null, booking.id)}>
                <SubmitButton pendingLabel={t('accepting')}>{t('acceptQuotation')}</SubmitButton>
              </form>
            </div>
          )}
          {CANCELLABLE_STATUSES.includes(booking.status) && (
            <CancelRequestButton bookingId={booking.id} createdAt={booking.createdAt.toISOString()} />
          )}
        </div>
      </Reveal>
    );
  }

  const travelers = await bookingService.listTravelers(ctx, bookingId);
  const addonsDone = !!booking.addonsFinalizedAt;
  const travelersDone = travelers.length >= booking.seats;
  // Passports are only collected at all if the finalized add-ons included
  // Visa Assistance (booking.requiresPassportUpload) -- and when they are,
  // EVERY traveler needs one, not just the tour lead.
  const passportDone = !booking.requiresPassportUpload || travelers.every((t) => !!t.passportDocumentId);
  const setupComplete = addonsDone && travelersDone && passportDone;

  if (!setupComplete) {
    const nextHref = !addonsDone
      ? `/booking/${bookingId}/addons`
      : !travelersDone
        ? `/booking/${bookingId}/travelers/new`
        : `/booking/${bookingId}/passport`;
    const currentStepIndex = !addonsDone ? 1 : !travelersDone ? 2 : 3;

    return (
      <Reveal>
        <div className="max-w-md space-y-6">
          <StepIndicator steps={await getBookingWizardSteps(booking.requiresPassportUpload)} currentIndex={currentStepIndex} variant="checklist" />
          <div>
            <p className="eyebrow mt-4 text-mist">{t('bookingSetup')}</p>
            <p className="mt-1 text-xs text-mist">
              {t('reference')} <span className="font-mono">{booking.bookingReference}</span>
            </p>
            <p className="mt-1 flex items-center gap-2 text-mist">
              {t('seats', { count: booking.seats })} ·{' '}
              <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{tStatus(booking.status)}</Badge> ·{' '}
              {formatOrPending(booking.priceMinor, booking.currency)}
            </p>
          </div>
          <Card className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{t('addOns')}</span>
              <Badge tone={addonsDone ? 'success' : 'neutral'}>{addonsDone ? tCommon('done') : tCommon('pending')}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>{t('travelersCount', { current: travelers.length, total: booking.seats })}</span>
              <Badge tone={travelersDone ? 'success' : 'neutral'}>{travelersDone ? tCommon('done') : tCommon('pending')}</Badge>
            </div>
            {booking.requiresPassportUpload && (
              <div className="flex items-center justify-between text-sm">
                <span>
                  {t('passportsCount', {
                    current: travelers.filter((tv) => !!tv.passportDocumentId).length,
                    total: travelers.length,
                  })}
                </span>
                <Badge tone={passportDone ? 'success' : 'neutral'}>{passportDone ? tCommon('done') : tCommon('pending')}</Badge>
              </div>
            )}
          </Card>
          {booking.requiresPassportUpload && <p className="text-xs text-mist">{t('governmentFeeDisclaimer')}</p>}
          <LinkButton href={nextHref}>{t('continueSetup')}</LinkButton>
        </div>
      </Reveal>
    );
  }

  const invoice = await invoicingService.getOrCreateInvoiceForBooking(ctx, bookingId);
  const payments = await invoicingService.listPayments(ctx, invoice.id);

  // DR-154: visa applications only exist when Visa Assistance was selected
  // at the add-ons step (booking.requiresPassportUpload) -- sequential
  // awaits, not Promise.all, same connection-pool-exhaustion precedent as
  // the rest of this codebase's cross-module composition (DR-038/041/060).
  const visaApplications: GuestVisaApplicationView[] = [];
  if (booking.requiresPassportUpload) {
    for (const traveler of travelers) {
      const application = await visaService.getApplicationForGuest(ctx, bookingId, traveler.id);
      if (application) visaApplications.push(application);
    }
  }
  const visaNeedsAttention = visaApplications.some((a) => a.status === 'REJECTED');

  const pendingPayment = payments.some((p) => p.status === 'PENDING');
  // DR-104: a coupon may only be applied/removed before the invoice is
  // actually paid; DR-105: nor once the booking itself is done -- both
  // mirror invoicingService.applyCoupon/removeCoupon's own server-side
  // guards, just to hide the form once it'd be rejected anyway.
  const couponEditable = !payments.some((p) => p.status === 'SUCCEEDED') && !isBookingLocked(booking.status);

  return (
    <div className="space-y-8">
      <StepIndicator
        steps={await getBookingWizardSteps(booking.requiresPassportUpload)}
        currentIndex={booking.requiresPassportUpload ? 4 : 3}
        variant="checklist"
      />
      <Reveal>
      <div>
        {/* Add-ons/travelers/passport stay re-editable up to first payment
            (setAddons has no status gate) -- the invoice snapshot below is
            frozen at creation regardless, so hiding this once a payment has
            actually succeeded avoids inviting an edit that can no longer
            affect what was billed. Once setup is no longer reviewable, the
            chip transforms into a "return home" link instead of disappearing. */}
        {booking.status === 'AWAITING_DEPOSIT' ? (
          <BackLink href={`/booking/${bookingId}/addons`}>{t('reviewSetupDetails')}</BackLink>
        ) : (
          <BackLink href="/">{t('returnHome')}</BackLink>
        )}
        <p className="eyebrow mt-4 text-mist">{t('yourBooking')}</p>
        <p className="mt-2 text-xs uppercase tracking-wide text-mist">{t('yourBookingReference')}</p>
        <p className="mt-1 font-mono text-3xl font-bold text-navy">{booking.bookingReference}</p>
        <p className="mt-2 text-sm text-mist">
          {t('keepReferenceHandyLookup')}{' '}
          <Link href="/find-booking" className="text-forest hover:underline">
            {t('findMyBooking')}
          </Link>
          .
        </p>
        <p className="mt-3 flex items-center gap-2 text-mist">
          {t('seats', { count: booking.seats })} ·{' '}
          <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{tStatus(booking.status)}</Badge> ·{' '}
          {formatOrPending(booking.priceMinor, booking.currency)}
        </p>
        {booking.status === 'AWAITING_QUOTATION' && (
          <div className="mt-3">
            <Alert tone="success">{t('receivedQuoteRequest')}</Alert>
          </div>
        )}
        {booking.status === 'QUOTATION_SENT' && (
          <div className="mt-3 space-y-3">
            <Alert tone="success">
              {t('quotationReadyProceed', { price: formatOrPending(booking.priceMinor, booking.currency) })}
            </Alert>
            <form action={acceptQuotationAction.bind(null, booking.id)}>
              <SubmitButton pendingLabel={t('accepting')}>{t('acceptQuotation')}</SubmitButton>
            </form>
          </div>
        )}
        {CANCELLABLE_STATUSES.includes(booking.status) && (
          <div className="mt-4">
            <CancelBookingButton bookingId={booking.id} invoiceCreatedAt={invoice.createdAt.toISOString()} />
          </div>
        )}
      </div>
      </Reveal>

      <Reveal delay={0.1}>
      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">{t('invoice')}</p>
        <Card className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-mist">{t('subtotal')}</p>
            <p className="text-sm">{format(money(invoice.subtotalMinor, invoice.currency))}</p>
          </div>
          {invoice.discountMinor > 0 && (
            <div>
              <p className="text-xs text-mist">{t('discount')}</p>
              <p className="text-sm">−{format(money(invoice.discountMinor, invoice.currency))}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-mist">{t('tax')}</p>
            <p className="text-sm">{format(money(invoice.taxMinor, invoice.currency))}</p>
          </div>
          {invoice.platformFeeMinor != null && (
            <div>
              <p className="text-xs text-mist">{t('platformFee')}</p>
              <p className="text-sm">{format(money(invoice.platformFeeMinor, invoice.currency))}</p>
            </div>
          )}
          {invoice.lateBookingSurchargeMinor > 0 && (
            <div>
              <p className="text-xs text-mist">{t('lateBookingSurcharge')}</p>
              <p className="text-sm">{format(money(invoice.lateBookingSurchargeMinor, invoice.currency))}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-mist">{t('total')}</p>
            <p className="text-lg font-semibold text-navy">{format(money(invoice.totalMinor, invoice.currency))}</p>
          </div>
          {invoice.depositAllowed ? (
            <>
              <div>
                <p className="text-xs text-mist">{t('depositPct')}</p>
                <p className="text-lg font-semibold text-navy">{format(money(invoice.depositMinor, invoice.currency))}</p>
              </div>
              <div>
                <p className="text-xs text-mist">{t('balancePct')}</p>
                <p className="text-lg font-semibold text-navy">{format(money(invoice.balanceMinor, invoice.currency))}</p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-xs text-mist">{t('fullPaymentRequired')}</p>
              <p className="text-lg font-semibold text-navy">{format(money(invoice.depositMinor, invoice.currency))}</p>
            </div>
          )}
        </Card>
        {!invoice.depositAllowed && <p className="mt-2 text-xs text-mist">{t('lateBookingExplainer')}</p>}
        <CouponForm
          appliedCode={invoice.couponCode}
          editable={couponEditable}
          onApply={applyCouponAction.bind(null, invoice.id, booking.id)}
          onRemove={removeCouponAction.bind(null, invoice.id, booking.id)}
        />
        {canDownloadInvoicePdf(invoice.status) && (
          <p className="mt-3 text-xs text-mist">
            {t('downloadInvoicePdf')}{' '}
            <a href={`/api/v1/bookings/${bookingId}/invoice/pdf?locale=en`} className="font-semibold text-amber underline">
              {t('downloadInvoiceEn')}
            </a>{' '}
            ·{' '}
            <a href={`/api/v1/bookings/${bookingId}/invoice/pdf?locale=fr`} className="font-semibold text-amber underline">
              {t('downloadInvoiceFr')}
            </a>
          </p>
        )}
      </div>
      </Reveal>

      <Reveal delay={0.2}>
      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">{t('payment')}</p>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noPaymentYet')}</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between border-b border-rule pb-2">
                <span className="flex items-center gap-2">
                  {tPaymentKind(p.kind)} · {format(money(p.amountMinor, p.currency))}
                  <Badge tone={PAYMENT_STATUS_TONE[p.status]}>{tPaymentStatus(p.status)}</Badge>
                </span>
                {p.status === 'PENDING' && <span className="text-xs text-mist">{t('awaitingConfirmation')}</span>}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          {booking.status === 'AWAITING_DEPOSIT' && !pendingPayment && (
            <>
              {invoice.depositAllowed && (
                <form action={initiatePaymentAction.bind(null, invoice.id, 'DEPOSIT', booking.id)}>
                  <SubmitButton pendingLabel={t('starting')}>{t('payDeposit')}</SubmitButton>
                </form>
              )}
              <form action={initiatePaymentAction.bind(null, invoice.id, 'FULL', booking.id)}>
                <SubmitButton pendingLabel={t('starting')} variant={invoice.depositAllowed ? 'secondary' : 'primary'}>
                  {t('payInFull')}
                </SubmitButton>
              </form>
            </>
          )}
          {booking.status === 'DEPOSIT_PAID' && !pendingPayment && (
            <form action={initiatePaymentAction.bind(null, invoice.id, 'BALANCE', booking.id)}>
              <SubmitButton pendingLabel={t('starting')}>{t('payBalance')}</SubmitButton>
            </form>
          )}
        </div>
      </div>
      </Reveal>

      {visaApplications.length > 0 && (
        <Reveal delay={0.25}>
          <div>
            <div className="survey-rule mb-6" />
            <p className="eyebrow text-mist">{t('visaApplication')}</p>
            <Card className="mt-2 flex items-center justify-between gap-4">
              <p className="text-sm">
                {visaNeedsAttention ? t('visaNeedsAttention') : t('visaInProgress')}
              </p>
              <Link href={`/booking/${bookingId}/visa`} className="text-forest hover:underline">
                {t('viewVisaDetails')}
              </Link>
            </Card>
            <p className="mt-2 text-xs text-mist">{t('governmentFeeDisclaimer')}</p>
          </div>
        </Reveal>
      )}
    </div>
  );
}
