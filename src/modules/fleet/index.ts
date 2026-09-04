// fleet module — public interface. Other modules import ONLY from here.
export { fleetService } from './service';
export type { UploadComplianceDocumentInput } from './service';
export {
  CreateDriverProfileInput,
  CreateGuideProfileInput,
  CreateMaintenanceRecordInput,
  CreateStarlinkKitInput,
  CreateVehicleInput,
  SetStarlinkLocationInput,
  UpdateDriverProfileInput,
  UpdateGuideProfileInput,
  UpdateStarlinkKitInput,
  UpdateVehicleInput,
  LANGUAGE_CODES,
  LANGUAGE_LABELS,
  POST_TOUR_AVAILABILITY_DELAY_HOURS,
  complianceStatus,
  isWithinPostTourCooldown,
  maintenanceRecencyScore,
} from './domain';
export type {
  ComplianceStatus,
  DriverProfileView,
  GuideProfileView,
  MaintenanceRecordView,
  StarlinkKitView,
  VehicleView,
} from './domain';
export type { AvailabilityStatus } from '@prisma/client';
