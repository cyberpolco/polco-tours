import type {
  BookingStatus,
  DepartureStatus,
  DriverStatus,
  GuideStatus,
  InvoiceStatus,
  PackageStatus,
  PaymentStatus,
  StarlinkStatus,
  VehicleStatus,
  VisaStatus,
} from '@prisma/client';
import type { ComplianceStatus } from '@modules/fleet';
import type { BadgeTone } from '@/components/ui/Badge';

// Every status->tone mapping in one place, shared by the guest and staff
// dashboards (moved here from the guest-only src/app/(guest)/badge-tones.ts
// once the staff dashboard needed the same pattern for its own enums).
export const BOOKING_STATUS_TONE: Record<BookingStatus, BadgeTone> = {
  DRAFT: 'neutral',
  AWAITING_QUOTATION: 'warning',
  QUOTATION_SENT: 'warning',
  AWAITING_DEPOSIT: 'warning',
  DEPOSIT_PAID: 'warning',
  FULLY_PAID: 'success',
  CONFIRMED: 'success',
  IN_PROGRESS: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'neutral',
  REFUNDED: 'neutral',
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  PENDING: 'warning',
  SUCCEEDED: 'success',
  FAILED: 'danger',
};

export const VEHICLE_STATUS_TONE: Record<VehicleStatus, BadgeTone> = {
  ACTIVE: 'success',
  MAINTENANCE: 'warning',
  RETIRED: 'neutral',
};

export const DRIVER_STATUS_TONE: Record<DriverStatus, BadgeTone> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
};

export const GUIDE_STATUS_TONE: Record<GuideStatus, BadgeTone> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
};

export const STARLINK_STATUS_TONE: Record<StarlinkStatus, BadgeTone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  MAINTENANCE: 'warning',
};

export const PACKAGE_STATUS_TONE: Record<PackageStatus, BadgeTone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  ARCHIVED: 'neutral',
};

export const DEPARTURE_STATUS_TONE: Record<DepartureStatus, BadgeTone> = {
  SCHEDULED: 'success',
  CANCELLED: 'neutral',
  COMPLETED: 'neutral',
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, BadgeTone> = {
  DRAFT: 'neutral',
  ISSUED: 'warning',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  VOID: 'neutral',
};

// Same tone intent as fleet/domain.ts's complianceStatus() -- MISSING/VALID/
// EXPIRING_SOON/EXPIRED -- previously a hand-rolled STATUS_CLASS object
// duplicated verbatim across the vehicle and driver detail pages.
export const COMPLIANCE_STATUS_TONE: Record<ComplianceStatus, BadgeTone> = {
  MISSING: 'neutral',
  VALID: 'success',
  EXPIRING_SOON: 'warning',
  EXPIRED: 'danger',
};

export const VISA_STATUS_TONE: Record<VisaStatus, BadgeTone> = {
  SUBMITTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};
