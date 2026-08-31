// invoicing module — domain types & rules. Pure; no framework or DB imports.
// Payment is a sub-concept of Invoice here, not a sibling module (DR-011's
// hold-folded-into-Booking precedent).
import type { Currency, InvoiceStatus, PaymentKind, PaymentStatus } from '@prisma/client';
import { z } from 'zod';
import type { CancellationRefundTier } from '@modules/booking';
import { discountOf, money, taxOf } from '@lib/money';

export interface InvoiceView {
  id: string;
  organizationId: string;
  bookingId: string;
  currency: Currency;
  subtotalMinor: number;
  // DR-104: snapshot of whichever Coupon was applied at the time -- null on
  // every invoice that never had one.
  couponCode: string | null;
  discountBp: number | null;
  discountMinor: number;
  taxRateBp: number;
  taxMinor: number;
  // Settings module (DR-042; additive since DR-127): the platform's fee,
  // charged to the customer on top of the discounted subtotal + tax --
  // included in totalMinor/depositMinor/balanceMinor below, not a side
  // split of them. Null for invoices created before DR-042 shipped
  // (grandfathered).
  platformFeeMinor: number | null;
  platformFeeRateBp: number | null;
  // DR-198: itemized on top of subtotal+tax+platform fee, already folded
  // into totalMinor/depositMinor (not a side split of them, same convention
  // as platformFeeMinor). 0 on every invoice the surcharge doesn't apply to.
  lateBookingSurchargeMinor: number;
  // Snapshotted rate behind lateBookingSurchargeMinor above -- stored
  // separately (same "rate + amount" convention as taxRateBp/
  // platformFeeRateBp) so applyCoupon/removeCoupon can recompute amounts
  // from the invoice row alone. Null = unaffected.
  lateBookingSurchargeRateBp: number | null;
  // False forces depositMinor === totalMinor / balanceMinor === 0 (full
  // payment only) -- see canInitiatePayment below for the actual gate.
  depositAllowed: boolean;
  // DR-207: the actual minor-unit amount computed from Booking.
  // cancellationRefundTier once the guest cancels via /find-booking --
  // see computeCancellationRefundAmountMinor below. Null until that
  // happens (the vast majority of invoices).
  refundAmountMinor: number | null;
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

export const InitiatePaymentInput = z.object({ kind: z.enum(['DEPOSIT', 'BALANCE', 'FULL']) });
export type InitiatePaymentInput = z.infer<typeof InitiatePaymentInput>;

export const ApplyCouponInput = z.object({ code: z.string().min(1) });
export type ApplyCouponInput = z.infer<typeof ApplyCouponInput>;

export const ResolvePaymentInput = z.object({ outcome: z.enum(['SUCCEEDED', 'FAILED']) });
export type ResolvePaymentInput = z.infer<typeof ResolvePaymentInput>;

/** 40%/60% deposit/balance split (DR-012), half-up. balance = total - deposit
 * (never independently rounded) so the two legs always sum back to the total. */
export function splitDeposit(totalMinor: number): { depositMinor: number; balanceMinor: number } {
  const depositMinor = Math.round(totalMinor * 0.4);
  return { depositMinor, balanceMinor: totalMinor - depositMinor };
}

/** Cancellation & Refund Policy (DR-207, see /terms): turns a
 * CancellationRefundTier (snapshotted onto Booking.cancellationRefundTier
 * at cancel time -- resolveCancellationRefundTier in the booking module)
 * into a real minor-unit refund amount. `paidMinor` is the sum of this
 * invoice's SUCCEEDED payments, `depositMinor` is the invoice's own
 * snapshot field -- both already in hand from InvoiceView/PaymentView, no
 * new query. FULL_MINUS_DEPOSIT keeps the deposit and refunds the rest of
 * whatever was actually paid; the other tiers are a straight percentage of
 * what was actually paid, not of totalMinor -- a guest can never be
 * refunded more than they paid (e.g. a booking cancelled before any
 * payment succeeded refunds 0 regardless of tier). */
export function computeCancellationRefundAmountMinor(
  tier: CancellationRefundTier,
  paidMinor: number,
  depositMinor: number,
): number {
  switch (tier) {
    case 'FULL_MINUS_DEPOSIT':
      return Math.max(0, paidMinor - depositMinor);
    case 'FIFTY_PERCENT':
      return Math.round(paidMinor * 0.5);
    case 'TWENTY_FIVE_PERCENT':
      return Math.round(paidMinor * 0.25);
    case 'NONE':
      return 0;
  }
}

export interface InvoiceAmountsInput {
  subtotalMinor: number;
  currency: Currency;
  taxRateBp: number;
  platformFeeRateBp: number;
  discountBp?: number; // omitted/0 = no coupon
  // DR-198: Booking.lateBookingSurchargeBp's snapshot -- null/omitted = this
  // booking's travel date is unaffected.
  lateBookingSurchargeBp?: number | null;
}

export interface InvoiceAmounts {
  discountMinor: number;
  taxMinor: number;
  platformFeeMinor: number;
  lateBookingSurchargeMinor: number;
  depositAllowed: boolean;
  totalMinor: number;
  depositMinor: number;
  balanceMinor: number;
}

/** DR-104/DR-127/DR-198: subtotal -> discount -> discounted subtotal -> tax
 * (on the DISCOUNTED subtotal, not the original) -> platform fee (on
 * subtotal + tax, charged to the customer, not absorbed by the platform) ->
 * late-booking surcharge (on top of subtotal+tax+fee, itemized, only when
 * lateBookingSurchargeBp is set) -> total -> deposit/balance split (skipped
 * entirely -- full payment only -- when the surcharge applies). The ONE
 * place this math is written -- used by both getOrCreateInvoiceForBooking
 * (discountBp omitted) and applyCoupon/removeCoupon (set/omitted
 * respectively), so the ordering can never drift between the no-discount
 * and with-discount paths. */
export function computeInvoiceAmounts(input: InvoiceAmountsInput): InvoiceAmounts {
  const subtotal = money(input.subtotalMinor, input.currency);
  const discountBp = input.discountBp ?? 0;
  const discountMinor = discountBp > 0 ? discountOf(subtotal, discountBp).minor : 0;
  const discountedSubtotal = money(subtotal.minor - discountMinor, input.currency);
  const tax = taxOf(discountedSubtotal, input.taxRateBp);
  const preFeeTotal = money(discountedSubtotal.minor + tax.minor, input.currency);
  const platformFee = taxOf(preFeeTotal, input.platformFeeRateBp);
  const preSurchargeTotal = money(preFeeTotal.minor + platformFee.minor, input.currency);
  const lateBookingSurchargeBp = input.lateBookingSurchargeBp ?? 0;
  const lateBookingSurchargeMinor = lateBookingSurchargeBp > 0 ? taxOf(preSurchargeTotal, lateBookingSurchargeBp).minor : 0;
  const totalMinor = preSurchargeTotal.minor + lateBookingSurchargeMinor;
  const depositAllowed = lateBookingSurchargeBp === 0;
  const { depositMinor, balanceMinor } = depositAllowed ? splitDeposit(totalMinor) : { depositMinor: totalMinor, balanceMinor: 0 };
  return {
    discountMinor,
    taxMinor: tax.minor,
    platformFeeMinor: platformFee.minor,
    lateBookingSurchargeMinor,
    depositAllowed,
    totalMinor,
    depositMinor,
    balanceMinor,
  };
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

/** Derived from the full payment list (not just the one just-resolved) so a
 * FAILED balance attempt after a SUCCEEDED deposit can't regress the invoice.
 * A succeeded FULL payment (DR-024) reaches PAID the same way BALANCE does --
 * they're alternative ways to fully settle the same invoice. */
export function nextInvoiceStatusAfterPayment(
  payments: Pick<PaymentView, 'kind' | 'status'>[],
): InvoiceStatus {
  if (payments.some((p) => (p.kind === 'BALANCE' || p.kind === 'FULL') && p.status === 'SUCCEEDED')) return 'PAID';
  if (payments.some((p) => p.kind === 'DEPOSIT' && p.status === 'SUCCEEDED')) return 'PARTIALLY_PAID';
  return 'ISSUED';
}

/** The balance leg is only payable once the deposit has succeeded; neither
 * leg may be re-initiated while a non-failed attempt is already outstanding.
 * FULL (DR-024) is a mutually exclusive alternative to the deposit/balance
 * split -- blocked once either leg has an active/succeeded attempt, and
 * blocks DEPOSIT in turn once it has one of its own (a FAILED attempt on
 * either side doesn't count, so switching paths after a failure is fine).
 * DR-198: DEPOSIT is also blocked outright once depositAllowed is false
 * (this booking's travel date is under the configured lead-time threshold)
 * -- this is the real server-side gate, not just the guest UI hiding the
 * button; BALANCE needs no extra check since it already requires a prior
 * succeeded DEPOSIT, which can then never exist. */
export function canInitiatePayment(
  invoice: Pick<InvoiceView, 'status' | 'depositAllowed'>,
  payments: Pick<PaymentView, 'kind' | 'status'>[],
  kind: PaymentKind,
): boolean {
  if (invoice.status === 'PAID' || invoice.status === 'VOID') return false;
  if (kind === 'DEPOSIT' && !invoice.depositAllowed) return false;
  const activeOrSucceeded = (k: PaymentKind) => payments.some((p) => p.kind === k && p.status !== 'FAILED');
  if (activeOrSucceeded(kind)) return false;
  if (kind === 'BALANCE') {
    return payments.some((p) => p.kind === 'DEPOSIT' && p.status === 'SUCCEEDED');
  }
  if (kind === 'FULL') {
    return !activeOrSucceeded('DEPOSIT') && !activeOrSucceeded('BALANCE');
  }
  return !activeOrSucceeded('FULL');
}

/** DR-169: an invoice/receipt PDF is only meaningful once at least one
 * payment has actually succeeded -- ISSUED has nothing paid yet, VOID was
 * cancelled before anything could be. */
export function canDownloadInvoicePdf(status: InvoiceStatus): boolean {
  return status === 'PARTIALLY_PAID' || status === 'PAID';
}

/** Replaces a `kind === 'DEPOSIT' ? invoice.depositMinor : invoice.balanceMinor`
 * binary ternary that would have silently charged a FULL payment the balance
 * amount -- an exhaustive lookup can't miss a kind like that again. */
export function amountForPaymentKind(
  invoice: Pick<InvoiceView, 'depositMinor' | 'balanceMinor' | 'totalMinor'>,
  kind: PaymentKind,
): number {
  const amounts: Record<PaymentKind, number> = {
    DEPOSIT: invoice.depositMinor,
    BALANCE: invoice.balanceMinor,
    FULL: invoice.totalMinor,
  };
  return amounts[kind];
}
