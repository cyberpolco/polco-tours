// invoicing module — stubbed DPO gateway (charter rule 8: third-party
// integrations must be wrapped so an outage/incomplete-terms never blocks
// the system). DPO's real commercial terms are still open (OI-01); this
// stand-in is built behind the same interface a real `DpoGateway` (with
// timeouts/retries/circuit breaker) will implement -- swapping it in later is
// the ONLY change needed, no caller in service.ts changes.
import type { Currency } from '@prisma/client';

export interface InitiatePaymentRequest {
  amountMinor: number;
  currency: Currency;
  reference: string;
}

export interface InitiatePaymentResult {
  providerRef: string;
  redirectUrl: string;
}

export interface PaymentGateway {
  initiate(req: InitiatePaymentRequest): Promise<InitiatePaymentResult>;
}

/** Stand-in for DPO Pay (DR-002) until OI-01 lands. A staff-only route
 * (payment.resolve) manually flips the resulting PENDING payment to
 * SUCCEEDED/FAILED, standing in for what will become a DPO webhook. */
export class StubDpoGateway implements PaymentGateway {
  async initiate(req: InitiatePaymentRequest): Promise<InitiatePaymentResult> {
    const providerRef = `stub_${crypto.randomUUID()}`;
    return {
      providerRef,
      redirectUrl: `https://stub.dpo.polcotours.com/pay/${providerRef}?amount=${req.amountMinor}&currency=${req.currency}`,
    };
  }
}

export const paymentGateway: PaymentGateway = new StubDpoGateway();
