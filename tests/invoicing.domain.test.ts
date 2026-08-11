import { describe, it, expect } from 'vitest';
import {
  amountForPaymentKind,
  canInitiatePayment,
  canTransitionInvoice,
  canTransitionPayment,
  computeInvoiceAmounts,
  nextInvoiceStatusAfterPayment,
  splitDeposit,
} from '../src/modules/invoicing/domain';

describe('invoicing domain', () => {
  describe('splitDeposit', () => {
    it('splits 40%/60%, half-up, drift-free', () => {
      expect(splitDeposit(10000)).toEqual({ depositMinor: 4000, balanceMinor: 6000 });
    });

    it('rounds the deposit half-up and the balance absorbs any remainder (no independent rounding)', () => {
      // 9999 * 0.4 = 3999.6 -> rounds to 4000; balance = 9999 - 4000 = 5999.
      const { depositMinor, balanceMinor } = splitDeposit(9999);
      expect(depositMinor).toBe(4000);
      expect(balanceMinor).toBe(5999);
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
      expect(canInitiatePayment({ status: 'ISSUED' }, [], 'DEPOSIT')).toBe(true);
    });

    it('blocks initiating BALANCE before the deposit has succeeded', () => {
      expect(canInitiatePayment({ status: 'ISSUED' }, [], 'BALANCE')).toBe(false);
      expect(
        canInitiatePayment({ status: 'ISSUED' }, [{ kind: 'DEPOSIT', status: 'PENDING' }], 'BALANCE'),
      ).toBe(false);
    });

    it('allows initiating BALANCE once the deposit has succeeded', () => {
      expect(
        canInitiatePayment(
          { status: 'PARTIALLY_PAID' },
          [{ kind: 'DEPOSIT', status: 'SUCCEEDED' }],
          'BALANCE',
        ),
      ).toBe(true);
    });

    it('blocks re-initiating a leg that already has a non-failed attempt outstanding', () => {
      expect(
        canInitiatePayment({ status: 'ISSUED' }, [{ kind: 'DEPOSIT', status: 'PENDING' }], 'DEPOSIT'),
      ).toBe(false);
      expect(
        canInitiatePayment({ status: 'ISSUED' }, [{ kind: 'DEPOSIT', status: 'SUCCEEDED' }], 'DEPOSIT'),
      ).toBe(false);
    });

    it('allows retrying a leg whose previous attempt failed', () => {
      expect(
        canInitiatePayment({ status: 'ISSUED' }, [{ kind: 'DEPOSIT', status: 'FAILED' }], 'DEPOSIT'),
      ).toBe(true);
    });

    it('blocks any new payment once the invoice is PAID or VOID', () => {
      expect(canInitiatePayment({ status: 'PAID' }, [], 'DEPOSIT')).toBe(false);
      expect(canInitiatePayment({ status: 'VOID' }, [], 'DEPOSIT')).toBe(false);
    });

    it('allows FULL on a freshly issued invoice with no other attempts (DR-024)', () => {
      expect(canInitiatePayment({ status: 'ISSUED' }, [], 'FULL')).toBe(true);
    });

    it('blocks FULL once a deposit/balance attempt is active or succeeded', () => {
      expect(
        canInitiatePayment({ status: 'ISSUED' }, [{ kind: 'DEPOSIT', status: 'PENDING' }], 'FULL'),
      ).toBe(false);
      expect(
        canInitiatePayment({ status: 'PARTIALLY_PAID' }, [{ kind: 'DEPOSIT', status: 'SUCCEEDED' }], 'FULL'),
      ).toBe(false);
    });

    it('blocks DEPOSIT once a FULL attempt is active or succeeded, mirroring the reverse', () => {
      expect(
        canInitiatePayment({ status: 'ISSUED' }, [{ kind: 'FULL', status: 'PENDING' }], 'DEPOSIT'),
      ).toBe(false);
    });

    it('allows retrying FULL after a failed deposit attempt on the other path', () => {
      expect(
        canInitiatePayment({ status: 'ISSUED' }, [{ kind: 'DEPOSIT', status: 'FAILED' }], 'FULL'),
      ).toBe(true);
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

  describe('computeInvoiceAmounts (DR-104)', () => {
    it('with no discount, reproduces the exact pre-coupon-feature numbers (regression guard)', () => {
      const amounts = computeInvoiceAmounts({ subtotalMinor: 10000, currency: 'USD', taxRateBp: 1000 });
      expect(amounts).toEqual({ discountMinor: 0, taxMinor: 1000, totalMinor: 11000, depositMinor: 4400, balanceMinor: 6600 });
    });

    it('discountBp: 0 behaves identically to omitting it', () => {
      const omitted = computeInvoiceAmounts({ subtotalMinor: 10000, currency: 'USD', taxRateBp: 1000 });
      const zero = computeInvoiceAmounts({ subtotalMinor: 10000, currency: 'USD', taxRateBp: 1000, discountBp: 0 });
      expect(zero).toEqual(omitted);
    });

    it('computes tax on the DISCOUNTED subtotal, not the original', () => {
      // subtotal 10000, 15% off -> discount 1500, discounted subtotal 8500;
      // tax is 10% of 8500 (850), NOT 10% of 10000 (1000).
      const amounts = computeInvoiceAmounts({ subtotalMinor: 10000, currency: 'USD', taxRateBp: 1000, discountBp: 1500 });
      expect(amounts.discountMinor).toBe(1500);
      expect(amounts.taxMinor).toBe(850);
      expect(amounts.totalMinor).toBe(9350); // (10000 - 1500) + 850
      expect(amounts.depositMinor).toBe(3740); // 40% of 9350
      expect(amounts.balanceMinor).toBe(5610); // 9350 - 3740
    });

    it('rounds the discount half-up, same convention as taxOf/splitDeposit', () => {
      // 9999 * 5% = 499.95 -> rounds to 500.
      const amounts = computeInvoiceAmounts({ subtotalMinor: 9999, currency: 'USD', taxRateBp: 0, discountBp: 500 });
      expect(amounts.discountMinor).toBe(500);
    });

    it('a 50% (max allowed) discount halves the subtotal before tax', () => {
      const amounts = computeInvoiceAmounts({ subtotalMinor: 10000, currency: 'USD', taxRateBp: 1000, discountBp: 5000 });
      expect(amounts.discountMinor).toBe(5000);
      expect(amounts.taxMinor).toBe(500); // 10% of the remaining 5000
      expect(amounts.totalMinor).toBe(5500);
    });
  });
});
