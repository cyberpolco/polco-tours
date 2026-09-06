// invoicing module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { Currency, InvoiceStatus, Locale, PaymentKind, PaymentStatus } from '@prisma/client';
import { authService, type AuthContext } from '@modules/auth';
import { bookingService, isBookingLocked, type BookingView, type CancellationRefundTier, type TravelerView } from '@modules/booking';
import { catalogService } from '@modules/catalog';
// New invoicing -> finance dependency (confirmed acyclic -- finance depends
// on {auth, catalog, booking, itinerary}, never invoicing) so a TAILOR_MADE
// booking's tax rate can be blended across its linked customized package's
// Day Template countries the same way a standard package's own cost
// breakdown already is.
import { financeService } from '@modules/finance';
import { notificationsService, type EmailAttachment } from '@modules/notifications';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { resolveGuestContact } from '@lib/guest-contact';
import { logger, newTraceId } from '@lib/logger';
import { money } from '@lib/money';
import { assertCan } from '@lib/rbac';
import { getEffectivePlatformRate } from '@lib/platform-rate';
import { validateCoupon, type CouponUnavailableReason } from '@lib/coupons';
import {
  amountForPaymentKind,
  canDownloadInvoicePdf,
  canInitiatePayment,
  computeCancellationRefundAmountMinor,
  computeInvoiceAmounts,
  type InvoiceView,
  type PaymentView,
} from './domain';
import { paymentGateway } from './gateway';
import { renderInvoicePdf, type InvoicePdfTourLead, type PdfLocale } from './invoice-pdf';
import { renderRefundNotePdf } from './refund-note-pdf';
import { invoicingRepository } from './repository';

/** DR-176 (explicit user request): the invoice/receipt PDF names the tour
 * lead -- same fields (name/phone/email) already shown for them on the
 * guest booking page and find-booking result page, never the full
 * manifest or anything more sensitive. Shared by both streamInvoicePdf
 * (ctx) and streamInvoicePdfForBookingLookup (no-ctx). */
function resolveTourLead(travelers: Pick<TravelerView, 'firstName' | 'lastName' | 'phone' | 'email' | 'isTourLead'>[]): InvoicePdfTourLead | null {
  const lead = travelers.find((t) => t.isTourLead);
  if (!lead) return null;
  return { name: `${lead.firstName} ${lead.lastName}`, phone: lead.phone, email: lead.email };
}

/** DR-169: booking reference (already ASCII-only, no slugify needed, same
 * "human id, not the raw cuid" precedent as finance's own
 * buildPackageSummaryPdfFilename) + whether this is still owed (invoice) or
 * fully settled (receipt), so the filename itself signals which one it is. */
function buildInvoicePdfFilename(bookingReference: string, status: InvoiceStatus, locale: PdfLocale): string {
  const kind = status === 'PAID' ? 'receipt' : 'invoice';
  return `${bookingReference}-${kind}-${locale}.pdf`;
}

// DR-250: the guest booking record's Locale enum ('EN'/'FR') vs. the PDF
// renderer's own lowercase PdfLocale -- every existing PDF route/action
// takes a PdfLocale directly from an explicit staff/guest choice, so this
// mapping never had to exist before notifyPaymentSucceeded needed one.
function toPdfLocale(locale: Locale): PdfLocale {
  return locale === 'FR' ? 'fr' : 'en';
}

/** DR-250 (explicit user request): best-effort invoice/receipt PDF
 * attachment for the PAYMENT_SUCCEEDED email -- same data + rendering as
 * streamInvoicePdf, just built from data notifyPaymentSucceeded already has
 * in scope instead of a fresh ctx-authenticated read. Returns `[]` (never
 * throws) on any failure -- a PDF-rendering problem must never cost the
 * guest the payment-confirmation email itself, same never-throws contract
 * notifyPaymentSucceeded's own try/catch already extends over everything
 * else in that function. */
