// invoicing module — public interface. Other modules import ONLY from here.
export { invoicingService } from './service';
export { InitiatePaymentInput, ResolvePaymentInput } from './domain';
export type { InvoiceView, PaymentView } from './domain';
