// invoicing module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { Currency, InvoiceStatus, PaymentKind, PaymentStatus } from '@prisma/client';
import type { AuthContext } from '@modules/auth';
import { bookingService, isBookingLocked } from '@modules/booking';
import { catalogService } from '@modules/catalog';
// New invoicing -> finance dependency (confirmed acyclic -- finance depends
// on {auth, catalog, booking, itinerary}, never invoicing) so a TAILOR_MADE
// booking's tax rate can be blended across its linked customized package's
// Day Template countries the same way a standard package's own cost
// breakdown already is.
import { financeService } from '@modules/finance';
import { notificationsService } from '@modules/notifications';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { money } from '@lib/money';
import { assertCan } from '@lib/rbac';
import { getEffectivePlatformRate } from '@lib/platform-rate';
import { validateCoupon, type CouponUnavailableReason } from '@lib/coupons';
import { amountForPaymentKind, canInitiatePayment, computeInvoiceAmounts, type InvoiceView, type PaymentView } from './domain';
import { paymentGateway } from './gateway';
import { invoicingRepository } from './repository';

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
  }
  await notificationsService.notify(
    outcome === 'SUCCEEDED' ? 'PAYMENT_SUCCEEDED' : 'PAYMENT_FAILED',
    result.touristUserId,
    organizationId,
    { amountMinor: result.payment.amountMinor, currency: result.payment.currency },
  );
  // Rebuilt explicitly (not `return result`) -- touristUserId is only for
  // notify() above, never part of this endpoint's response contract.
  return { payment: result.payment, invoice: result.invoice };
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
    });

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'invoice.issued',
      resourceType: 'Invoice',
      resourceId: invoice.id,
      organizationId,
    });
    return invoice;
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
