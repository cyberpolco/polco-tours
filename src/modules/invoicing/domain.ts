// invoicing module — domain types & rules. Pure; no framework or DB imports.
// Payment is a sub-concept of Invoice here, not a sibling module (DR-011's
// hold-folded-into-Booking precedent).
import type { Currency, InvoiceStatus, PaymentKind, PaymentStatus } from '@prisma/client';
import { z } from 'zod';

export interface InvoiceView {
  id: string;
  organizationId: string;
  bookingId: string;
  currency: Currency;
  subtotalMinor: number;
  taxRateBp: number;
  taxMinor: number;
  totalMinor: number;
  depositMinor: number;
  balanceMinor: number;
  status: InvoiceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentView {
  id: string;
  organizationId: string;
  invoiceId: string;
  kind: PaymentKind;
  amountMinor: number;
  currency: Currency;
  provider: string;
  providerRef: string | null;
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const InitiatePaymentInput = z.object({ kind: z.enum(['DEPOSIT', 'BALANCE']) });
export type InitiatePaymentInput = z.infer<typeof InitiatePaymentInput>;

export const ResolvePaymentInput = z.object({ outcome: z.enum(['SUCCEEDED', 'FAILED']) });
export type ResolvePaymentInput = z.infer<typeof ResolvePaymentInput>;

/** 40%/60% deposit/balance split (DR-012), half-up. balance = total - deposit
 * (never independently rounded) so the two legs always sum back to the total. */
export function splitDeposit(totalMinor: number): { depositMinor: number; balanceMinor: number } {
  const depositMinor = Math.round(totalMinor * 0.4);
  return { depositMinor, balanceMinor: totalMinor - depositMinor };
}

const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['ISSUED', 'VOID'],
  ISSUED: ['PARTIALLY_PAID', 'PAID', 'VOID'],
  PARTIALLY_PAID: ['PAID', 'VOID'],
  PAID: [],
  VOID: [],
};

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return INVOICE_TRANSITIONS[from].includes(to);
}

const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ['SUCCEEDED', 'FAILED'],
  SUCCEEDED: [],
  FAILED: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

/** Derived from the FULL payment list (not just the one just-resolved) so a
 * FAILED balance attempt after a SUCCEEDED deposit can't regress the invoice. */
export function nextInvoiceStatusAfterPayment(
  payments: Pick<PaymentView, 'kind' | 'status'>[],
): InvoiceStatus {
  if (payments.some((p) => p.kind === 'BALANCE' && p.status === 'SUCCEEDED')) return 'PAID';
  if (payments.some((p) => p.kind === 'DEPOSIT' && p.status === 'SUCCEEDED')) return 'PARTIALLY_PAID';
  return 'ISSUED';
}

/** The balance leg is only payable once the deposit has succeeded; neither
 * leg may be re-initiated while a non-failed attempt is already outstanding. */
export function canInitiatePayment(
  invoice: Pick<InvoiceView, 'status'>,
  payments: Pick<PaymentView, 'kind' | 'status'>[],
  kind: PaymentKind,
): boolean {
  if (invoice.status === 'PAID' || invoice.status === 'VOID') return false;
  const activeOrSucceeded = (k: PaymentKind) => payments.some((p) => p.kind === k && p.status !== 'FAILED');
  if (activeOrSucceeded(kind)) return false;
  if (kind === 'BALANCE') {
    return payments.some((p) => p.kind === 'DEPOSIT' && p.status === 'SUCCEEDED');
  }
  return true;
}
