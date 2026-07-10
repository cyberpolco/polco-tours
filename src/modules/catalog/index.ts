// catalog module — public interface. Other modules import ONLY from here.
export { catalogService } from './service';
export type { DepartureDetail } from './service';
export { CreateDepartureInput, CreatePackageInput, QuizAnswers, UpdatePackageInput, effectivePrice, isBookable } from './domain';
export type { AddonServiceView, DepartureView, TourPackageView } from './domain';
