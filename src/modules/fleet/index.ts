// fleet module — public interface. Other modules import ONLY from here.
export { fleetService } from './service';
export type { UploadComplianceDocumentInput } from './service';
export {
  CreateDriverProfileInput,
  CreateVehicleInput,
  UpdateDriverProfileInput,
  UpdateVehicleInput,
  complianceStatus,
} from './domain';
export type { ComplianceStatus, DriverProfileView, VehicleView } from './domain';
