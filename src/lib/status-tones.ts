import type {
  AvailabilityStatus,
  BookingStatus,
  DepartureStatus,
  DriverStatus,
  GuideStatus,
  InvoiceStatus,
  ItineraryStatus,
  PackageStatus,
  PaymentStatus,
  StarlinkStatus,
  VehicleStatus,
  VisaDocumentStatus,
  VisaFeePaymentStatus,
  VisaStatus,
} from '@prisma/client';
import type { ComplianceStatus } from '@modules/fleet';
import type { LocationFreshness } from '@modules/tracking';
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

// DR-082: usage-recency, independent of the operational-hold statuses
// above (VEHICLE/DRIVER/GUIDE_STATUS_TONE) -- see AvailabilityStatus.
export const AVAILABILITY_STATUS_TONE: Record<AvailabilityStatus, BadgeTone> = {
  AVAILABLE: 'success',
  BOOKED: 'warning',
  INACTIVE: 'neutral',
};

export const STARLINK_STATUS_TONE: Record<StarlinkStatus, BadgeTone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  MAINTENANCE: 'warning',
};

// DR-117: PUBLISHED_UNAVAILABLE gets its own tone (warning) -- still a real,
// published package, just not currently bookable, distinct from a plain
// success/neutral read.
export const PACKAGE_STATUS_TONE: Record<PackageStatus, BadgeTone> = {
  DRAFT: 'neutral',
  PUBLISHED_AVAILABLE: 'success',
  PUBLISHED_UNAVAILABLE: 'warning',
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

// DR-184: the destination country's own government fee -- distinct from the
// visa decision itself, tracked purely as a status flag (no Payment/Invoice).
export const VISA_FEE_PAYMENT_STATUS_TONE: Record<VisaFeePaymentStatus, BadgeTone> = {
  NOT_REQUESTED: 'neutral',
  REQUESTED: 'warning',
  PAID: 'success',
};

// DR-210: the facilitator's manual Missing/Received/Not required toggle --
// independent of whether a real file is actually on record.
export const VISA_DOCUMENT_STATUS_TONE: Record<VisaDocumentStatus, BadgeTone> = {
  MISSING: 'warning',
  RECEIVED: 'success',
  NOT_REQUIRED: 'neutral',
};

export const ITINERARY_STATUS_TONE: Record<ItineraryStatus, BadgeTone> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'warning',
  APPROVED: 'success',
};

// Tracking (DR-041) -- same tone intent as complianceStatus/COMPLIANCE_STATUS_TONE.
export const LOCATION_FRESHNESS_TONE: Record<LocationFreshness, BadgeTone> = {
  FRESH: 'success',
  STALE: 'warning',
  UNKNOWN: 'neutral',
};
