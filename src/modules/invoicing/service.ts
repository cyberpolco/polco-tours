// invoicing module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { PaymentKind, PaymentStatus } from '@prisma/client';
import type { AuthContext } from '@modules/auth';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { money, taxOf } from '@lib/money';
import { assertCan } from '@lib/rbac';
import { getEffectiveTaxRate } from '@lib/tax';
import { canInitiatePayment, splitDeposit, type InvoiceView, type PaymentView } from './domain';
import { paymentGateway } from './gateway';
import { invoicingRepository } from './repository';

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

// TOURIST is the only "customer" role, same convention as booking/service.ts.
function isStaff(ctx: AuthContext): boolean {
  return ctx.role !== 'TOURIST';
}

export const invoicingService = {
  async getOrCreateInvoiceForBooking(ctx: AuthContext, bookingId: string): Promise<InvoiceView> {
    assertCan(ctx.role, 'invoice.read');
    const organizationId = requireOrg(ctx);

    // Anti-BOLA inherited for free: bookingService.getById already 404s if
    // this booking isn't ctx's own (tourist) or outside the org.
    const booking = await bookingService.getById(ctx, bookingId);

    const existing = await invoicingRepository.findByBookingId(organizationId, bookingId);
    if (existing) return existing;

    const { packageCountry } = await catalogService.getDepartureDetail(ctx, booking.departureId);
    let rateBp: number;
    try {
      ({ rateBp } = await getEffectiveTaxRate(packageCountry));
    } catch {
      // Missing tax config is an operator gap, not a caller error.
      throw Errors.conflict('No tax rate configured for this country');
    }

    const subtotal = money(booking.priceMinor, booking.currency);
    const tax = taxOf(subtotal, rateBp);
    const totalMinor = subtotal.minor + tax.minor;
    const { depositMinor, balanceMinor } = splitDeposit(totalMinor);

    const invoice = await invoicingRepository.create(organizationId, {
      bookingId,
      currency: booking.currency,
      subtotalMinor: subtotal.minor,
      taxRateBp: rateBp,
      taxMinor: tax.minor,
      totalMinor,
      depositMinor,
      balanceMinor,
    });

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: 'invoice.issued',
      resourceType: 'Invoice',
      resourceId: invoice.id,
      organizationId,
    });
    return invoice;
  },

  async listPayments(ctx: AuthContext, invoiceId: string): Promise<PaymentView[]> {
    assertCan(ctx.role, 'invoice.read');
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
    assertCan(ctx.role, 'payment.initiate');
    const organizationId = requireOrg(ctx);

    const detail = await invoicingRepository.findDetail(organizationId, invoiceId);
    if (!detail) throw Errors.notFound('Invoice not found');
    // Anti-BOLA: a tourist may only pay against their own booking's invoice.
    if (!isStaff(ctx) && detail.touristUserId !== ctx.userId) throw Errors.notFound('Invoice not found');

    if (!canInitiatePayment(detail.invoice, detail.payments, kind)) {
      throw Errors.conflict(`Cannot initiate a ${kind} payment for this invoice right now`);
    }

    const amountMinor = kind === 'DEPOSIT' ? detail.invoice.depositMinor : detail.invoice.balanceMinor;
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
      actorRole: ctx.role,
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
    assertCan(ctx.role, 'payment.resolve');
    const organizationId = requireOrg(ctx);

    const result = await invoicingRepository.resolvePayment(organizationId, paymentId, outcome);
    if (!result) throw Errors.notFound('Payment not found');

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: outcome === 'SUCCEEDED' ? 'payment.succeeded' : 'payment.failed',
      resourceType: 'Payment',
      resourceId: result.payment.id,
      organizationId,
    });
    return result;
  },
};
