import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { invoicingService } from '@modules/invoicing';
import { visaService } from '@modules/visa';
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

  const travelers = await bookingService.listTravelers(ctx, bookingId);
  const lead = travelers.find((t) => t.isTourLead);
  const travelersDone = travelers.length >= booking.seats;
  const passportDone = !!lead?.passportDocumentId;
  const addonsDone = !!booking.addonsFinalizedAt;
  const setupComplete = travelersDone && passportDone && addonsDone;

  if (!setupComplete) {
    const nextHref = !travelersDone
      ? `/staff/bookings/${bookingId}/travelers/new`
      : !passportDone
        ? `/staff/bookings/${bookingId}/passport`
        : `/staff/bookings/${bookingId}/addons`;

    return (
      <div className="max-w-md space-y-6">
        <div>
          <p className="text-xs tracking-survey text-mist">BOOKING SETUP</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">{booking.id}</h1>
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

  // Read-only -- visa processing itself is VISA_FACILITATOR's job (DR-019),
  // which has no staff-dashboard access yet. "Not started" just means no
  // VisaApplication row exists (visaService.getApplication 404s), same
  // convention as passportDocumentId being null meaning "not uploaded".
  const visaStatuses = await Promise.all(
    travelers.map(async (t) => {
      try {
        const application = await visaService.getApplication(ctx, bookingId, t.id);
        return { traveler: t, status: application.status as string };
      } catch {
        return { traveler: t, status: 'Not started' };
      }
    }),
  );

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

      <div className="border-t border-rule pt-6">
        <p className="text-xs tracking-survey text-mist">VISA</p>
        <ul className="mt-2 space-y-1 text-sm">
          {visaStatuses.map(({ traveler, status }) => (
            <li key={traveler.id}>
              {traveler.firstName} {traveler.lastName}: {status}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
