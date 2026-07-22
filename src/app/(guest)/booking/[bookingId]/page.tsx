import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireGuestContext } from '@lib/guest-guard';
import { format, formatOrPending, money } from '@lib/money';
import { bookingService } from '@modules/booking';
import { invoicingService } from '@modules/invoicing';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Reveal } from '@/components/ui/Reveal';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { BOOKING_STATUS_TONE, PAYMENT_STATUS_TONE } from '@lib/status-tones';
import { getBookingWizardSteps } from '../../booking-wizard-steps';
import { acceptQuotationAction, initiatePaymentAction } from './actions';
import { CancelBookingButton } from './cancel-booking-button';
import { CancelRequestButton } from './cancel-request-button';

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
            <p className="eyebrow mt-4 text-mist">Your trip request</p>
            <p className="mt-2 text-xs uppercase tracking-wide text-mist">Your booking reference</p>
            <p className="mt-1 font-mono text-3xl font-bold text-navy">{booking.bookingReference}</p>
            <p className="mt-2 text-sm text-mist">
              Keep your last name and this reference handy -- we&apos;ll ask for both any time you contact us about this trip.
            </p>
            <p className="mt-3 flex items-center gap-2 text-mist">
              {booking.seats} seat(s) · <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{booking.status}</Badge>
            </p>
          </div>
          {booking.status === 'AWAITING_QUOTATION' && (
            <Alert tone="success">We&apos;ve received your trip request -- our team will be in touch soon with a quotation.</Alert>
          )}
          {booking.status === 'QUOTATION_SENT' && (
            <div className="space-y-3">
              <Alert tone="success">
                Your quotation is ready: {formatOrPending(booking.priceMinor, booking.currency)}. Accept it to continue with booking
                setup and payment.
              </Alert>
              <form action={acceptQuotationAction.bind(null, booking.id)}>
                <SubmitButton pendingLabel="Accepting…">Accept quotation</SubmitButton>
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
          <StepIndicator steps={getBookingWizardSteps(booking.requiresPassportUpload)} currentIndex={currentStepIndex} />
          <div>
            <p className="eyebrow mt-4 text-mist">Booking setup</p>
            <p className="mt-1 text-xs text-mist">Reference: <span className="font-mono">{booking.bookingReference}</span></p>
            <p className="mt-1 flex items-center gap-2 text-mist">
              {booking.seats} seat(s) · <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{booking.status}</Badge> ·{' '}
              {formatOrPending(booking.priceMinor, booking.currency)}
            </p>
          </div>
          <Card className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Add-ons</span>
              <Badge tone={addonsDone ? 'success' : 'neutral'}>{addonsDone ? 'Done' : 'Pending'}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>
                Travelers ({travelers.length}/{booking.seats})
              </span>
              <Badge tone={travelersDone ? 'success' : 'neutral'}>{travelersDone ? 'Done' : 'Pending'}</Badge>
            </div>
            {booking.requiresPassportUpload && (
              <div className="flex items-center justify-between text-sm">
                <span>
                  Passports ({travelers.filter((t) => !!t.passportDocumentId).length}/{travelers.length})
                </span>
                <Badge tone={passportDone ? 'success' : 'neutral'}>{passportDone ? 'Done' : 'Pending'}</Badge>
              </div>
            )}
          </Card>
          <LinkButton href={nextHref}>Continue setup</LinkButton>
        </div>
      </Reveal>
    );
  }

  const invoice = await invoicingService.getOrCreateInvoiceForBooking(ctx, bookingId);
  const payments = await invoicingService.listPayments(ctx, invoice.id);

  const pendingPayment = payments.some((p) => p.status === 'PENDING');

  return (
    <div className="space-y-8">
      <StepIndicator steps={getBookingWizardSteps(booking.requiresPassportUpload)} currentIndex={booking.requiresPassportUpload ? 4 : 3} />
      <Reveal>
      <div>
        {/* Add-ons/travelers/passport stay re-editable up to first payment
            (setAddons has no status gate) -- the invoice snapshot below is
            frozen at creation regardless, so hiding this once a payment has
            actually succeeded avoids inviting an edit that can no longer
            affect what was billed. */}
        {booking.status === 'AWAITING_DEPOSIT' && (
          <Link href={`/booking/${bookingId}/addons`} className="text-sm text-forest hover:underline">
            ← review setup details
          </Link>
        )}
        <p className="eyebrow mt-4 text-mist">Your booking</p>
        <p className="mt-2 text-xs uppercase tracking-wide text-mist">Your booking reference</p>
        <p className="mt-1 font-mono text-3xl font-bold text-navy">{booking.bookingReference}</p>
        <p className="mt-2 text-sm text-mist">
          Keep your last name and this reference handy -- we&apos;ll ask for both any time you contact us, and you can
          look your booking up again later at{' '}
          <Link href="/find-booking" className="text-forest hover:underline">
            Find my booking
          </Link>
          .
        </p>
        <p className="mt-3 flex items-center gap-2 text-mist">
          {booking.seats} seat(s) · <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{booking.status}</Badge> ·{' '}
          {formatOrPending(booking.priceMinor, booking.currency)}
        </p>
        {booking.status === 'AWAITING_QUOTATION' && (
          <div className="mt-3">
            <Alert tone="success">
              We&apos;ve received your quote request -- our team will be in touch soon.
            </Alert>
          </div>
        )}
        {booking.status === 'QUOTATION_SENT' && (
          <div className="mt-3 space-y-3">
            <Alert tone="success">
              Your quotation is ready: {formatOrPending(booking.priceMinor, booking.currency)}. Accept it to proceed to payment.
            </Alert>
            <form action={acceptQuotationAction.bind(null, booking.id)}>
              <SubmitButton pendingLabel="Accepting…">Accept quotation</SubmitButton>
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
        <p className="eyebrow text-mist">Invoice</p>
        <Card className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-mist">Subtotal</p>
            <p className="text-sm">{format(money(invoice.subtotalMinor, invoice.currency))}</p>
          </div>
          <div>
            <p className="text-xs text-mist">Tax</p>
            <p className="text-sm">{format(money(invoice.taxMinor, invoice.currency))}</p>
          </div>
          <div>
            <p className="text-xs text-mist">Deposit (40%)</p>
            <p className="text-lg font-semibold text-navy">{format(money(invoice.depositMinor, invoice.currency))}</p>
          </div>
          <div>
            <p className="text-xs text-mist">Balance (60%)</p>
            <p className="text-lg font-semibold text-navy">{format(money(invoice.balanceMinor, invoice.currency))}</p>
          </div>
        </Card>
      </div>
      </Reveal>

      <Reveal delay={0.2}>
      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">Payment</p>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-mist">No payment requested yet.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between border-b border-rule pb-2">
                <span className="flex items-center gap-2">
                  {p.kind} · {format(money(p.amountMinor, p.currency))}
                  <Badge tone={PAYMENT_STATUS_TONE[p.status]}>{p.status}</Badge>
                </span>
                {p.status === 'PENDING' && (
                  <span className="text-xs text-mist">Awaiting confirmation from our team</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          {booking.status === 'AWAITING_DEPOSIT' && !pendingPayment && (
            <>
              <form action={initiatePaymentAction.bind(null, invoice.id, 'DEPOSIT', booking.id)}>
                <SubmitButton pendingLabel="Starting…">Pay deposit</SubmitButton>
              </form>
              <form action={initiatePaymentAction.bind(null, invoice.id, 'FULL', booking.id)}>
                <SubmitButton pendingLabel="Starting…" variant="secondary">
                  Pay in full
                </SubmitButton>
              </form>
            </>
          )}
          {booking.status === 'DEPOSIT_PAID' && !pendingPayment && (
            <form action={initiatePaymentAction.bind(null, invoice.id, 'BALANCE', booking.id)}>
              <SubmitButton pendingLabel="Starting…">Pay balance</SubmitButton>
            </form>
          )}
        </div>
      </div>
      </Reveal>
    </div>
  );
}
