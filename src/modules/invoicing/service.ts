// invoicing module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { InvoiceStatus, PaymentKind, PaymentStatus } from '@prisma/client';
import type { AuthContext } from '@modules/auth';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { notificationsService } from '@modules/notifications';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { money, taxOf } from '@lib/money';
import { assertCan } from '@lib/rbac';
import { getEffectiveTaxRate } from '@lib/tax';
import { amountForPaymentKind, canInitiatePayment, splitDeposit, type InvoiceView, type PaymentView } from './domain';
import { paymentGateway } from './gateway';
import { invoicingRepository } from './repository';

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

// TOURIST is the only "customer" role, same convention as booking/service.ts.
function isStaff(ctx: AuthContext): boolean {
  return !ctx.roles.includes('TOURIST');
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

    // Base seat price + finalized add-ons (DR-015) -- throws until the
    // traveler manifest/passport/add-ons wizard steps are all complete, so an
    // invoice's subtotal can never be created before add-ons are decided.
    const billable = await bookingService.getBillableTotal(ctx, bookingId);
    const subtotal = money(billable.totalMinor, billable.currency);
    const tax = taxOf(subtotal, rateBp);
    const totalMinor = subtotal.minor + tax.minor;
    const { depositMinor, balanceMinor } = splitDeposit(totalMinor);

    const invoice = await invoicingRepository.create(organizationId, {
      bookingId,
      currency: billable.currency,
      subtotalMinor: subtotal.minor,
      taxRateBp: rateBp,
      taxMinor: tax.minor,
      totalMinor,
      depositMinor,
      balanceMinor,
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
    return { payment, redirectUrl };
  },

  /** Staff-only: stands in for a future DPO webhook. */
  async resolvePayment(
    ctx: AuthContext,
    paymentId: string,
    outcome: Extract<PaymentStatus, 'SUCCEEDED' | 'FAILED'>,
  ): Promise<{ payment: PaymentView; invoice: InvoiceView }> {
    assertCan(ctx, 'payment.resolve');
    const organizationId = requireOrg(ctx);

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
  },
};
