// invoicing module — repository. The only place that touches
// prisma.invoice/prisma.payment/prisma.couponRedemption for this module.
import type { Currency, Invoice, InvoiceStatus, Payment, PaymentKind, PaymentStatus } from '@prisma/client';
import { withOrg } from '@lib/db';
import { couponUnavailableReason } from '@lib/coupons';
import { Errors } from '@lib/errors';
import { canTransitionPayment, computeInvoiceAmounts, nextInvoiceStatusAfterPayment } from './domain';
import type { InvoiceView, PaymentView } from './domain';

export interface CreateInvoiceParams {
  bookingId: string;
  currency: Currency;
  subtotalMinor: number;
  couponCode: string | null;
  discountBp: number | null;
  discountMinor: number;
  taxRateBp: number;
  taxMinor: number;
  totalMinor: number;
  depositMinor: number;
  balanceMinor: number;
  platformFeeMinor: number;
  platformFeeRateBp: number;
  lateBookingSurchargeMinor: number;
  lateBookingSurchargeRateBp: number | null;
  depositAllowed: boolean;
}

interface CouponRow {
  id: string;
  code: string;
  discountBp: number;
  maxRedemptions: number | null;
  expiresAt: Date | null;
}

export interface CreatePaymentParams {
  invoiceId: string;
  kind: PaymentKind;
  amountMinor: number;
  currency: Currency;
  providerRef: string;
}

export interface InvoiceDetail {
  invoice: InvoiceView;
  touristUserId: string;
  payments: PaymentView[];
}

