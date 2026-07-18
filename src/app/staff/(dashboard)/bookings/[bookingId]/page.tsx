import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { invoicingService } from '@modules/invoicing';
import { itineraryService } from '@modules/itinerary';
import { ratingsService } from '@modules/ratings';
import { visaService } from '@modules/visa';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { format, formatOrPending, money } from '@lib/money';
import { BOOKING_STATUS_TONE, INVOICE_STATUS_TONE, ITINERARY_STATUS_TONE, PAYMENT_STATUS_TONE, VISA_STATUS_TONE } from '@lib/status-tones';
import { can } from '@lib/rbac';
import {
  confirmBookingAction,
  cancelBookingAction,
  convertToItineraryAction,
  createItineraryAction,
  issueRatingCodeAction,
  initiatePaymentAction,
  refundBookingAction,
  resolvePaymentAction,
  sendQuotationAction,
} from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
}

function visaTone(status: string): BadgeTone {
  return (VISA_STATUS_TONE as Record<string, BadgeTone>)[status] ?? 'neutral';
}

// Matches (guest)/plan-my-trip/plan-my-trip-form.tsx's own titleCase --
// PackageTag values are SCREAMING_CASE at the DB layer (e.g. "WILDLIFE").
function titleCase(tag: string): string {
  return tag.charAt(0) + tag.slice(1).toLowerCase();
}

// Anything but the terminal/in-flight statuses (IN_PROGRESS/COMPLETED/
// CANCELLED/REFUNDED, plus unreachable DRAFT) can still be cancelled -- see
// canTransition's TRANSITIONS table in modules/booking/domain.ts (kept
// internal to the module; this list is the UI's own).
const CANCELLABLE_STATUSES = ['AWAITING_QUOTATION', 'QUOTATION_SENT', 'AWAITING_DEPOSIT', 'DEPOSIT_PAID', 'FULLY_PAID', 'CONFIRMED'];

