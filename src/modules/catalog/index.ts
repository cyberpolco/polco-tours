// catalog module — public interface. Other modules import ONLY from here.
export { catalogService } from './service';
export type { DepartureDetail, PublicPackageFilter } from './service';
export { CreateDepartureInput, CreatePackageInput, QuizAnswers, UpdatePackageInput, effectivePrice, isBookable } from './domain';
export type { AddonServiceView, DepartureView, TourPackageView } from './domain';
