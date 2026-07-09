import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { invoicingService } from '@modules/invoicing';
import { format, money } from '@lib/money';
import { confirmBookingAction, cancelBookingAction, initiatePaymentAction, resolvePaymentAction } from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
}

export default async function BookingDetailPage({ params }: Props) {
  const { bookingId } = await params;
  const ctx = await requireStaffContext('booking.read');

  let booking;
  try {
    booking = await bookingService.getById(ctx, bookingId);
  } catch {
    notFound();
  }

  const invoice = await invoicingService.getOrCreateInvoiceForBooking(ctx, bookingId);
  const payments = await invoicingService.listPayments(ctx, invoice.id);

  const pendingPayment = payments.some((p) => p.status === 'PENDING');
  const depositDone = payments.some((p) => p.kind === 'DEPOSIT' && p.status === 'SUCCEEDED');
  const balanceDone = payments.some((p) => p.kind === 'BALANCE' && p.status === 'SUCCEEDED');

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs tracking-survey text-mist">BOOKING</p>
        <h1 className="text-2xl font-bold text-navy">{booking.id}</h1>
        <p className="mt-1 text-mist">
          {booking.seats} seat(s) · {booking.status} · {format(money(booking.priceMinor, booking.currency))}
        </p>
        <div className="mt-4 flex gap-3">
          {booking.status === 'HELD' && (
            <form action={confirmBookingAction.bind(null, booking.id)}>
              <button className="rounded-survey bg-forest px-4 py-2 text-sm font-semibold text-bone">Confirm</button>
            </form>
          )}
          {(booking.status === 'HELD' || booking.status === 'CONFIRMED') && (
            <form action={cancelBookingAction.bind(null, booking.id)}>
              <button className="rounded-survey border border-rule px-4 py-2 text-sm font-semibold text-ink">
                Cancel
              </button>
            </form>
          )}
        </div>
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
        <p className="mt-2 text-sm text-mist">Status: {invoice.status}</p>
      </div>

      <div className="border-t border-rule pt-6">
        <p className="text-xs tracking-survey text-mist">PAYMENTS</p>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-mist">No payment attempts yet.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between border-b border-rule pb-2">
                <span>
                  {p.kind} · {format(money(p.amountMinor, p.currency))} · {p.status}
                </span>
                {p.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <form action={resolvePaymentAction.bind(null, p.id, 'SUCCEEDED', booking.id)}>
                      <button className="rounded-survey bg-forest px-3 py-1 text-xs font-semibold text-bone">
                        Mark paid
                      </button>
                    </form>
                    <form action={resolvePaymentAction.bind(null, p.id, 'FAILED', booking.id)}>
                      <button className="rounded-survey border border-rule px-3 py-1 text-xs text-ink">
                        Mark failed
                      </button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex gap-3">
          {!depositDone && !pendingPayment && (
            <form action={initiatePaymentAction.bind(null, invoice.id, 'DEPOSIT', booking.id)}>
              <button className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
                Send deposit link
              </button>
            </form>
          )}
          {depositDone && !balanceDone && !pendingPayment && (
            <form action={initiatePaymentAction.bind(null, invoice.id, 'BALANCE', booking.id)}>
              <button className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
                Send balance link
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
