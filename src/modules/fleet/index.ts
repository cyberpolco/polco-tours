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
  complianceStatus,
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
