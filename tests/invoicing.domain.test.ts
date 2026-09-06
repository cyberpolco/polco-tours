import { describe, it, expect } from 'vitest';
import {
  amountForPaymentKind,
  canDownloadInvoicePdf,
  canInitiatePayment,
  canTransitionInvoice,
  canTransitionPayment,
  computeCancellationRefundAmountMinor,
  computeInvoiceAmounts,
  nextInvoiceStatusAfterPayment,
  splitDeposit,
} from '../src/modules/invoicing/domain';

describe('invoicing domain', () => {
  describe('splitDeposit', () => {
    it('splits 30%/70%, half-up, drift-free', () => {
      expect(splitDeposit(10000)).toEqual({ depositMinor: 3000, balanceMinor: 7000 });
    });

    it('rounds the deposit half-up and the balance absorbs any remainder (no independent rounding)', () => {
      // 9999 * 0.3 = 2999.7 -> rounds to 3000; balance = 9999 - 3000 = 6999.
      const { depositMinor, balanceMinor } = splitDeposit(9999);
      expect(depositMinor).toBe(3000);
      expect(balanceMinor).toBe(6999);
      expect(depositMinor + balanceMinor).toBe(9999);
    });
  });

  describe('canTransitionInvoice', () => {
    it('DRAFT can move to ISSUED or VOID', () => {
      expect(canTransitionInvoice('DRAFT', 'ISSUED')).toBe(true);
      expect(canTransitionInvoice('DRAFT', 'VOID')).toBe(true);
      expect(canTransitionInvoice('DRAFT', 'PAID')).toBe(false);
    });

    it('ISSUED can move to PARTIALLY_PAID, PAID, or VOID', () => {
      expect(canTransitionInvoice('ISSUED', 'PARTIALLY_PAID')).toBe(true);
      expect(canTransitionInvoice('ISSUED', 'PAID')).toBe(true);
      expect(canTransitionInvoice('ISSUED', 'VOID')).toBe(true);
    });

    it('PAID and VOID are terminal', () => {
      expect(canTransitionInvoice('PAID', 'VOID')).toBe(false);
      expect(canTransitionInvoice('VOID', 'ISSUED')).toBe(false);
    });
  });

  describe('canTransitionPayment', () => {
    it('PENDING can move to SUCCEEDED or FAILED', () => {
      expect(canTransitionPayment('PENDING', 'SUCCEEDED')).toBe(true);
      expect(canTransitionPayment('PENDING', 'FAILED')).toBe(true);
    });

    it('SUCCEEDED and FAILED are terminal', () => {
      expect(canTransitionPayment('SUCCEEDED', 'FAILED')).toBe(false);
      expect(canTransitionPayment('FAILED', 'SUCCEEDED')).toBe(false);
    });
  });

  describe('nextInvoiceStatusAfterPayment', () => {
    it('stays ISSUED with no succeeded payments', () => {
      expect(nextInvoiceStatusAfterPayment([{ kind: 'DEPOSIT', status: 'PENDING' }])).toBe('ISSUED');
    });

    it('moves to PARTIALLY_PAID once the deposit succeeds', () => {
      expect(nextInvoiceStatusAfterPayment([{ kind: 'DEPOSIT', status: 'SUCCEEDED' }])).toBe('PARTIALLY_PAID');
    });

    it('moves to PAID once the balance succeeds', () => {
      expect(
        nextInvoiceStatusAfterPayment([
          { kind: 'DEPOSIT', status: 'SUCCEEDED' },
          { kind: 'BALANCE', status: 'SUCCEEDED' },
        ]),
      ).toBe('PAID');
    });

    it('a FAILED balance attempt after a SUCCEEDED deposit does not regress the invoice', () => {
      expect(
        nextInvoiceStatusAfterPayment([
          { kind: 'DEPOSIT', status: 'SUCCEEDED' },
          { kind: 'BALANCE', status: 'FAILED' },
        ]),
      ).toBe('PARTIALLY_PAID');
    });

    it('moves to PAID once a FULL payment succeeds (DR-024)', () => {
      expect(nextInvoiceStatusAfterPayment([{ kind: 'FULL', status: 'SUCCEEDED' }])).toBe('PAID');
    });
  });

  describe('canInitiatePayment', () => {
    it('allows initiating a DEPOSIT on a freshly issued invoice', () => {
      expect(canInitiatePayment({ status: 'ISSUED', depositAllowed: true }, [], 'DEPOSIT')).toBe(true);
    });

    it('blocks initiating BALANCE before the deposit has succeeded', () => {
      expect(canInitiatePayment({ status: 'ISSUED', depositAllowed: true }, [], 'BALANCE')).toBe(false);
      expect(
        canInitiatePayment({ status: 'ISSUED', depositAllowed: true }, [{ kind: 'DEPOSIT', status: 'PENDING' }], 'BALANCE'),
      ).toBe(false);
    });

    it('allows initiating BALANCE once the deposit has succeeded', () => {
      expect(
        canInitiatePayment(
          { status: 'PARTIALLY_PAID', depositAllowed: true },
          [{ kind: 'DEPOSIT', status: 'SUCCEEDED' }],
          'BALANCE',
        ),
      ).toBe(true);
    });

    it('blocks re-initiating a leg that already has a non-failed attempt outstanding', () => {
      expect(
        canInitiatePayment({ status: 'ISSUED', depositAllowed: true }, [{ kind: 'DEPOSIT', status: 'PENDING' }], 'DEPOSIT'),
      ).toBe(false);
      expect(
        canInitiatePayment({ status: 'ISSUED', depositAllowed: true }, [{ kind: 'DEPOSIT', status: 'SUCCEEDED' }], 'DEPOSIT'),
      ).toBe(false);
    });

    it('allows retrying a leg whose previous attempt failed', () => {
      expect(
        canInitiatePayment({ status: 'ISSUED', depositAllowed: true }, [{ kind: 'DEPOSIT', status: 'FAILED' }], 'DEPOSIT'),
      ).toBe(true);
    });

    it('blocks any new payment once the invoice is PAID or VOID', () => {
      expect(canInitiatePayment({ status: 'PAID', depositAllowed: true }, [], 'DEPOSIT')).toBe(false);
      expect(canInitiatePayment({ status: 'VOID', depositAllowed: true }, [], 'DEPOSIT')).toBe(false);
    });

    it('allows FULL on a freshly issued invoice with no other attempts (DR-024)', () => {
      expect(canInitiatePayment({ status: 'ISSUED', depositAllowed: true }, [], 'FULL')).toBe(true);
    });

    it('blocks FULL once a deposit/balance attempt is active or succeeded', () => {
      expect(
        canInitiatePayment({ status: 'ISSUED', depositAllowed: true }, [{ kind: 'DEPOSIT', status: 'PENDING' }], 'FULL'),
      ).toBe(false);
      expect(
        canInitiatePayment({ status: 'PARTIALLY_PAID', depositAllowed: true }, [{ kind: 'DEPOSIT', status: 'SUCCEEDED' }], 'FULL'),
      ).toBe(false);
    });

    it('blocks DEPOSIT once a FULL attempt is active or succeeded, mirroring the reverse', () => {
      expect(
        canInitiatePayment({ status: 'ISSUED', depositAllowed: true }, [{ kind: 'FULL', status: 'PENDING' }], 'DEPOSIT'),
      ).toBe(false);
    });

    it('allows retrying FULL after a failed deposit attempt on the other path', () => {
      expect(
        canInitiatePayment({ status: 'ISSUED', depositAllowed: true }, [{ kind: 'DEPOSIT', status: 'FAILED' }], 'FULL'),
      ).toBe(true);
    });

    // DR-198
    it('blocks DEPOSIT outright once depositAllowed is false, even with no other attempts', () => {
      expect(canInitiatePayment({ status: 'ISSUED', depositAllowed: false }, [], 'DEPOSIT')).toBe(false);
    });

    it('still allows FULL when depositAllowed is false', () => {
      expect(canInitiatePayment({ status: 'ISSUED', depositAllowed: false }, [], 'FULL')).toBe(true);
    });
  });

  describe('canDownloadInvoicePdf (DR-169)', () => {
    it('blocks download while nothing has been paid (ISSUED)', () => {
      expect(canDownloadInvoicePdf('ISSUED')).toBe(false);
    });

    it('blocks download once voided', () => {
      expect(canDownloadInvoicePdf('VOID')).toBe(false);
    });

    it('allows download once the deposit succeeds (PARTIALLY_PAID)', () => {
      expect(canDownloadInvoicePdf('PARTIALLY_PAID')).toBe(true);
    });

    it('allows download once fully settled (PAID)', () => {
      expect(canDownloadInvoicePdf('PAID')).toBe(true);
    });

    it('blocks download on a still-unissued DRAFT invoice', () => {
      expect(canDownloadInvoicePdf('DRAFT')).toBe(false);
    });
  });

  describe('amountForPaymentKind', () => {
    const invoice = { depositMinor: 4000, balanceMinor: 6000, totalMinor: 10000 };

    it('returns the matching amount for each kind', () => {
      expect(amountForPaymentKind(invoice, 'DEPOSIT')).toBe(4000);
      expect(amountForPaymentKind(invoice, 'BALANCE')).toBe(6000);
      expect(amountForPaymentKind(invoice, 'FULL')).toBe(10000);
    });
  });

  describe('computeInvoiceAmounts (DR-104/DR-127)', () => {
    it('with no discount and no platform fee, reproduces the exact pre-coupon-feature numbers (regression guard)', () => {
      const amounts = computeInvoiceAmounts({ subtotalMinor: 10000, currency: 'USD', taxRateBp: 1000, platformFeeRateBp: 0 });
      expect(amounts).toEqual({
        discountMinor: 0,
        taxMinor: 1000,
        platformFeeMinor: 0,
        lateBookingSurchargeMinor: 0,
        depositAllowed: true,
        totalMinor: 11000,
        depositMinor: 3300,
        balanceMinor: 7700,
      });
    });

    it('DR-127: platform fee is charged to the customer on top of subtotal + tax, not absorbed by the platform', () => {
      // subtotal 10000, 10% tax -> 1000, pre-fee total 11000; platform fee
      // is 5% of THAT (550), and total/deposit/balance all include it.
      const amounts = computeInvoiceAmounts({ subtotalMinor: 10000, currency: 'USD', taxRateBp: 1000, platformFeeRateBp: 500 });
      expect(amounts.platformFeeMinor).toBe(550);
      expect(amounts.totalMinor).toBe(11550); // 10000 + 1000 + 550
      expect(amounts.depositMinor).toBe(3465); // 30% of 11550
      expect(amounts.balanceMinor).toBe(8085); // 11550 - 3465
    });

    it('discountBp: 0 behaves identically to omitting it', () => {
      const omitted = computeInvoiceAmounts({ subtotalMinor: 10000, currency: 'USD', taxRateBp: 1000, platformFeeRateBp: 0 });
      const zero = computeInvoiceAmounts({ subtotalMinor: 10000, currency: 'USD', taxRateBp: 1000, platformFeeRateBp: 0, discountBp: 0 });
      expect(zero).toEqual(omitted);
    });

    it('computes tax on the DISCOUNTED subtotal, not the original', () => {
      // subtotal 10000, 15% off -> discount 1500, discounted subtotal 8500;
      // tax is 10% of 8500 (850), NOT 10% of 10000 (1000).
      const amounts = computeInvoiceAmounts({
        subtotalMinor: 10000,
        currency: 'USD',
        taxRateBp: 1000,
        platformFeeRateBp: 0,
        discountBp: 1500,
      });
      expect(amounts.discountMinor).toBe(1500);
      expect(amounts.taxMinor).toBe(850);
      expect(amounts.totalMinor).toBe(9350); // (10000 - 1500) + 850
      expect(amounts.depositMinor).toBe(2805); // 30% of 9350
      expect(amounts.balanceMinor).toBe(6545); // 9350 - 2805
    });

    it('rounds the discount half-up, same convention as taxOf/splitDeposit', () => {
      // 9999 * 5% = 499.95 -> rounds to 500.
      const amounts = computeInvoiceAmounts({
        subtotalMinor: 9999,
        currency: 'USD',
        taxRateBp: 0,
        platformFeeRateBp: 0,
        discountBp: 500,
      });
      expect(amounts.discountMinor).toBe(500);
    });

    it('a 50% (max allowed) discount halves the subtotal before tax', () => {
      const amounts = computeInvoiceAmounts({
        subtotalMinor: 10000,
        currency: 'USD',
        taxRateBp: 1000,
        platformFeeRateBp: 0,
        discountBp: 5000,
      });
      expect(amounts.discountMinor).toBe(5000);
      expect(amounts.taxMinor).toBe(500); // 10% of the remaining 5000
      expect(amounts.totalMinor).toBe(5500);
    });

    // DR-198
    it('adds the late-booking surcharge on top of subtotal+tax+platform fee, and forces full payment', () => {
      // subtotal 10000, 10% tax -> 1000, pre-fee total 11000, 5% platform
      // fee -> 550, pre-surcharge total 11550; 5% surcharge on THAT (578,
      // half-up), total 12128 -- deposit/balance split is skipped entirely.
      const amounts = computeInvoiceAmounts({
        subtotalMinor: 10000,
        currency: 'USD',
        taxRateBp: 1000,
        platformFeeRateBp: 500,
        lateBookingSurchargeBp: 500,
      });
      expect(amounts.lateBookingSurchargeMinor).toBe(578);
      expect(amounts.totalMinor).toBe(12128);
      expect(amounts.depositAllowed).toBe(false);
      expect(amounts.depositMinor).toBe(amounts.totalMinor);
      expect(amounts.balanceMinor).toBe(0);
    });

    it('omitting/nulling lateBookingSurchargeBp behaves identically to the pre-DR-198 shape', () => {
      const omitted = computeInvoiceAmounts({ subtotalMinor: 10000, currency: 'USD', taxRateBp: 1000, platformFeeRateBp: 0 });
      const nulled = computeInvoiceAmounts({
        subtotalMinor: 10000,
        currency: 'USD',
        taxRateBp: 1000,
        platformFeeRateBp: 0,
        lateBookingSurchargeBp: null,
      });
      expect(nulled).toEqual(omitted);
      expect(omitted.depositAllowed).toBe(true);
    });
  });

  describe('computeCancellationRefundAmountMinor (DR-207, updated DR-261)', () => {
    // Every tier is now a straight percentage of the booking's total
    // package price -- the fully-paid gate lives one layer up, in
    // resolveCancellationRefundTier (booking/domain.ts), so this function
    // no longer needs paidMinor/depositMinor at all.
    const totalMinor = 100_000;

    it('FULL_MINUS_DEPOSIT refunds 70% of the total (the ceiling -- total minus the 30% deposit)', () => {
      expect(computeCancellationRefundAmountMinor('FULL_MINUS_DEPOSIT', totalMinor)).toBe(70_000);
    });

    it('FIFTY_PERCENT is half of the total package price', () => {
      expect(computeCancellationRefundAmountMinor('FIFTY_PERCENT', totalMinor)).toBe(50_000);
    });

    it('TWENTY_FIVE_PERCENT is a quarter of the total package price', () => {
      expect(computeCancellationRefundAmountMinor('TWENTY_FIVE_PERCENT', totalMinor)).toBe(25_000);
    });

    it('NONE refunds nothing regardless of the total price', () => {
      expect(computeCancellationRefundAmountMinor('NONE', totalMinor)).toBe(0);
    });
  });
});