async function buildInvoicePdfAttachment(
  organizationId: string,
  bookingReference: string,
  travelers: TravelerView[],
  invoice: InvoiceView,
  locale: Locale,
): Promise<EmailAttachment[]> {
  if (!canDownloadInvoicePdf(invoice.status)) return [];
  const log = logger(newTraceId());
  try {
    const detail = await invoicingRepository.findDetail(organizationId, invoice.id);
    const succeededPayments = (detail?.payments ?? []).filter((p) => p.status === 'SUCCEEDED');
    const pdfLocale = toPdfLocale(locale);
    const body = await renderInvoicePdf({
      locale: pdfLocale,
      status: invoice.status as Extract<InvoiceStatus, 'PARTIALLY_PAID' | 'PAID'>,
      currency: invoice.currency,
      bookingReference,
      subtotalMinor: invoice.subtotalMinor,
      discountMinor: invoice.discountMinor,
      couponCode: invoice.couponCode,
      taxMinor: invoice.taxMinor,
      platformFeeMinor: invoice.platformFeeMinor,
      totalMinor: invoice.totalMinor,
      balanceMinor: invoice.balanceMinor,
      payments: succeededPayments.map((p) => ({ kind: p.kind, amountMinor: p.amountMinor, createdAt: p.createdAt })),
      tourLead: resolveTourLead(travelers),
    });
    return [{ filename: buildInvoicePdfFilename(bookingReference, invoice.status, pdfLocale), content: body }];
  } catch (err) {
    log.error('buildInvoicePdfAttachment failed -- sending PAYMENT_SUCCEEDED without the attachment', {
      invoiceId: invoice.id,
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export interface BillingSummaryView {
  currency: Currency;
  subtotalMinor: number;
  discountMinor: number; // DR-104: 0 if no coupon applied
  taxMinor: number;
  depositMinor: number;
  balanceMinor: number;
  totalMinor: number;
  status: InvoiceStatus;
  payments: Array<{ id: string; kind: PaymentKind; amountMinor: number; currency: Currency; status: PaymentStatus }>;
}

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

// TOURIST is the only "customer" role, same convention as booking/service.ts.
function isStaff(ctx: AuthContext): boolean {
  return !ctx.roles.includes('TOURIST');
}

/** DR-207: shared by streamRefundNotePdf (staff, ctx-authenticated) and
 * generateRefundNotePdfForBookingLookup (guest, one-shot post-cancellation)
 * below -- returns null (never throws) whenever there's nothing to render,
 * same "let the caller decide 404 vs. quiet omission" shape as
 * getBillingSummaryForBookingLookup. */
async function buildRefundNotePdf(
  organizationId: string,
  booking: Pick<BookingView, 'id' | 'bookingReference' | 'cancellationReason' | 'cancellationRefundTier' | 'updatedAt'>,
  locale: PdfLocale,
): Promise<{ body: Buffer; contentType: string; filename: string } | null> {
  if (!booking.cancellationRefundTier) return null;
  const invoice = await invoicingRepository.findByBookingId(organizationId, booking.id);
  if (!invoice || invoice.refundAmountMinor == null) return null;
  const detail = await invoicingRepository.findDetail(organizationId, invoice.id);
  const paidMinor = (detail?.payments ?? [])
    .filter((p) => p.status === 'SUCCEEDED')
    .reduce((sum, p) => sum + p.amountMinor, 0);

  const body = await renderRefundNotePdf({
    locale,
    bookingReference: booking.bookingReference,
    cancelledAt: booking.updatedAt,
    reason: booking.cancellationReason ?? '',
    currency: invoice.currency,
    paidMinor,
    tier: booking.cancellationRefundTier,
    refundAmountMinor: invoice.refundAmountMinor,
  });
  return { body, contentType: 'application/pdf', filename: `refund-note-${booking.bookingReference}.pdf` };
}

/** Shared by `initiatePayment`'s auto-succeed step and `resolvePayment` --
 * the actual status-flipping + booking/notification side effects, with no
 * permission check of its own (each caller asserts its own permission
 * first). DR-074: until a real DPO integration lands (OI-01), the stub
 * gateway has no async webhook to wait for, so `initiatePayment` calls this
 * with 'SUCCEEDED' immediately instead of leaving the payment PENDING for
 * staff to resolve by hand. This deliberately supersedes DR-012's
 * "tourist can't self-resolve their own payment" fraud rule for the
 * duration of the stub -- safe only because no real money moves yet;
 * revisit (require staff/webhook resolution again) when DPO is real. */
async function applyPaymentOutcome(
  ctx: AuthContext,
  organizationId: string,
  paymentId: string,
  outcome: Extract<PaymentStatus, 'SUCCEEDED' | 'FAILED'>,
): Promise<{ payment: PaymentView; invoice: InvoiceView }> {
  const result = await invoicingRepository.resolvePayment(organizationId, paymentId, outcome);
  if (!result) throw Errors.notFound('Payment not found');

  await audit({
    actorUserId: ctx.userId,
    actorRole: ctx.roles[0],
    action: outcome === 'SUCCEEDED' ? 'payment.succeeded' : 'payment.failed',
    resourceType: 'Payment',
    resourceId: result.payment.id,
    organizationId,
  });
  if (outcome === 'SUCCEEDED') {
    // Cross-module call through booking's public interface only (module
    // boundary rule) -- moves the booking to DEPOSIT_PAID/FULLY_PAID so
    // its status reflects the payment without invoicing ever writing
    // Booking.status directly.
    await bookingService.recordPaymentReceived(ctx, result.invoice.bookingId, result.payment.kind);
    await notifyPaymentSucceeded(ctx, organizationId, result);
  } else {
    await notifyGuest(ctx, organizationId, result.invoice.bookingId, result.touristUserId, 'PAYMENT_FAILED', {
      amountMinor: result.payment.amountMinor,
      currency: result.payment.currency,
    });
  }
  // Rebuilt explicitly (not `return result`) -- touristUserId is only for
  // the notifications above, never part of this endpoint's response contract.
  return { payment: result.payment, invoice: result.invoice };
}

/** DR-215 (explicit user request): PAYMENT_SUCCEEDED bypasses notify()'s
 * WhatsApp -> SMS -> email fallback chain and sends straight over EMAIL via
 * Resend (notificationsService.notifyEmail). An anonymous guest checkout
 * session's User.email is a synthetic, undeliverable placeholder
 * (better-auth's anonymous plugin default, `temp@<id>.com`) -- notify()'s
 * EMAIL leg silently failed against it, and with WhatsApp unconfigured
 * (OI-06) and SMS on a low account balance (OI-07), this confirmation was
 * often not reaching the guest on any channel at all. Resolves the real
 * recipient address the same way bookingService.cancelForBookingLookup
 * (DR-207) and visaService.contactTraveler (DR-209) already do: the tour
 * lead Traveler's own email, falling back to Booking.contactEmail, falling
 * back to the tourist's own User.email only as a last resort -- by the time
 * a booking reaches payment, the Travelers wizard step (which requires the
 * tour lead's email) has always already run, so the first fallback is the
 * common case, not the last. New invoicing -> auth runtime dependency
 * (authService.getUser), the same shape DR-205 already established for
 * visa -> auth -- confirmed acyclic, auth never imports invoicing.
 *
 * The whole body is wrapped in try/catch and never throws -- the payment
 * itself already succeeded and committed before this runs, so a failure
 * composing or sending the *notification* (a bad lookup, a transient DB
 * blip) must never turn an already-successful payment into a 500 for the
 * guest. Same never-throws contract notificationsService.notify/notifyEmail
 * already guarantee one layer down; this extends it to the lookups above
 * them too.
 *
 * DR-250 (explicit user request): the email leg also attaches the invoice/
 * receipt PDF (buildInvoicePdfAttachment, below) -- degrades to no
 * attachment rather than no email on a rendering failure. Only the EMAIL
 * leg gets one; the notify() fallback branch below has no attachment
 * mechanism (WhatsApp/SMS), so it's plain text same as before this DR. */
/** Every other guest-facing email in this module. See src/lib/guest-contact.ts:
 * notify() would address the anonymous-session placeholder, so resolve the
 * real address off the booking first and only fall back to notify() when
 * there genuinely isn't one (charter rule 8). notifyPaymentSucceeded above
 * stays separate -- it needs the booking/travelers it already fetched for
 * the trip summary and the PDF attachment. */
async function notifyGuest(
  ctx: AuthContext,
  organizationId: string,
  bookingId: string,
  touristUserId: string,
  event: Parameters<typeof notificationsService.notifyEmail>[0],
  data: Parameters<typeof notificationsService.notifyEmail>[4],
): Promise<void> {
  const booking = await bookingService.getById(ctx, bookingId);
  const travelers = await bookingService.listTravelers(ctx, bookingId);
  const tourist = await authService.getUser(touristUserId);
  const { email, locale } = resolveGuestContact({ booking, travelers, tourist });
  if (!email) {
    await notificationsService.notify(event, touristUserId, organizationId, data);
    return;
  }
  await notificationsService.notifyEmail(event, email, locale, organizationId, data);
}

async function notifyPaymentSucceeded(
  ctx: AuthContext,
  organizationId: string,
  result: { touristUserId: string; invoice: InvoiceView; payment: PaymentView },
): Promise<void> {
  const log = logger(newTraceId());
  try {
    const booking = await bookingService.getById(ctx, result.invoice.bookingId);
    const travelers = await bookingService.listTravelers(ctx, result.invoice.bookingId);
    const tourist = await authService.getUser(result.touristUserId);
    const { email } = resolveGuestContact({ booking, travelers, tourist });

    const tripSummary = booking.departureId
      ? await catalogService.getDepartureTripSummaryForBookingLookup(organizationId, booking.departureId)
      : null;
    const notificationData = {
      bookingId: booking.bookingReference,
      amountMinor: result.payment.amountMinor,
      currency: result.payment.currency,
      paymentKind: result.payment.kind,
      seats: booking.seats,
      tripTitle: tripSummary?.title,
      tripCountry: tripSummary?.country ?? booking.customCountry ?? undefined,
      travelStart: tripSummary?.startDate ?? booking.customTravelStart ?? undefined,
      travelEnd: tripSummary?.endDate ?? booking.customTravelEnd ?? undefined,
    };

    if (email) {
      const locale = tourist?.preferredLocale ?? 'EN';
      // DR-250 (explicit user request): attach the invoice/receipt PDF to
      // this email -- best-effort, see buildInvoicePdfAttachment's own
      // comment for why a rendering failure degrades to no attachment
      // rather than skipping the email entirely.
      const attachments = await buildInvoicePdfAttachment(organizationId, booking.bookingReference, travelers, result.invoice, locale);
      await notificationsService.notifyEmail('PAYMENT_SUCCEEDED', email, locale, organizationId, notificationData, attachments);
    } else {
      // Extremely rare (no traveler manifest and no booking-level contact
      // email at all) -- fall back to the old fallback chain rather than
      // silently dropping the notification (charter rule 8).
      await notificationsService.notify('PAYMENT_SUCCEEDED', result.touristUserId, organizationId, notificationData);
    }
  } catch (err) {
    log.error('notifyPaymentSucceeded failed', {
      paymentId: result.payment.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export const invoicingService = {
  async getOrCreateInvoiceForBooking(ctx: AuthContext, bookingId: string): Promise<InvoiceView> {
    assertCan(ctx, 'invoice.read');
    const organizationId = requireOrg(ctx);

    // Anti-BOLA inherited for free: bookingService.getById already 404s if
    // this booking isn't ctx's own (tourist) or outside the org.
    const booking = await bookingService.getById(ctx, bookingId);

    const existing = await invoicingRepository.findByBookingId(organizationId, bookingId);
    if (existing) return existing;

    // Base seat price + finalized add-ons (DR-015) -- throws until the
    // traveler manifest/passport/add-ons wizard steps are all complete, so an
    // invoice's subtotal can never be created before add-ons are decided.
    const billable = await bookingService.getBillableTotal(ctx, bookingId);

    let rateBp: number;
    let platformFeeRateBp: number;
    let subtotalBaseMinor: number;

    if (booking.priceSubtotalMinor != null && booking.priceTaxRateBp != null && booking.pricePlatformFeeRateBp != null) {
      // DR-134: this booking's package price was already computed tax +
      // platform-fee inclusive, at the rate effective when it was priced --
      // trust that snapshot rather than resolving live rates again, so the
      // guest is never taxed twice.
      subtotalBaseMinor = booking.priceSubtotalMinor;
      rateBp = booking.priceTaxRateBp;
      platformFeeRateBp = booking.pricePlatformFeeRateBp;
    } else {
      // Unchanged from before DR-134: TAILOR_MADE, a departure with its own
      // manual priceOverrideMinor, or a booking that predates DR-134. A
      // PREDEFINED_PACKAGE booking's country comes from its departure's
      // package; a TAILOR_MADE booking has no departure at all, so it
      // carries its own customCountry instead (set at creation, see
      // bookingService.createTailorMadeRequest).
      let country: string;
      if (booking.departureId) {
        ({ packageCountry: country } = await catalogService.getDepartureDetail(ctx, booking.departureId));
      } else if (booking.customCountry) {
        country = booking.customCountry;
      } else {
        throw Errors.conflict('This booking has no destination country to determine tax');
      }

      // Explicit user request: a TAILOR_MADE booking's linked customized
      // package (Booking.customizedPackageId, DR-108) may itself be a combo
      // package -- blend tax across its Day Template's hotel countries the
      // same way financeService.saveCostBreakdown does for a standard
      // package, instead of taxing the whole trip at just `country`. A
      // PREDEFINED_PACKAGE departure with its own manual priceOverrideMinor
      // has no such link, so it keeps resolving `country` as a single rate,
      // same as before.
      const templateDays = booking.customizedPackageId
        ? await catalogService.listTemplateDaysForItineraryCopy(organizationId, booking.customizedPackageId)
        : [];

      try {
        ({ rateBp } = await financeService.resolveEffectiveTaxRateBp(country, templateDays));
      } catch {
        // Missing tax config is an operator gap, not a caller error.
        throw Errors.conflict('No tax rate configured for this country');
      }

      // Settings module (DR-042; additive since DR-127): the platform's fee,
      // charged to the customer on top of package price + tax. Same
      // "missing config is an operator gap" treatment as tax.
      try {
        ({ rateBp: platformFeeRateBp } = await getEffectivePlatformRate());
      } catch {
        throw Errors.conflict('No platform rate configured');
      }

      subtotalBaseMinor = billable.baseMinor;
    }

    const subtotal = money(subtotalBaseMinor + billable.addonsMinor, billable.currency);
    // DR-104/DR-127: no coupon yet at creation time (discountBp omitted) --
    // same math computeInvoiceAmounts uses for applyCoupon/removeCoupon
    // later. platformFeeMinor comes back as part of `amounts`, already
    // folded into totalMinor/depositMinor/balanceMinor.
    const amounts = computeInvoiceAmounts({
      subtotalMinor: subtotal.minor,
      currency: subtotal.currency,
      taxRateBp: rateBp,
      platformFeeRateBp,
      lateBookingSurchargeBp: booking.lateBookingSurchargeBp,
    });

    const invoice = await invoicingRepository.create(organizationId, {
      bookingId,
      currency: billable.currency,
      subtotalMinor: subtotal.minor,
      couponCode: null,
      discountBp: null,
      taxRateBp: rateBp,
      ...amounts,
      platformFeeRateBp,
      lateBookingSurchargeRateBp: booking.lateBookingSurchargeBp,
    });

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'invoice.issued',
      resourceType: 'Invoice',
      resourceId: invoice.id,
      organizationId,
    });
    await notifyGuest(ctx, organizationId, bookingId, booking.touristUserId, 'INVOICE_ISSUED', {
      bookingId: booking.bookingReference,
      amountMinor: invoice.totalMinor,
      currency: invoice.currency,
    });
    return invoice;
  },

  /** DR-169: renders a downloadable PDF once at least one payment has
   * actually succeeded -- ownership inherited from bookingService.getById,
   * same "anti-BOLA for free" convention as getOrCreateInvoiceForBooking
   * above. Deliberately reads the existing invoice via findByBookingId
   * rather than getOrCreateInvoiceForBooking -- creating one as a side
   * effect of a PDF download would be wrong, and canDownloadInvoicePdf
   * already 409s before that could matter in practice (no invoice can have
   * a succeeded payment without existing first). */
  async streamInvoicePdf(
    ctx: AuthContext,
    bookingId: string,
    locale: PdfLocale,
  ): Promise<{ body: Buffer; contentType: string; filename: string }> {
    assertCan(ctx, 'invoice.read');
    const organizationId = requireOrg(ctx);
    const booking = await bookingService.getById(ctx, bookingId);

    const invoice = await invoicingRepository.findByBookingId(organizationId, bookingId);
    if (!invoice) throw Errors.notFound('Invoice not found');
    if (!canDownloadInvoicePdf(invoice.status)) {
      throw Errors.conflict('This invoice has no successful payment yet -- nothing to download');
    }

    const detail = await invoicingRepository.findDetail(organizationId, invoice.id);
    const succeededPayments = (detail?.payments ?? []).filter((p) => p.status === 'SUCCEEDED');
    const travelers = await bookingService.listTravelers(ctx, bookingId);

    const body = await renderInvoicePdf({
      locale,
      // Narrowed by canDownloadInvoicePdf above -- ISSUED/VOID already threw.
      status: invoice.status as Extract<InvoiceStatus, 'PARTIALLY_PAID' | 'PAID'>,
      currency: invoice.currency,
      bookingReference: booking.bookingReference,
      subtotalMinor: invoice.subtotalMinor,
      discountMinor: invoice.discountMinor,
      couponCode: invoice.couponCode,
      taxMinor: invoice.taxMinor,
      platformFeeMinor: invoice.platformFeeMinor,
      totalMinor: invoice.totalMinor,
      balanceMinor: invoice.balanceMinor,
      payments: succeededPayments.map((p) => ({ kind: p.kind, amountMinor: p.amountMinor, createdAt: p.createdAt })),
      tourLead: resolveTourLead(travelers),
    });

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'invoice.pdf_downloaded',
      resourceType: 'Invoice',
      resourceId: invoice.id,
      organizationId,
    });

    return {
      body,
      contentType: 'application/pdf',
      filename: buildInvoicePdfFilename(booking.bookingReference, invoice.status, locale),
    };
  },

  /** DR-175: guest "find my booking" invoice/receipt PDF (no-ctx) -- same
   * trust boundary as getBillingSummaryForBookingLookup: the caller (the
   * find-booking invoice-pdf route) has already re-verified the two-factor
   * bookingReference+lastName match via bookingService.lookupByBookingReference
   * before calling this, so no session/ownership check is needed here.
   * `bookingReference` is passed in rather than re-derived, since the
   * caller already has the resolved booking in hand from that lookup.
   * Returns null (not throw) when there's nothing downloadable yet --
   * same "never reveal which part was wrong" shape the lookup itself uses,
   * and the route treats it as a plain 404. Deliberately duplicates
   * streamInvoicePdf's render-payload construction above rather than
   * sharing a helper -- the two have different error semantics (this one
   * never throws notFound/conflict, that one always does) and duplicating
   * ~15 lines here is simpler than a shared helper with two different
   * "nothing to download" behaviors layered on top. `travelers` is passed
   * in rather than re-fetched -- the caller (the route) already has them
   * from that same lookupByBookingReference call, which has no ctx of its
   * own to fetch them a second time with. */
  async streamInvoicePdfForBookingLookup(
    organizationId: string,
    bookingId: string,
    bookingReference: string,
    travelers: Pick<TravelerView, 'firstName' | 'lastName' | 'phone' | 'email' | 'isTourLead'>[],
    locale: PdfLocale,
  ): Promise<{ body: Buffer; contentType: string; filename: string } | null> {
    const invoice = await invoicingRepository.findByBookingId(organizationId, bookingId);
    if (!invoice || !canDownloadInvoicePdf(invoice.status)) return null;

    const detail = await invoicingRepository.findDetail(organizationId, invoice.id);
    const succeededPayments = (detail?.payments ?? []).filter((p) => p.status === 'SUCCEEDED');

    const body = await renderInvoicePdf({
      locale,
      status: invoice.status as Extract<InvoiceStatus, 'PARTIALLY_PAID' | 'PAID'>,
      currency: invoice.currency,
      bookingReference,
      subtotalMinor: invoice.subtotalMinor,
      discountMinor: invoice.discountMinor,
      couponCode: invoice.couponCode,
      taxMinor: invoice.taxMinor,
      platformFeeMinor: invoice.platformFeeMinor,
      totalMinor: invoice.totalMinor,
      balanceMinor: invoice.balanceMinor,
      payments: succeededPayments.map((p) => ({ kind: p.kind, amountMinor: p.amountMinor, createdAt: p.createdAt })),
      tourLead: resolveTourLead(travelers),
    });

    return {
      body,
      contentType: 'application/pdf',
      filename: buildInvoicePdfFilename(bookingReference, invoice.status, locale),
    };
  },

  /** Ratings module (DR-037): "payment received in full" for the
   * guest-facing rating-eligibility check -- a booking can reach
   * CONFIRMED/COMPLETED off a deposit-only payment (DR-027), so this must
   * be checked via the invoice, not inferred from Booking.status. No ctx --
   * no session exists for that caller either; the ratings service resolves
   * the booking's ownership/org itself before calling this. */
  async getInvoiceStatusForBooking(organizationId: string, bookingId: string): Promise<InvoiceStatus | null> {
    const invoice = await invoicingRepository.findByBookingId(organizationId, bookingId);
    return invoice?.status ?? null;
  },

  /** Guest "find my booking" price/payment summary (no-ctx) -- same trust
   * boundary as getInvoiceStatusForBooking above. totalMinor/depositMinor/
   * balanceMinor already include the platform fee (DR-127); this just omits
   * the itemized platformFeeMinor/platformFeeRateBp breakdown (kept staff-
   * only for now, no product requirement to break it out here) and each
   * payment's touristUserId/providerRef/provider (a stub gateway reference,
   * no reason to expose to a guest) -- same "never part of this endpoint's
   * response contract" discipline as applyPaymentOutcome's own comment
   * above. Returns null when no invoice exists yet -- never calls
   * getOrCreateInvoiceForBooking, which is a ctx-gated action with its own
   * validation, not something a guest lookup should trigger as a side
   * effect. */
  async getBillingSummaryForBookingLookup(organizationId: string, bookingId: string): Promise<BillingSummaryView | null> {
    const invoice = await invoicingRepository.findByBookingId(organizationId, bookingId);
    if (!invoice) return null;
    const detail = await invoicingRepository.findDetail(organizationId, invoice.id);
    const payments = (detail?.payments ?? []).map((p) => ({
      id: p.id,
      kind: p.kind,
      amountMinor: p.amountMinor,
      currency: p.currency,
      status: p.status,
    }));
    return {
      currency: invoice.currency,
      subtotalMinor: invoice.subtotalMinor,
      discountMinor: invoice.discountMinor,
      taxMinor: invoice.taxMinor,
      depositMinor: invoice.depositMinor,
      balanceMinor: invoice.balanceMinor,
      totalMinor: invoice.totalMinor,
      status: invoice.status,
      payments,
    };
  },

  /** DR-207: computes and persists Invoice.refundAmountMinor once a guest
   * cancels via /find-booking -- called right after
   * bookingService.cancelForBookingLookup by the Server Action that
   * orchestrates both (this module already depends on booking; the reverse
   * would be circular, so that composition can't live inside
   * bookingService itself -- see CLAUDE.md's "module dependency direction"
   * section). No-ctx, same guest-lookup trust boundary as
   * getBillingSummaryForBookingLookup -- the caller has already re-verified
   * the booking via cancelForBookingLookup's own email+lastName check.
   * Returns null when there's no invoice yet (an inquiry-stage TAILOR_MADE
   * booking never had one created) -- nothing to refund. */
  async recordCancellationRefund(
    organizationId: string,
    bookingId: string,
    tier: CancellationRefundTier,
  ): Promise<{ refundAmountMinor: number; currency: Currency } | null> {
    const invoice = await invoicingRepository.findByBookingId(organizationId, bookingId);
    if (!invoice) return null;
    const detail = await invoicingRepository.findDetail(organizationId, invoice.id);
    const paidMinor = (detail?.payments ?? [])
      .filter((p) => p.status === 'SUCCEEDED')
      .reduce((sum, p) => sum + p.amountMinor, 0);

    const refundAmountMinor = computeCancellationRefundAmountMinor(tier, paidMinor, invoice.depositMinor);
    await invoicingRepository.setRefundAmount(organizationId, bookingId, refundAmountMinor);
    return { refundAmountMinor, currency: invoice.currency };
  },

  /** DR-207: staff-authenticated download of a booking's cancellation &
   * refund note from the booking detail page -- regenerable any time,
   * unlike the guest's own one-shot download below. 404s (via the shared
   * buildRefundNotePdf helper) if the booking was never cancelled through
   * the guest self-service flow (cancellationRefundTier null) or has no
   * invoice/refund amount recorded. */
  async streamRefundNotePdf(
    ctx: AuthContext,
    bookingId: string,
    locale: PdfLocale,
  ): Promise<{ body: Buffer; contentType: string; filename: string }> {
    const organizationId = requireOrg(ctx);
    const booking = await bookingService.getById(ctx, bookingId);
    const pdf = await buildRefundNotePdf(organizationId, booking, locale);
    if (!pdf) throw Errors.notFound('No refund note available for this booking');
    return pdf;
  },

  /** DR-207: called once, right after bookingService.cancelForBookingLookup,
   * by the find-booking Server Action -- generates the guest's one-time
   * download of their own cancellation & refund note. No separate lookup
   * route exists for this later: lookupByBookingReference deliberately
   * treats a CANCELLED booking as a dead end (see its own comment), so a
   * guest gets exactly this one chance to download it, right on the
   * confirmation screen. Staff can always regenerate it from the booking
   * detail page instead (streamRefundNotePdf above). */
  async generateRefundNotePdfForBookingLookup(
    organizationId: string,
    booking: Pick<BookingView, 'id' | 'bookingReference' | 'cancellationReason' | 'cancellationRefundTier' | 'updatedAt'>,
    locale: PdfLocale,
  ): Promise<{ body: Buffer; contentType: string; filename: string } | null> {
    return buildRefundNotePdf(organizationId, booking, locale);
  },

  /** Insights & Decision Making (DR-038): every invoice+payments in the org,
   * for revenue/outstanding-balance reporting. `invoice.read` is also held
   * by TOURIST (their own single invoice, enforced in
   * getOrCreateInvoiceForBooking/listPayments) -- this whole-org listing is
   * staff-only, checked explicitly since the permission alone doesn't
   * exclude a tourist caller. */
  async listAllForOrg(
    ctx: AuthContext,
  ): Promise<Array<{ invoice: InvoiceView; bookingId: string; payments: PaymentView[] }>> {
    assertCan(ctx, 'invoice.read');
    if (!isStaff(ctx)) throw Errors.forbidden('Only staff may list every invoice in the organization');
    return invoicingRepository.listAllForOrg(requireOrg(ctx));
  },

  async listPayments(ctx: AuthContext, invoiceId: string): Promise<PaymentView[]> {
    assertCan(ctx, 'invoice.read');
    const organizationId = requireOrg(ctx);
    const detail = await invoicingRepository.findDetail(organizationId, invoiceId);
    if (!detail) throw Errors.notFound('Invoice not found');
    if (!isStaff(ctx) && detail.touristUserId !== ctx.userId) throw Errors.notFound('Invoice not found');
    return detail.payments;
  },

  async initiatePayment(
    ctx: AuthContext,
    invoiceId: string,
    kind: PaymentKind,
  ): Promise<{ payment: PaymentView; redirectUrl: string }> {
    assertCan(ctx, 'payment.initiate');
    const organizationId = requireOrg(ctx);

    const detail = await invoicingRepository.findDetail(organizationId, invoiceId);
    if (!detail) throw Errors.notFound('Invoice not found');
    // Anti-BOLA: a tourist may only pay against their own booking's invoice.
    if (!isStaff(ctx) && detail.touristUserId !== ctx.userId) throw Errors.notFound('Invoice not found');

    if (!canInitiatePayment(detail.invoice, detail.payments, kind)) {
      throw Errors.conflict(`Cannot initiate a ${kind} payment for this invoice right now`);
    }

    const amountMinor = amountForPaymentKind(detail.invoice, kind);
    const { providerRef, redirectUrl } = await paymentGateway.initiate({
      amountMinor,
      currency: detail.invoice.currency,
      reference: `invoice:${invoiceId}:${kind}`,
    });

    const payment = await invoicingRepository.createPayment(organizationId, {
      invoiceId,
      kind,
      amountMinor,
      currency: detail.invoice.currency,
      providerRef,
    });

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'payment.initiated',
      resourceType: 'Payment',
      resourceId: payment.id,
      organizationId,
    });

    // DR-074: no live DPO integration yet (OI-01), so the stub gateway has
    // no async webhook to wait for -- auto-succeed immediately rather than
    // leaving the payment PENDING for staff to resolve by hand. Revisit
    // once a real DPO integration lands.
    const resolved = await applyPaymentOutcome(ctx, organizationId, payment.id, 'SUCCEEDED');
    return { payment: resolved.payment, redirectUrl };
  },

  /** Staff-only manual override -- since `initiatePayment` now auto-succeeds
   * (DR-074), this only matters for a payment that's still PENDING for some
   * other reason (e.g. predates DR-074, or the auto-succeed step above
   * failed partway through). Stands in for a future real DPO webhook. */
  async resolvePayment(
    ctx: AuthContext,
    paymentId: string,
    outcome: Extract<PaymentStatus, 'SUCCEEDED' | 'FAILED'>,
  ): Promise<{ payment: PaymentView; invoice: InvoiceView }> {
    assertCan(ctx, 'payment.resolve');
    const organizationId = requireOrg(ctx);
    return applyPaymentOutcome(ctx, organizationId, paymentId, outcome);
  },

  /** DR-104: gated by payment.initiate (not invoice.read) -- applying a
   * coupon decides what will be charged, the same class of action as
   * initiatePayment itself, which already uses this permission (seeded to
   * TOURIST "own invoice only" and staff). */
  async applyCoupon(ctx: AuthContext, invoiceId: string, code: string): Promise<InvoiceView> {
    assertCan(ctx, 'payment.initiate');
    const organizationId = requireOrg(ctx);
    const detail = await invoicingRepository.findDetail(organizationId, invoiceId);
    if (!detail) throw Errors.notFound('Invoice not found');
    if (!isStaff(ctx) && detail.touristUserId !== ctx.userId) throw Errors.notFound('Invoice not found');
    if (detail.payments.some((p) => p.status === 'SUCCEEDED')) {
      throw Errors.conflict('Cannot apply a coupon once a payment has succeeded on this invoice');
    }
    const booking = await bookingService.getById(ctx, detail.invoice.bookingId);
    if (isBookingLocked(booking.status)) {
      throw Errors.conflict(`This booking is ${booking.status} and can no longer be edited`);
    }

    const pre = await validateCoupon(code);
    if ('error' in pre) throw couponErrorToApiError(pre.error);

    const invoice = await invoicingRepository.applyCoupon(organizationId, invoiceId, pre.coupon.code);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'invoice.coupon_applied',
      resourceType: 'Invoice',
      resourceId: invoiceId,
      organizationId,
      metadata: { code: pre.coupon.code },
    });
    return invoice;
  },

  async removeCoupon(ctx: AuthContext, invoiceId: string): Promise<InvoiceView> {
    assertCan(ctx, 'payment.initiate');
    const organizationId = requireOrg(ctx);
    const detail = await invoicingRepository.findDetail(organizationId, invoiceId);
    if (!detail) throw Errors.notFound('Invoice not found');
    if (!isStaff(ctx) && detail.touristUserId !== ctx.userId) throw Errors.notFound('Invoice not found');
    if (detail.payments.some((p) => p.status === 'SUCCEEDED')) {
      throw Errors.conflict('Cannot remove a coupon once a payment has succeeded on this invoice');
    }
    const booking = await bookingService.getById(ctx, detail.invoice.bookingId);
    if (isBookingLocked(booking.status)) {
      throw Errors.conflict(`This booking is ${booking.status} and can no longer be edited`);
    }

    const invoice = await invoicingRepository.removeCoupon(organizationId, invoiceId);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'invoice.coupon_removed',
      resourceType: 'Invoice',
      resourceId: invoiceId,
      organizationId,
    });
    return invoice;
  },
};

function couponErrorToApiError(reason: CouponUnavailableReason) {
  switch (reason) {
    case 'NOT_FOUND':
      return Errors.notFound('Coupon code not found');
    case 'EXPIRED':
      return Errors.conflict('This coupon has expired');
    case 'EXHAUSTED':
      return Errors.conflict('This coupon has reached its redemption limit');
  }
}
