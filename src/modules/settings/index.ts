// settings module — public interface. Other modules import ONLY from here.
export { settingsService } from './service';
export { CreatePlatformRateInput, CreateTaxRateInput } from './domain';
export type { PlatformRateView, TaxRateView } from './domain';
