// invoicing module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { Currency, InvoiceStatus, PaymentKind, PaymentStatus } from '@prisma/client';
import type { AuthContext } from '@modules/auth';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { notificationsService } from '@modules/notifications';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { money, taxOf } from '@lib/money';
import { assertCan } from '@lib/rbac';
import { getEffectivePlatformRate } from '@lib/platform-rate';
import { getEffectiveTaxRate } from '@lib/tax';
import { amountForPaymentKind, canInitiatePayment, splitDeposit, type InvoiceView, type PaymentView } from './domain';
import { paymentGateway } from './gateway';
import { invoicingRepository } from './repository';

export interface BillingSummaryView {
  currency: Currency;
  subtotalMinor: number;
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

    // A PREDEFINED_PACKAGE booking's country comes from its departure's
    // package; a TAILOR_MADE booking has no departure at all, so it carries
    // its own customCountry instead (set at creation, see
    // bookingService.createTailorMadeRequest).
    let country: string;
    if (booking.departureId) {
      ({ packageCountry: country } = await catalogService.getDepartureDetail(ctx, booking.departureId));
    } else if (booking.customCountry) {
      country = booking.customCountry;
    } else {
      throw Errors.conflict('This booking has no destination country to determine tax');
    }

    let rateBp: number;
    try {
      ({ rateBp } = await getEffectiveTaxRate(country));
    } catch {
      // Missing tax config is an operator gap, not a caller error.
      throw Errors.conflict('No tax rate configured for this country');
    }

    // Settings module (DR-042): the platform's own commission, computed as
    // an informational split of the total -- never added to it. Same
    // "missing config is an operator gap" treatment as tax.
    let platformFeeRateBp: number;
    try {
      ({ rateBp: platformFeeRateBp } = await getEffectivePlatformRate());
    } catch {
      throw Errors.conflict('No platform rate configured');
    }

    // Base seat price + finalized add-ons (DR-015) -- throws until the
    // traveler manifest/passport/add-ons wizard steps are all complete, so an
    // invoice's subtotal can never be created before add-ons are decided.
    const billable = await bookingService.getBillableTotal(ctx, bookingId);
    const subtotal = money(billable.totalMinor, billable.currency);
    const tax = taxOf(subtotal, rateBp);
    const totalMinor = subtotal.minor + tax.minor;
    const { depositMinor, balanceMinor } = splitDeposit(totalMinor);
    // Platform fee is a computed split of totalMinor, deliberately NOT
    // added to it -- depositMinor/balanceMinor/totalMinor above are the
    // customer's real amounts, unaffected by this.
    const platformFeeMinor = taxOf(money(totalMinor, billable.currency), platformFeeRateBp).minor;

    const invoice = await invoicingRepository.create(organizationId, {
      bookingId,
      currency: billable.currency,
      subtotalMinor: subtotal.minor,
      taxRateBp: rateBp,
      taxMinor: tax.minor,
      totalMinor,
      depositMinor,
      balanceMinor,
      platformFeeMinor,
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
   * boundary as getInvoiceStatusForBooking above. Deliberately excludes
   * platformFeeMinor/platformFeeRateBp (staff-only commission split) and
   * each payment's touristUserId/providerRef/provider (a stub gateway
   * reference, no reason to expose to a guest) -- same "never part of this
   * endpoint's response contract" discipline as applyPaymentOutcome's own
   * comment above. Returns null when no invoice exists yet -- never calls
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
};
