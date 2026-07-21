// catalog module — public interface. Other modules import ONLY from here.
export { catalogService } from './service';
export type { DepartureDetail, PublicPackageFilter } from './service';
export {
  AddPackageItineraryDayInput,
  CreateDepartureInput,
  CreatePackageInput,
  PACKAGE_TAGS,
  SetDeparturePickupLocationInput,
  UpdatePackageInput,
  UpdatePackageItineraryDayInput,
  effectivePrice,
  formatPackageReference,
  isBookable,
} from './domain';
export type { AddonServiceView, DepartureView, PackageItineraryDayView, TourPackageView } from './domain';
