import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireGuestContext } from '@lib/guest-guard';
import { format, money } from '@lib/money';
import { bookingService } from '@modules/booking';
import { invoicingService } from '@modules/invoicing';
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

    return (
      <div className="max-w-md space-y-6">
        <div>
          <p className="text-xs tracking-survey text-mist">BOOKING SETUP</p>
          <p className="mt-1 text-mist">
            {booking.seats} seat(s) · {booking.status} · {format(money(booking.priceMinor, booking.currency))}
          </p>
        </div>
        <ul className="space-y-2 text-sm">
          <li className={travelersDone ? 'text-forest' : 'text-ink'}>
            {travelersDone ? '✓' : '○'} Travelers ({travelers.length}/{booking.seats})
          </li>
          <li className={passportDone ? 'text-forest' : 'text-ink'}>{passportDone ? '✓' : '○'} Tour lead passport</li>
          <li className={addonsDone ? 'text-forest' : 'text-ink'}>{addonsDone ? '✓' : '○'} Add-ons</li>
        </ul>
        <Link href={nextHref} className="inline-block rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
          Continue setup
        </Link>
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
      <div>
        <p className="text-xs tracking-survey text-mist">YOUR BOOKING</p>
        <p className="mt-1 text-mist">
          {booking.seats} seat(s) · {booking.status} · {format(money(booking.priceMinor, booking.currency))}
        </p>
        {payments.length > 0 && (
          <p className="mt-3 rounded-survey border border-forest bg-forest/5 px-3 py-2 text-sm text-forest">
            Your reference code: <span className="font-mono font-semibold">{booking.confirmationCode}</span> -- keep
            this to look up your booking later at /find-booking.
          </p>
        )}
        {(booking.status === 'HELD' || booking.status === 'CONFIRMED') && (
          <form action={cancelBookingAction.bind(null, booking.id)} className="mt-4">
            <button className="rounded-survey border border-rule px-4 py-2 text-sm font-semibold text-ink">
              Cancel booking
            </button>
          </form>
        )}
      </div>

      <div className="border-t border-rule pt-6">
        <p className="text-xs tracking-survey text-mist">INVOICE</p>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-mist">Subtotal</dt>
            <dd>{format(money(invoice.subtotalMinor, invoice.currency))}</dd>
          </div>
          <div>
            <dt className="text-mist">Tax</dt>
            <dd>{format(money(invoice.taxMinor, invoice.currency))}</dd>
          </div>
          <div>
            <dt className="text-mist">Deposit (40%)</dt>
            <dd>{format(money(invoice.depositMinor, invoice.currency))}</dd>
          </div>
          <div>
            <dt className="text-mist">Balance (60%)</dt>
            <dd>{format(money(invoice.balanceMinor, invoice.currency))}</dd>
          </div>
        </dl>
      </div>

      <div className="border-t border-rule pt-6">
        <p className="text-xs tracking-survey text-mist">PAYMENT</p>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-mist">No payment requested yet.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between border-b border-rule pb-2">
                <span>
                  {p.kind} · {format(money(p.amountMinor, p.currency))} · {p.status}
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
              <button className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
                Pay deposit
              </button>
            </form>
          )}
          {depositDone && !balanceDone && !pendingPayment && (
            <form action={initiatePaymentAction.bind(null, invoice.id, 'BALANCE', booking.id)}>
              <button className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
                Pay balance
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
