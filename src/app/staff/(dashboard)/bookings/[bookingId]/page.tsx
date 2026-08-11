import { notFound } from 'next/navigation';
import type { Currency } from '@prisma/client';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { financeService } from '@modules/finance';
import { invoicingService } from '@modules/invoicing';
import { itineraryService } from '@modules/itinerary';
import { ratingsService } from '@modules/ratings';
import { visaService } from '@modules/visa';
import { BackLink } from '@/components/ui/BackLink';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { format, formatOrPending, money } from '@lib/money';
import { COUNTRY_CODES_BY_ALPHA2 } from '@lib/country-codes';
import { BOOKING_STATUS_TONE, INVOICE_STATUS_TONE, ITINERARY_STATUS_TONE, PAYMENT_STATUS_TONE, VISA_STATUS_TONE } from '@lib/status-tones';
import { can } from '@lib/rbac';
import { CouponForm } from '@/components/CouponForm';
import {
  acceptQuotationAction,
  applyCouponAction,
  confirmBookingAction,
  cancelBookingAction,
  convertToItineraryAction,
  createItineraryAction,
  deleteBookingAction,
  issueRatingCodeAction,
  initiatePaymentAction,
  refundBookingAction,
  removeCouponAction,
  resolvePaymentAction,
  sendQuotationAction,
} from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
}

function visaTone(status: string): BadgeTone {
  return (VISA_STATUS_TONE as Record<string, BadgeTone>)[status] ?? 'neutral';
}

const OPERATING_COUNTRY_CODES = new Set(['NA', 'CD', 'ZM', 'ZW']);

function countryName(alpha2: string, tCountries: (code: string) => string): string {
  return OPERATING_COUNTRY_CODES.has(alpha2) ? tCountries(alpha2) : COUNTRY_CODES_BY_ALPHA2[alpha2]?.name ?? alpha2;
}

// Anything but the terminal/in-flight statuses (IN_PROGRESS/COMPLETED/
// CANCELLED/REFUNDED, plus unreachable DRAFT) can still be cancelled -- see
// canTransition's TRANSITIONS table in modules/booking/domain.ts (kept
// internal to the module; this list is the UI's own).
const CANCELLABLE_STATUSES = ['AWAITING_QUOTATION', 'QUOTATION_SENT', 'AWAITING_DEPOSIT', 'DEPOSIT_PAID', 'FULLY_PAID', 'CONFIRMED'];