export default async function BookingDetailPage({ params }: Props) {
  const { bookingId } = await params;
  const ctx = await requireStaffContext('booking.read');

  let booking;
  try {
    booking = await bookingService.getById(ctx, bookingId);
  } catch {
    notFound();
  }

  // Itinerary Management (DR-033) -- null just means none exists yet
  // (getItineraryForBooking returns null rather than 404ing, so a booking
  // with no itinerary still renders the rest of this page normally).
  const itinerary = await itineraryService.getItineraryForBooking(ctx, bookingId);

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
          <PageHeader eyebrow="Booking setup" title={booking.bookingReference} />
          <p className="mt-1 flex items-center gap-2 text-mist">
            {booking.seats} seat(s) · <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{booking.status}</Badge> ·{' '}
            {formatOrPending(booking.priceMinor, booking.currency)}
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

  // Customer Ratings & Feedback (DR-037) -- only an actor who could issue a
  // code needs to see this panel at all.
  const canIssueRating = can(ctx, 'rating.issue');
  const ratingCode = canIssueRating ? await ratingsService.getRatingCodeForBooking(ctx, bookingId) : null;

  const pendingPayment = payments.some((p) => p.status === 'PENDING');

  // Read-only -- visa processing itself is VISA_FACILITATOR's job (DR-019),
  // which has no staff-dashboard access yet. "Not started" just means no
  // VisaApplication row exists (visaService.getApplication 404s), same
  // convention as passportDocumentId being null meaning "not uploaded".
  const visaStatuses = await Promise.all(
    travelers.map(async (t) => {
      try {
        const application = await visaService.getApplication(ctx, bookingId, t.id);
        return {
          traveler: t,
          status: application.status as string,
          rejectionReason: application.rejectionReason,
          resubmissionCount: application.resubmissionCount,
        };
      } catch {
        return { traveler: t, status: 'Not started', rejectionReason: null, resubmissionCount: 0 };
      }
    }),
  );

  return (
    <div className="space-y-8">
      <div>
        <PageHeader eyebrow="Booking" title={booking.bookingReference} />
        <p className="mt-1 text-xs text-mist">{booking.origin === 'TAILOR_MADE' ? 'Tailor-made request' : 'Predefined package'}</p>
        <p className="mt-1 flex items-center gap-2 text-mist">
          {booking.seats} seat(s) · <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{booking.status}</Badge> ·{' '}
          {formatOrPending(booking.priceMinor, booking.currency)}
        </p>
        {booking.specialRequests && (
          <p className="mt-1 text-sm text-mist">Special requests: {booking.specialRequests}</p>
        )}
        {booking.origin === 'TAILOR_MADE' && (
          <p className="mt-1 text-sm text-mist">
            {booking.customCountry} · {booking.customTravelStart?.toLocaleDateString()} –{' '}
            {booking.customTravelEnd?.toLocaleDateString()}
            {booking.customDescription && <> · {booking.customDescription}</>}
          </p>
        )}
        {/* preferredCountries[0] === customCountry always (that's how it's
            derived, DR-047) -- only show this line when the guest picked
            more than one, so it doesn't just repeat the line above. */}
        {booking.origin === 'TAILOR_MADE' && booking.preferredCountries.length > 1 && (
          <p className="mt-1 text-sm text-mist">Also considering: {booking.preferredCountries.slice(1).join(', ')}</p>
        )}
        {booking.origin === 'TAILOR_MADE' && booking.contactEmail && (
          <p className="mt-1 text-sm text-mist">Contact email: {booking.contactEmail}</p>
        )}
        {booking.origin === 'TAILOR_MADE' && booking.preferredTags.length > 0 && (
          <p className="mt-1 text-sm text-mist">Interested in: {booking.preferredTags.map(titleCase).join(', ')}</p>
        )}
        {booking.origin === 'TAILOR_MADE' && booking.preferredSites.length > 0 && (
          <p className="mt-1 text-sm text-mist">Sites of interest: {booking.preferredSites.join(', ')}</p>
        )}
        {booking.origin === 'TAILOR_MADE' && booking.priceMinor != null && !booking.departureId && (
          <form action={convertToItineraryAction.bind(null, booking.id)} className="mt-3">
            <SubmitButton variant="secondary" pendingLabel="Converting…">
              Convert to operational itinerary
            </SubmitButton>
          </form>
        )}
        {booking.departureId && (
          <p className="mt-3 text-sm">
            <LinkButton href={`/staff/departures/${booking.departureId}`}>Assign vehicle/driver/guide</LinkButton>
          </p>
        )}

        {booking.status === 'AWAITING_QUOTATION' && (
          <form action={sendQuotationAction.bind(null, booking.id)} className="mt-4 flex max-w-sm items-end gap-3">
            <FormField label="Quote amount" htmlFor="amount">
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
            <FormField label="Currency" htmlFor="currency">
              <select name="currency" required className="rounded-survey border border-rule px-2 py-2">
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="NAD">NAD</option>
                <option value="CDF">CDF</option>
              </select>
            </FormField>
            <SubmitButton pendingLabel="Sending…">Send quotation</SubmitButton>
          </form>
        )}
        {booking.origin === 'PREDEFINED_PACKAGE' && (booking.status === 'AWAITING_QUOTATION' || booking.status === 'QUOTATION_SENT') && (
          <p className="mt-2 text-xs text-amber">
            This came from a released seat hold — seat availability hasn&apos;t been re-checked automatically if the
            client later accepts and proceeds to pay.
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <div className="flex gap-3">
            {(booking.status === 'DEPOSIT_PAID' || booking.status === 'FULLY_PAID') && (
              <form action={confirmBookingAction.bind(null, booking.id)}>
                <SubmitButton variant="success" pendingLabel="Confirming…">
                  Confirm
                </SubmitButton>
              </form>
            )}
            {CANCELLABLE_STATUSES.includes(booking.status) && (
              <form action={cancelBookingAction.bind(null, booking.id)}>
                <SubmitButton variant="secondary" pendingLabel="Cancelling…">
                  Cancel
                </SubmitButton>
              </form>
            )}
            {booking.status === 'CANCELLED' && (
              <form action={refundBookingAction.bind(null, booking.id)}>
                <SubmitButton variant="secondary" pendingLabel="Refunding…">
                  Mark refunded
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">Invoice</p>
        <Card className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-5">
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
          <div>
            {/* Settings module (DR-042): an informational split of the total
                above, not an extra charge -- staff-only, deliberately not
                shown on the guest-facing booking page (a customer could
                otherwise misread this as something they owe on top). */}
            <p className="text-xs text-mist">Platform fee</p>
            <p className="text-sm">
              {invoice.platformFeeMinor != null ? format(money(invoice.platformFeeMinor, invoice.currency)) : '—'}
            </p>
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
          {booking.status === 'AWAITING_DEPOSIT' && !pendingPayment && (
            <>
              <form action={initiatePaymentAction.bind(null, invoice.id, 'DEPOSIT', booking.id)}>
                <SubmitButton pendingLabel="Sending…">Send deposit link</SubmitButton>
              </form>
              <form action={initiatePaymentAction.bind(null, invoice.id, 'FULL', booking.id)}>
                <SubmitButton pendingLabel="Sending…">Send full-payment link</SubmitButton>
              </form>
            </>
          )}
          {booking.status === 'DEPOSIT_PAID' && !pendingPayment && (
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
          {visaStatuses.map(({ traveler, status, rejectionReason, resubmissionCount }) => (
            <li key={traveler.id} className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2">
                {traveler.firstName} {traveler.lastName}: <Badge tone={visaTone(status)}>{status}</Badge>
                {resubmissionCount > 0 && <span className="text-xs text-mist">(resubmitted {resubmissionCount}x)</span>}
              </span>
              {status === 'REJECTED' && rejectionReason && (
                <span className="text-xs text-mist">Reason: {rejectionReason}</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">Itinerary</p>
        {itinerary ? (
          <p className="mt-2 text-sm">
            <Badge tone={ITINERARY_STATUS_TONE[itinerary.status]}>{itinerary.status}</Badge>{' '}
            <LinkButton href={`/staff/itineraries/${itinerary.id}`}>Open itinerary</LinkButton>
          </p>
        ) : (
          <form action={createItineraryAction.bind(null, booking.id)} className="mt-2">
            <SubmitButton variant="secondary" pendingLabel="Creating…">
              Create itinerary
            </SubmitButton>
          </form>
        )}
      </div>

      {canIssueRating && (
        <div>
          <div className="survey-rule mb-6" />
          <p className="eyebrow text-mist">Rating Code</p>
          {ratingCode ? (
            <p className="mt-2 text-sm">
              <span className="font-mono">{ratingCode.code}</span>{' '}
              {ratingCode.usedAt ? (
                <Badge tone="neutral">Used</Badge>
              ) : ratingCode.expiresAt < new Date() ? (
                <Badge tone="warning">Expired</Badge>
              ) : (
                <Badge tone="success">Active until {ratingCode.expiresAt.toLocaleDateString()}</Badge>
              )}
            </p>
          ) : invoice.status === 'PAID' ? (
            <form action={issueRatingCodeAction.bind(null, booking.id)} className="mt-2">
              <SubmitButton variant="secondary" pendingLabel="Generating…">
                Generate Rating Code
              </SubmitButton>
            </form>
          ) : (
            <p className="mt-2 text-sm text-mist">Available once the invoice is fully paid.</p>
          )}
        </div>
      )}
    </div>
  );
}
