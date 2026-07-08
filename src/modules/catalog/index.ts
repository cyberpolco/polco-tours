// catalog module — public interface. Other modules import ONLY from here.
export { catalogService } from './service';
export type { DepartureDetail } from './service';
export { CreateDepartureInput, CreatePackageInput, UpdatePackageInput } from './domain';
export type { DepartureView, TourPackageView } from './domain';
