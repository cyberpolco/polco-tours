import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { invoicingService } from '@modules/invoicing';
import { visaService } from '@modules/visa';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { format, money } from '@lib/money';
import { BOOKING_STATUS_TONE, INVOICE_STATUS_TONE, PAYMENT_STATUS_TONE, VISA_STATUS_TONE } from '@lib/status-tones';
import { confirmBookingAction, cancelBookingAction, initiatePaymentAction, resolvePaymentAction } from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
}

function visaTone(status: string): BadgeTone {
  return (VISA_STATUS_TONE as Record<string, BadgeTone>)[status] ?? 'neutral';
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
          <PageHeader eyebrow="Booking setup" title={booking.id} />
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
        <PageHeader eyebrow="Booking" title={booking.id} />
        <p className="mt-1 flex items-center gap-2 text-mist">
          {booking.seats} seat(s) · <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{booking.status}</Badge> ·{' '}
          {format(money(booking.priceMinor, booking.currency))}
        </p>
        <div className="mt-4 flex gap-3">
          {booking.status === 'HELD' && (
            <form action={confirmBookingAction.bind(null, booking.id)}>
              <SubmitButton variant="success" pendingLabel="Confirming…">
                Confirm
              </SubmitButton>
            </form>
          )}
          {(booking.status === 'HELD' || booking.status === 'CONFIRMED') && (
            <form action={cancelBookingAction.bind(null, booking.id)}>
              <SubmitButton variant="secondary" pendingLabel="Cancelling…">
                Cancel
              </SubmitButton>
            </form>
          )}
        </div>
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
        <p className="mt-2 flex items-center gap-2 text-sm text-mist">
          Status: <Badge tone={INVOICE_STATUS_TONE[invoice.status]}>{invoice.status}</Badge>
        </p>
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">Payments</p>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-mist">No payment attempts yet.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between border-b border-rule pb-2">
                <span className="flex items-center gap-2">
                  {p.kind} · {format(money(p.amountMinor, p.currency))}
                  <Badge tone={PAYMENT_STATUS_TONE[p.status]}>{p.status}</Badge>
                </span>
                {p.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <form action={resolvePaymentAction.bind(null, p.id, 'SUCCEEDED', booking.id)}>
                      <SubmitButton variant="success" size="compact" pendingLabel="Saving…">
                        Mark paid
                      </SubmitButton>
                    </form>
                    <form action={resolvePaymentAction.bind(null, p.id, 'FAILED', booking.id)}>
                      <SubmitButton variant="secondary" size="compact" pendingLabel="Saving…">
                        Mark failed
                      </SubmitButton>
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
              <SubmitButton pendingLabel="Sending…">Send deposit link</SubmitButton>
            </form>
          )}
          {depositDone && !balanceDone && !pendingPayment && (
            <form action={initiatePaymentAction.bind(null, invoice.id, 'BALANCE', booking.id)}>
              <SubmitButton pendingLabel="Sending…">Send balance link</SubmitButton>
            </form>
          )}
        </div>
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">Visa</p>
        <ul className="mt-2 space-y-1 text-sm">
          {visaStatuses.map(({ traveler, status }) => (
            <li key={traveler.id} className="flex items-center gap-2">
              {traveler.firstName} {traveler.lastName}: <Badge tone={visaTone(status)}>{status}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
