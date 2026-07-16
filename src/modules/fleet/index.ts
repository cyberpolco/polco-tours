// fleet module — public interface. Other modules import ONLY from here.
export { fleetService } from './service';
export type { UploadComplianceDocumentInput } from './service';
export {
  CreateDriverProfileInput,
  CreateMaintenanceRecordInput,
  CreateStarlinkKitInput,
  CreateVehicleInput,
  SetStarlinkLocationInput,
  UpdateDriverProfileInput,
  UpdateStarlinkKitInput,
  UpdateVehicleInput,
  complianceStatus,
  maintenanceRecencyScore,
} from './domain';
export type {
  ComplianceStatus,
  DriverProfileView,
  MaintenanceRecordView,
  StarlinkKitView,
  VehicleView,
} from './domain';
