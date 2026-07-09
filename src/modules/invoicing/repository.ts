// invoicing module — repository. The only place that touches
// prisma.invoice/prisma.payment for this module.
import type { Currency, Invoice, InvoiceStatus, Payment, PaymentKind, PaymentStatus } from '@prisma/client';
import { withOrg } from '@lib/db';
import { canTransitionPayment, nextInvoiceStatusAfterPayment } from './domain';
import type { InvoiceView, PaymentView } from './domain';

export interface CreateInvoiceParams {
  bookingId: string;
  currency: Currency;
  subtotalMinor: number;
  taxRateBp: number;
  taxMinor: number;
  totalMinor: number;
  depositMinor: number;
  balanceMinor: number;
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
    taxRateBp: i.taxRateBp,
    taxMinor: i.taxMinor,
    totalMinor: i.totalMinor,
    depositMinor: i.depositMinor,
    balanceMinor: i.balanceMinor,
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
};
