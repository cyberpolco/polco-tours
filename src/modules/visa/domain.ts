// visa module — domain types & rules. Pure; no framework or DB imports.
import type { BookingOrigin, VisaStatus } from '@prisma/client';
import { z } from 'zod';

export interface VisaApplicationView {
  id: string;
  organizationId: string;
  travelerId: string;
  country: string;
  status: VisaStatus;
  rejectionReason: string | null;
  resubmissionCount: number;
  documentId: string | null;
  submittedAt: Date;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// My Schedule (DR-031): a VISA_FACILITATOR's own read-only dashboard --
// includes rejectionReason and travelerId (needed to resolve a travel date)
// since this role already holds visa.process (can act on any traveler in the
// org) -- documentId itself still isn't exposed, hasDocument is enough
// signal. (This was originally described as "broader than the
// IMMIGRATION_OFFICER projection" -- that role and its BR-10-minimized
// OfficerVisaView were removed entirely in DR-032.)
// travelStartDate is resolved by the service (a live join through the
// booking/catalog modules, not stored on VisaApplication) -- null only if
// the underlying booking/departure data is itself missing, which shouldn't
// happen in practice but isn't schema-enforced.
export interface FacilitatorVisaView {
  id: string;
  travelerId: string;
  // Resolved live alongside travelStartDate (DR-034) -- lets the visa-queue
  // page call contactTraveler/requestMissingDocuments, which need a
  // bookingId the same way submit/decide/resubmit do (findTraveler's
  // anti-BOLA check). Null only if the reverse booking lookup itself fails
  // (same rare case travelStartDate already tolerates).
  bookingId: string | null;
  // Resolved live alongside bookingId/travelStartDate (DR-060) -- null in
  // the same rare case those are (the reverse booking lookup itself
  // failing), so a facilitator can filter/scan by source at a glance.
  origin: BookingOrigin | null;
  travelerFirstName: string;
  travelerLastName: string;
  travelerNationality: string;
  travelerIdOrPassportNumber: string;
  country: string;
  status: VisaStatus;
  rejectionReason: string | null;
  resubmissionCount: number;
  hasDocument: boolean;
  submittedAt: Date;
  decidedAt: Date | null;
  travelStartDate: Date | null;
}

// DR-060: a traveler with an uploaded passport on a booking that requires
// one, but no VisaApplication yet -- the "needs application" reconciliation
// view on /staff/visa-queue. Now that submitApplication is auto-triggered
// right after passport upload (see visaService.autoSubmitOnPassportUpload),
// this list should normally be small/empty -- it exists as a safety net for
// data that predates the automatic trigger, or for the rare case that
// trigger silently skipped (e.g. an unresolvable destination country).
export interface PendingVisaApplicationView {
  travelerId: string;
  bookingId: string;
  origin: BookingOrigin;
  travelerFirstName: string;
  travelerLastName: string;
  travelerNationality: string;
}

// Immigration Module (DR-034): "contact travellers" -- a staff-authored
// free-text message, sent to the booking's tour lead (the traveler itself
// isn't a User account, see visa/service.ts's contactTraveler).
export const ContactTravelerInput = z.object({
  message: z.string().trim().min(1).max(1000),
});
export type ContactTravelerInput = z.infer<typeof ContactTravelerInput>;

export const DecideVisaInput = z.object({
  outcome: z.enum(['APPROVED', 'REJECTED']),
  // Only persisted when outcome is REJECTED (service/repository clear it
  // otherwise) -- without this, resubmission would be nearly meaningless
  // since nobody could see what to fix (DR-025).
  reason: z.string().trim().max(500).optional(),
});
export type DecideVisaInput = z.infer<typeof DecideVisaInput>;

/** A decision may only be made once per submission cycle, from SUBMITTED.
 * A REJECTED application can't be decided again directly -- it must go
 * through canResubmit() first, which resets it back to SUBMITTED (DR-025). */
export function canDecide(status: VisaStatus): boolean {
  return status === 'SUBMITTED';
}

/** DR-025: the only path out of REJECTED. Resets the same row to SUBMITTED
 * rather than creating a new one (see repository.resubmit) -- the durable
 * "this was rejected once, on date X, for reason Y" record lives in the
 * append-only audit_logs table, not in a parallel schema history. */
export function canResubmit(status: VisaStatus): boolean {
  return status === 'REJECTED';
}