function toInvoiceView(i: Invoice): InvoiceView {
  return {
    id: i.id,
    organizationId: i.organizationId,
    bookingId: i.bookingId,
    currency: i.currency,
    subtotalMinor: i.subtotalMinor,
    couponCode: i.couponCode,
    discountBp: i.discountBp,
    discountMinor: i.discountMinor,
    taxRateBp: i.taxRateBp,
    taxMinor: i.taxMinor,
    totalMinor: i.totalMinor,
    depositMinor: i.depositMinor,
    balanceMinor: i.balanceMinor,
    platformFeeMinor: i.platformFeeMinor,
    platformFeeRateBp: i.platformFeeRateBp,
    lateBookingSurchargeMinor: i.lateBookingSurchargeMinor,
    lateBookingSurchargeRateBp: i.lateBookingSurchargeRateBp,
    depositAllowed: i.depositAllowed,
    status: i.status,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

function toPaymentView(p: Payment): PaymentView {
  return {
    id: p.id,
    organizationId: p.organizationId,
    invoiceId: p.invoiceId,
    kind: p.kind,
    amountMinor: p.amountMinor,
    currency: p.currency,
    provider: p.provider,
    providerRef: p.providerRef,
    status: p.status,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export const invoicingRepository = {
  async findByBookingId(organizationId: string, bookingId: string): Promise<InvoiceView | null> {
    return withOrg(organizationId, async (tx) => {
      const i = await tx.invoice.findUnique({ where: { bookingId } });
      return i ? toInvoiceView(i) : null;
    });
  },

  /** Insights & Decision Making (DR-038): every invoice in the org, with its
   * payments -- the source data for revenue/outstanding-balance reporting.
   * No single-invoice/single-booking scoping (unlike every other method
   * here); the service layer restricts this to staff callers. */
  async listAllForOrg(
    organizationId: string,
  ): Promise<Array<{ invoice: InvoiceView; bookingId: string; payments: PaymentView[] }>> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.invoice.findMany({ include: { payments: true } });
      return rows.map((i) => ({ invoice: toInvoiceView(i), bookingId: i.bookingId, payments: i.payments.map(toPaymentView) }));
    });
  },

  async create(organizationId: string, params: CreateInvoiceParams): Promise<InvoiceView> {
    return withOrg(organizationId, async (tx) => {
      const i = await tx.invoice.create({
        data: { organizationId, status: 'ISSUED', ...params },
      });
      return toInvoiceView(i);
    });
  },

  /** Invoice + its booking's owning tourist (for anti-BOLA) + all its payments. */
  async findDetail(organizationId: string, invoiceId: string): Promise<InvoiceDetail | null> {
    return withOrg(organizationId, async (tx) => {
      const i = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { booking: { select: { touristUserId: true } }, payments: true },
      });
      if (!i) return null;
      return {
        invoice: toInvoiceView(i),
        touristUserId: i.booking.touristUserId,
        payments: i.payments.map(toPaymentView),
      };
    });
  },

  async createPayment(organizationId: string, params: CreatePaymentParams): Promise<PaymentView> {
    return withOrg(organizationId, async (tx) => {
      const p = await tx.payment.create({
        data: { organizationId, status: 'PENDING', ...params },
      });
      return toPaymentView(p);
    });
  },

  async resolvePayment(
    organizationId: string,
    paymentId: string,
    outcome: PaymentStatus,
  ): Promise<{ payment: PaymentView; invoice: InvoiceView; touristUserId: string } | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!existing) return null;
      if (!canTransitionPayment(existing.status, outcome)) {
        throw new Error(`Cannot transition payment from ${existing.status} to ${outcome}`);
      }

      const updatedPayment = await tx.payment.update({ where: { id: paymentId }, data: { status: outcome } });
      const allPayments = await tx.payment.findMany({ where: { invoiceId: existing.invoiceId } });
      const nextStatus: InvoiceStatus = nextInvoiceStatusAfterPayment(allPayments);

      // touristUserId is only needed to notify the recipient (DR-013) --
      // never returned to the invoicing service's own callers as invoice data.
      const currentInvoice = await tx.invoice.findUniqueOrThrow({
        where: { id: existing.invoiceId },
        include: { booking: { select: { touristUserId: true } } },
      });
      const invoice =
        nextStatus === currentInvoice.status
          ? currentInvoice
          : await tx.invoice.update({ where: { id: currentInvoice.id }, data: { status: nextStatus } });

      return {
        payment: toPaymentView(updatedPayment),
        invoice: toInvoiceView(invoice),
        touristUserId: currentInvoice.booking.touristUserId,
      };
    });
  },

  // DR-104: Coupon apply/remove. Both re-check usability under a row lock
  // on the Coupon (not just the service layer's earlier read-only
  // pre-check) -- Postgres READ COMMITTED alone doesn't stop two
  // concurrent applies of the same capped code both reading "count < cap"
  // as true before either inserts; `withOrg` already runs raw SQL for its
  // own GUC, so this isn't a new pattern in the codebase.
  async applyCoupon(organizationId: string, invoiceId: string, code: string): Promise<InvoiceView> {
    return withOrg(organizationId, async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) throw Errors.notFound('Invoice not found');

      const rows = await tx.$queryRaw<CouponRow[]>`SELECT * FROM coupons WHERE code = ${code} FOR UPDATE`;
      const coupon = rows[0];
      if (!coupon) throw Errors.notFound('Coupon code not found');

      const redemptionCount = await tx.couponRedemption.count({ where: { couponId: coupon.id } });
      if (couponUnavailableReason(coupon, redemptionCount, new Date())) {
        throw Errors.conflict('This coupon is no longer available');
      }

      const amounts = computeInvoiceAmounts({
        subtotalMinor: invoice.subtotalMinor,
        currency: invoice.currency,
        taxRateBp: invoice.taxRateBp,
        platformFeeRateBp: invoice.platformFeeRateBp ?? 0,
        discountBp: coupon.discountBp,
        lateBookingSurchargeBp: invoice.lateBookingSurchargeRateBp,
      });

      await tx.couponRedemption.create({
        data: { couponId: coupon.id, invoiceId, discountMinor: amounts.discountMinor },
      });
      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: { couponCode: coupon.code, discountBp: coupon.discountBp, ...amounts },
      });
      return toInvoiceView(updated);
    });
  },

  async removeCoupon(organizationId: string, invoiceId: string): Promise<InvoiceView> {
    return withOrg(organizationId, async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) throw Errors.notFound('Invoice not found');
      if (!invoice.couponCode) return toInvoiceView(invoice); // no-op, nothing applied

      const coupon = await tx.coupon.findUnique({ where: { code: invoice.couponCode } });
      if (coupon) {
        await tx.couponRedemption.deleteMany({ where: { couponId: coupon.id, invoiceId } });
      }

      const amounts = computeInvoiceAmounts({
        subtotalMinor: invoice.subtotalMinor,
        currency: invoice.currency,
        taxRateBp: invoice.taxRateBp,
        platformFeeRateBp: invoice.platformFeeRateBp ?? 0,
        lateBookingSurchargeBp: invoice.lateBookingSurchargeRateBp,
      });
      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: { couponCode: null, discountBp: null, ...amounts },
      });
      return toInvoiceView(updated);
    });
  },
};
