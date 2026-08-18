// settings module — public interface. Other modules import ONLY from here.
export { settingsService } from './service';
export {
  CreateCouponInput,
  CreatePlatformRateInput,
  CreateTaxRateInput,
  UpdateCouponInput,
  UpdatePlatformRateInput,
  UpdateTaxRateInput,
} from './domain';
export type { CouponView, PlatformRateView, TaxRateView } from './domain';
