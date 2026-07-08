// catalog module — public interface. Other modules import ONLY from here.
export { catalogService } from './service';
export type { DepartureDetail } from './service';
export type { CreateDepartureInput, CreatePackageInput, DepartureView, TourPackageView, UpdatePackageInput } from './domain';