export default async function BookingDetailPage({ params }: Props) {
  const { bookingId } = await params;
  const ctx = await requireStaffContext('booking.read');
  const t = await getTranslations('StaffBookingDetail');
  const tCommon = await getTranslations('Common');
  const tBookingStatus = await getTranslations('BookingStatusLabel');
  const tInvoiceStatus = await getTranslations('InvoiceStatusLabel');
  const tPaymentStatus = await getTranslations('PaymentStatusLabel');
  const tPaymentKind = await getTranslations('PaymentKindLabel');
  const tItineraryStatus = await getTranslations('ItineraryStatusLabel');
  const tVisaStatus = await getTranslations('VisaStatusLabel');
  const tCountries = await getTranslations('Countries');
  const tTags = await getTranslations('TripTags');
  const tAddons = await getTranslations('TripAddons');

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
  const addonsDone = !!booking.addonsFinalizedAt;
  const travelersDone = travelers.length >= booking.seats;
  // Passports are only collected at all if the finalized add-ons included
  // Visa Assistance (booking.requiresPassportUpload) -- and when they are,
  // EVERY traveler needs one, not just the tour lead.
  const passportDone = !booking.requiresPassportUpload || travelers.every((tv) => !!tv.passportDocumentId);
  const setupComplete = addonsDone && travelersDone && passportDone;

  if (!setupComplete) {
    const nextHref = !addonsDone
      ? `/staff/bookings/${bookingId}/addons`
      : !travelersDone
        ? `/staff/bookings/${bookingId}/travelers/new`
        : `/staff/bookings/${bookingId}/passport`;

    return (
      <div className="max-w-md space-y-6">
        <div>
          <PageHeader eyebrow={t('setupEyebrow')} title={booking.bookingReference} />
          <p className="mt-1 flex items-center gap-2 text-mist">
            {t('seats', { count: booking.seats })} ·{' '}
            <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{tBookingStatus(booking.status)}</Badge> ·{' '}
            {formatOrPending(booking.priceMinor, booking.currency)}
          </p>
        </div>
        <ul className="space-y-2 text-sm">
          <li className={addonsDone ? 'text-forest' : 'text-ink'}>
            {addonsDone ? '✓' : '○'} {t('addOns')}
          </li>
          <li className={travelersDone ? 'text-forest' : 'text-ink'}>
            {travelersDone ? '✓' : '○'} {t('travelersCount', { current: travelers.length, total: booking.seats })}
          </li>
          {booking.requiresPassportUpload && (
            <li className={passportDone ? 'text-forest' : 'text-ink'}>
              {passportDone ? '✓' : '○'}{' '}
              {t('passportsCount', {
                current: travelers.filter((tv) => !!tv.passportDocumentId).length,
                total: travelers.length,
              })}
            </li>
          )}
        </ul>
        <LinkButton href={nextHref}>{t('continueSetup')}</LinkButton>
      </div>
    );
  }

  const invoice = await invoicingService.getOrCreateInvoiceForBooking(ctx, bookingId);
  const payments = await invoicingService.listPayments(ctx, invoice.id);

  // Only relevant while a quotation hasn't been sent yet -- pre-fills the
  // "Send quotation" amount below from whatever cost breakdown staff have
  // already saved for this TAILOR_MADE request (DR-092). Gated on
  // booking.confirm (not just this page's own booking.read baseline) --
  // TOUR_GUIDE/DRIVER/VISA_FACILITATOR/TOURIST can all view this page but
  // don't hold booking.confirm, and getBookingCostBreakdown asserts it.
  const costBreakdown =
    booking.status === 'AWAITING_QUOTATION' && booking.origin === 'TAILOR_MADE' && can(ctx, 'booking.confirm')
      ? await financeService.getBookingCostBreakdown(ctx, bookingId)
      : null;

  // Trip summary for the "Confirm & Pay" review, staff's own New Booking
  // flow (/staff/bookings/new -> pick a package+departure) never showed
  // one -- staff previously saw only bare invoice cells with no reminder
  // of which package/departure/add-ons this invoice is actually for.
  // PREDEFINED_PACKAGE-only: a TAILOR_MADE booking already gets its own
  // rich context (country/dates/description/preferences) in the header
  // block above, and has no real Departure to summarize until it's
  // converted to an operational itinerary.
  let packageSummary: { title: string; country: string; startDate: Date; endDate: Date | null } | null = null;
  let bookingAddonsWithNames: { id: string; name: string; priceMinor: number; currency: Currency }[] = [];
  if (booking.origin === 'PREDEFINED_PACKAGE' && booking.departureId) {
    const detail = await catalogService.getDepartureDetail(ctx, booking.departureId);
    if (detail.departure.tourPackageId) {
      const pkg = await catalogService.getPackage(ctx, detail.departure.tourPackageId);
      packageSummary = {
        title: pkg.title,
        country: detail.packageCountry,
        startDate: detail.departure.startDate,
        endDate: detail.departure.endDate,
      };
    }
    const [addons, addonServices] = await Promise.all([
      bookingService.listAddons(ctx, bookingId),
      catalogService.listActiveAddonServices(ctx),
    ]);
    const addonNameById = new Map(addonServices.map((a) => [a.id, a.name]));
    bookingAddonsWithNames = addons.map((a) => ({
      id: a.id,
      name: addonNameById.get(a.addonServiceId) ?? t('addonFallbackName'),
      priceMinor: a.priceMinor,
      currency: a.currency,
    }));
  }

  // Customer Ratings & Feedback (DR-037) -- only an actor who could issue a
  // code needs to see this panel at all.
  const canIssueRating = can(ctx, 'rating.issue');
  const ratingCode = canIssueRating ? await ratingsService.getRatingCodeForBooking(ctx, bookingId) : null;

  const pendingPayment = payments.some((p) => p.status === 'PENDING');
  const couponEditable = !payments.some((p) => p.status === 'SUCCEEDED');

  // Read-only -- visa processing itself is VISA_FACILITATOR's job (DR-019),
  // which has no staff-dashboard access yet. "Not started" just means no
  // VisaApplication row exists (visaService.getApplication 404s), same
  // convention as passportDocumentId being null meaning "not uploaded".
  const visaStatuses = await Promise.all(
    travelers.map(async (tv) => {
      try {
        const application = await visaService.getApplication(ctx, bookingId, tv.id);
        return {
          traveler: tv,
          status: application.status as string,
          rejectionReason: application.rejectionReason,
          resubmissionCount: application.resubmissionCount,
        };
      } catch {
        return { traveler: tv, status: t('notStarted'), rejectionReason: null, resubmissionCount: 0 };
      }
    }),
  );

  return (
    <div className="space-y-8">
      <div>
        {/* Add-ons/travelers/passport stay re-editable up to first payment
            (setAddons has no status gate) -- the invoice snapshot below is
            frozen at creation regardless, so hiding this once a payment has
            actually succeeded avoids inviting an edit that can no longer
            affect what was billed. */}
        {booking.status === 'AWAITING_DEPOSIT' && (
          <BackLink href={`/staff/bookings/${bookingId}/addons`}>{t('reviewSetupDetails')}</BackLink>
        )}
        <PageHeader eyebrow={t('bookingEyebrow')} title={booking.bookingReference} />
        <p className="mt-1 text-xs text-mist">
          {booking.origin === 'TAILOR_MADE' ? t('tailorMadeRequest') : t('predefinedPackage')}
        </p>
        <p className="mt-1 flex items-center gap-2 text-mist">
          {t('seats', { count: booking.seats })} ·{' '}
          <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{tBookingStatus(booking.status)}</Badge> ·{' '}
          {formatOrPending(booking.priceMinor, booking.currency)}
        </p>
        {booking.specialRequests && (
          <p className="mt-1 text-sm text-mist">{t('specialRequestsLabel', { text: booking.specialRequests })}</p>
        )}
        {booking.origin === 'TAILOR_MADE' && (
          <p className="mt-1 text-sm text-mist">
            {booking.customCountry && countryName(booking.customCountry, tCountries)} · {booking.customTravelStart?.toLocaleDateString()} –{' '}
            {booking.customTravelEnd?.toLocaleDateString()}
            {booking.customDescription && <> · {booking.customDescription}</>}
          </p>
        )}
        {/* preferredCountries[0] === customCountry always (that's how it's
            derived, DR-047) -- only show this line when the guest picked
            more than one, so it doesn't just repeat the line above. */}
        {booking.origin === 'TAILOR_MADE' && booking.preferredCountries.length > 1 && (
          <p className="mt-1 text-sm text-mist">
            {t('alsoConsidering', { list: booking.preferredCountries.slice(1).map((c) => countryName(c, tCountries)).join(', ') })}
          </p>
        )}
        {booking.origin === 'TAILOR_MADE' && booking.contactEmail && (
          <p className="mt-1 text-sm text-mist">{t('contactEmailLabel', { email: booking.contactEmail })}</p>
        )}
        {booking.origin === 'TAILOR_MADE' && booking.preferredTags.length > 0 && (
          <p className="mt-1 text-sm text-mist">{t('interestedIn', { list: booking.preferredTags.map((tag) => tTags(tag)).join(', ') })}</p>
        )}
        {booking.origin === 'TAILOR_MADE' && booking.preferredSites.length > 0 && (
          <p className="mt-1 text-sm text-mist">{t('sitesOfInterest', { list: booking.preferredSites.join(', ') })}</p>
        )}
        {booking.origin === 'TAILOR_MADE' && booking.preferredAddons.length > 0 && (
          <p className="mt-1 text-sm text-mist">
            {t('addonsOfInterest', { list: booking.preferredAddons.map((code) => tAddons(code)).join(', ') })}
          </p>
        )}
        {booking.origin === 'TAILOR_MADE' && (booking.countryOfResidence || booking.citizenship) && (
          <p className="mt-1 text-sm text-mist">
            {booking.countryOfResidence && t('residence', { country: countryName(booking.countryOfResidence, tCountries) })}
            {booking.countryOfResidence && booking.citizenship && ' · '}
            {booking.citizenship && t('citizenship', { country: countryName(booking.citizenship, tCountries) })}
          </p>
        )}
        {booking.origin === 'TAILOR_MADE' && booking.priceMinor != null && !booking.departureId && (
          <form action={convertToItineraryAction.bind(null, booking.id)} className="mt-3">
            <SubmitButton variant="secondary" pendingLabel={t('convertingToItinerary')}>
              {t('convertToItinerary')}
            </SubmitButton>
          </form>
        )}
        {booking.departureId && (
          <p className="mt-3 text-sm">
            <LinkButton href={`/staff/departures/${booking.departureId}`}>{t('assignVehicleDriverGuide')}</LinkButton>
          </p>
        )}

        {booking.status === 'AWAITING_QUOTATION' && booking.origin === 'TAILOR_MADE' && can(ctx, 'booking.confirm') && (
          <p className="mt-4 text-sm">
            <LinkButton href={`/staff/bookings/${bookingId}/cost-breakdown`}>
              {costBreakdown ? t('editCostBreakdown') : t('buildCostBreakdown')}
            </LinkButton>
          </p>
        )}
        {booking.status === 'AWAITING_QUOTATION' && (
          <form action={sendQuotationAction.bind(null, booking.id)} className="mt-4 flex max-w-sm items-end gap-3">
            <FormField label={t('quoteAmount')} htmlFor="amount">
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={costBreakdown?.suggestedTotalMinor != null ? (costBreakdown.suggestedTotalMinor / 100).toFixed(2) : undefined}
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
            <FormField label={t('currency')} htmlFor="currency">
              <Select name="currency" required defaultValue={costBreakdown?.currency}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="NAD">NAD</option>
                <option value="CDF">CDF</option>
              </Select>
            </FormField>
            <SubmitButton pendingLabel={t('sending')}>{t('sendQuotation')}</SubmitButton>
          </form>
        )}
        {costBreakdown?.suggestedTotalMinor != null && (
          <p className="mt-1 text-xs text-mist">
            {t('suggestedFromBreakdown', { amount: format(money(costBreakdown.suggestedTotalMinor, costBreakdown.currency)) })}
          </p>
        )}
        {booking.status === 'QUOTATION_SENT' && (
          <form action={acceptQuotationAction.bind(null, booking.id)} className="mt-4">
            <SubmitButton pendingLabel={t('accepting')}>{t('acceptQuotationOnBehalf')}</SubmitButton>
          </form>
        )}
        {booking.origin === 'PREDEFINED_PACKAGE' && (booking.status === 'AWAITING_QUOTATION' || booking.status === 'QUOTATION_SENT') && (
          <p className="mt-2 text-xs text-amber">{t('releasedSeatHoldWarning')}</p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <div className="flex gap-3">
            {(booking.status === 'DEPOSIT_PAID' || booking.status === 'FULLY_PAID') && (
              <form action={confirmBookingAction.bind(null, booking.id)}>
                <SubmitButton variant="success" pendingLabel={t('confirming')}>
                  {t('confirm')}
                </SubmitButton>
              </form>
            )}
            {CANCELLABLE_STATUSES.includes(booking.status) && (
              <form action={cancelBookingAction.bind(null, booking.id)}>
                <SubmitButton variant="secondary" pendingLabel={t('cancelling')}>
                  {t('cancel')}
                </SubmitButton>
              </form>
            )}
            {booking.status === 'CANCELLED' && (
              <form action={refundBookingAction.bind(null, booking.id)}>
                <SubmitButton variant="secondary" pendingLabel={t('refunding')}>
                  {t('markRefunded')}
                </SubmitButton>
              </form>
            )}
          </div>
          {/* DR-058: SUPERADMIN-only, any status -- the write control itself
              renders only for SUPERADMIN (same convention as
              country-regulations' canWrite) since PLATFORM_ADMIN would pass
              this route's booking.delete permission but still 403 in
              bookingService.deleteBooking's own isBookingDeleter check. */}
          {ctx.roles.includes('SUPERADMIN') && (
            <form action={deleteBookingAction.bind(null, booking.id)}>
              <SubmitButton
                variant="secondary"
                pendingLabel={t('deleting')}
                confirmMessage={t('deleteBookingConfirm')}
              >
                {t('deleteBooking')}
              </SubmitButton>
            </form>
          )}
        </div>
      </div>

      {packageSummary && (
        <div>
          <div className="survey-rule mb-6" />
          <p className="eyebrow text-mist">{t('tripSummary')}</p>
          <Card className="mt-2">
            <p className="font-semibold text-navy">{packageSummary.title}</p>
            <p className="mt-1 text-sm text-mist">
              {countryName(packageSummary.country, tCountries)} · {packageSummary.startDate.toLocaleDateString()}
              {packageSummary.endDate && <> – {packageSummary.endDate.toLocaleDateString()}</>}
            </p>
          </Card>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="eyebrow text-mist">{t('travelersCount', { current: travelers.length, total: booking.seats })}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {travelers.map((tv) => (
                  <li key={tv.id}>
                    {tv.firstName} {tv.lastName} {tv.isTourLead && <span className="text-forest">{t('tourLeadParenthetical')}</span>}
                    {tv.isTourLead && tv.emergencyContactName && (
                      <div className="text-xs text-mist">
                        {t('emergency', { name: tv.emergencyContactName })}
                        {tv.emergencyContactRelation && ` (${tv.emergencyContactRelation})`}
                        {tv.emergencyContactPhone && ` · ${tv.emergencyContactPhone}`}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="eyebrow text-mist">{t('addOns')}</p>
              {bookingAddonsWithNames.length === 0 ? (
                <p className="mt-2 text-sm text-mist">{t('addOnsNone')}</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {bookingAddonsWithNames.map((a) => (
                    <li key={a.id}>
                      {a.name} · {format(money(a.priceMinor, a.currency))}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">{t('invoice')}</p>
        <Card className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-5">
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
          <div>
            <p className="text-xs text-mist">{t('depositPct')}</p>
            <p className="text-lg font-semibold text-navy">{format(money(invoice.depositMinor, invoice.currency))}</p>
          </div>
          <div>
            <p className="text-xs text-mist">{t('balancePct')}</p>
            <p className="text-lg font-semibold text-navy">{format(money(invoice.balanceMinor, invoice.currency))}</p>
          </div>
          <div>
            {/* Settings module (DR-042): an informational split of the total
                above, not an extra charge -- staff-only, deliberately not
                shown on the guest-facing booking page (a customer could
                otherwise misread this as something they owe on top). */}
            <p className="text-xs text-mist">{t('platformFee')}</p>
            <p className="text-sm">
              {invoice.platformFeeMinor != null ? format(money(invoice.platformFeeMinor, invoice.currency)) : '—'}
            </p>
          </div>
        </Card>
        <CouponForm
          appliedCode={invoice.couponCode}
          editable={couponEditable}
          onApply={applyCouponAction.bind(null, invoice.id, booking.id)}
          onRemove={removeCouponAction.bind(null, invoice.id, booking.id)}
        />
        <p className="mt-2 flex items-center gap-2 text-sm text-mist">
          {t('status')} <Badge tone={INVOICE_STATUS_TONE[invoice.status]}>{tInvoiceStatus(invoice.status)}</Badge>
        </p>
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">{t('payments')}</p>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noPaymentAttempts')}</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between border-b border-rule pb-2">
                <span className="flex items-center gap-2">
                  {tPaymentKind(p.kind)} · {format(money(p.amountMinor, p.currency))}
                  <Badge tone={PAYMENT_STATUS_TONE[p.status]}>{tPaymentStatus(p.status)}</Badge>
                </span>
                {p.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <form action={resolvePaymentAction.bind(null, p.id, 'SUCCEEDED', booking.id)}>
                      <SubmitButton variant="success" size="compact" pendingLabel={tCommon('saving')}>
                        {t('markPaid')}
                      </SubmitButton>
                    </form>
                    <form action={resolvePaymentAction.bind(null, p.id, 'FAILED', booking.id)}>
                      <SubmitButton variant="secondary" size="compact" pendingLabel={tCommon('saving')}>
                        {t('markFailed')}
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
                <SubmitButton pendingLabel={t('sending')}>{t('sendDepositLink')}</SubmitButton>
              </form>
              <form action={initiatePaymentAction.bind(null, invoice.id, 'FULL', booking.id)}>
                <SubmitButton pendingLabel={t('sending')}>{t('sendFullPaymentLink')}</SubmitButton>
              </form>
            </>
          )}
          {booking.status === 'DEPOSIT_PAID' && !pendingPayment && (
            <form action={initiatePaymentAction.bind(null, invoice.id, 'BALANCE', booking.id)}>
              <SubmitButton pendingLabel={t('sending')}>{t('sendBalanceLink')}</SubmitButton>
            </form>
          )}
        </div>
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">{t('visa')}</p>
        <ul className="mt-2 space-y-1 text-sm">
          {visaStatuses.map(({ traveler, status, rejectionReason, resubmissionCount }) => (
            <li key={traveler.id} className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2">
                {traveler.firstName} {traveler.lastName}:{' '}
                <Badge tone={visaTone(status)}>
                  {status === 'SUBMITTED' || status === 'APPROVED' || status === 'REJECTED' ? tVisaStatus(status) : status}
                </Badge>
                {resubmissionCount > 0 && <span className="text-xs text-mist">{t('resubmitted', { count: resubmissionCount })}</span>}
              </span>
              {status === 'REJECTED' && rejectionReason && (
                <span className="text-xs text-mist">{t('reason', { reason: rejectionReason })}</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">{t('itinerary')}</p>
        {itinerary ? (
          <p className="mt-2 text-sm">
            <Badge tone={ITINERARY_STATUS_TONE[itinerary.status]}>{tItineraryStatus(itinerary.status)}</Badge>{' '}
            <LinkButton href={`/staff/itineraries/${itinerary.id}`}>{t('openItinerary')}</LinkButton>
          </p>
        ) : (
          <form action={createItineraryAction.bind(null, booking.id)} className="mt-2">
            <SubmitButton variant="secondary" pendingLabel={t('creatingItinerary')}>
              {t('createItinerary')}
            </SubmitButton>
          </form>
        )}
      </div>

      {canIssueRating && (
        <div>
          <div className="survey-rule mb-6" />
          <p className="eyebrow text-mist">{t('ratingCode')}</p>
          {ratingCode ? (
            <p className="mt-2 text-sm">
              <span className="font-mono">{ratingCode.code}</span>{' '}
              {ratingCode.usedAt ? (
                <Badge tone="neutral">{t('used')}</Badge>
              ) : ratingCode.expiresAt < new Date() ? (
                <Badge tone="warning">{t('expired')}</Badge>
              ) : (
                <Badge tone="success">{t('activeUntil', { date: ratingCode.expiresAt.toLocaleDateString() })}</Badge>
              )}
            </p>
          ) : invoice.status === 'PAID' ? (
            <form action={issueRatingCodeAction.bind(null, booking.id)} className="mt-2">
              <SubmitButton variant="secondary" pendingLabel={t('generating')}>
                {t('generateRatingCode')}
              </SubmitButton>
            </form>
          ) : (
            <p className="mt-2 text-sm text-mist">{t('availableOncePaid')}</p>
          )}
        </div>
      )}
    </div>
  );
}
