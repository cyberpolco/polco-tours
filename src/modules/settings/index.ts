// settings module — public interface. Other modules import ONLY from here.
export { settingsService } from './service';
export {
  CreateCouponInput,
  CreateLateBookingRateInput,
  CreatePlatformRateInput,
  CreateTaxRateInput,
  UpdateCouponInput,
  UpdateLateBookingRateInput,
  UpdatePlatformRateInput,
  UpdateTaxRateInput,
} from './domain';
export type { CouponView, LateBookingRateView, PlatformRateView, TaxRateView } from './domain';
