import { notFound } from 'next/navigation';
import { requireGuestContext } from '@lib/guest-guard';
import { format, money } from '@lib/money';
import { bookingService } from '@modules/booking';
import { invoicingService } from '@modules/invoicing';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { BOOKING_STATUS_TONE, PAYMENT_STATUS_TONE } from '@lib/status-tones';
import { BOOKING_WIZARD_STEPS } from '../../booking-wizard-steps';
import { cancelBookingAction, initiatePaymentAction } from './actions';

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

  const travelers = await bookingService.listTravelers(ctx, bookingId);
  const lead = travelers.find((t) => t.isTourLead);
  const travelersDone = travelers.length >= booking.seats;
  const passportDone = !!lead?.passportDocumentId;
  const addonsDone = !!booking.addonsFinalizedAt;
  const setupComplete = travelersDone && passportDone && addonsDone;

  if (!setupComplete) {
    const nextHref = !travelersDone
      ? `/booking/${bookingId}/travelers/new`
      : !passportDone
        ? `/booking/${bookingId}/passport`
        : `/booking/${bookingId}/addons`;
    const currentStepIndex = !travelersDone ? 1 : !passportDone ? 2 : 3;

    return (
      <div className="max-w-md space-y-6">
        <StepIndicator steps={BOOKING_WIZARD_STEPS} currentIndex={currentStepIndex} />
        <div>
          <p className="eyebrow mt-4 text-mist">Booking setup</p>
          <p className="mt-1 flex items-center gap-2 text-mist">
            {booking.seats} seat(s) · <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{booking.status}</Badge> ·{' '}
            {format(money(booking.priceMinor, booking.currency))}
          </p>
        </div>
        <ul className="space-y-2 text-sm">
          <li className={travelersDone ? 'text-forest' : 'text-ink'}>
            {travelersDone ? '✓' : '○'} Travelers ({travelers.length}/{booking.seats})
          </li>
          <li className={passportDone ? 'text-forest' : 'text-ink'}>{passportDone ? '✓' : '○'} Tour lead passport</li>
          <li className={addonsDone ? 'text-forest' : 'text-ink'}>{addonsDone ? '✓' : '○'} Add-ons</li>
        </ul>
        <LinkButton href={nextHref}>Continue setup</LinkButton>
      </div>
    );
  }

  const invoice = await invoicingService.getOrCreateInvoiceForBooking(ctx, bookingId);
  const payments = await invoicingService.listPayments(ctx, invoice.id);

  const pendingPayment = payments.some((p) => p.status === 'PENDING');
  const depositDone = payments.some((p) => p.kind === 'DEPOSIT' && p.status === 'SUCCEEDED');
  const balanceDone = payments.some((p) => p.kind === 'BALANCE' && p.status === 'SUCCEEDED');

  return (
    <div className="space-y-8">
      <StepIndicator steps={BOOKING_WIZARD_STEPS} currentIndex={4} />
      <div>
        <p className="eyebrow mt-4 text-mist">Your booking</p>
        <p className="mt-1 flex items-center gap-2 text-mist">
          {booking.seats} seat(s) · <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{booking.status}</Badge> ·{' '}
          {format(money(booking.priceMinor, booking.currency))}
        </p>
        {payments.length > 0 && (
          <div className="mt-3">
            <Alert tone="success">
              Your reference code: <span className="font-mono font-semibold">{booking.confirmationCode}</span> --
              keep this to look up your booking later at /find-booking.
            </Alert>
          </div>
        )}
        {(booking.status === 'HELD' || booking.status === 'CONFIRMED') && (
          <form action={cancelBookingAction.bind(null, booking.id)} className="mt-4">
            <SubmitButton variant="secondary" pendingLabel="Cancelling…">
              Cancel booking
            </SubmitButton>
          </form>
        )}
      </div>

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

        <div className="mt-4 flex gap-3">
          {!depositDone && !pendingPayment && (
            <form action={initiatePaymentAction.bind(null, invoice.id, 'DEPOSIT', booking.id)}>
              <SubmitButton pendingLabel="Starting…">Pay deposit</SubmitButton>
            </form>
          )}
          {depositDone && !balanceDone && !pendingPayment && (
            <form action={initiatePaymentAction.bind(null, invoice.id, 'BALANCE', booking.id)}>
              <SubmitButton pendingLabel="Starting…">Pay balance</SubmitButton>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
