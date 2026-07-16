// visa module — domain types & rules. Pure; no framework or DB imports.
import type { VisaStatus } from '@prisma/client';
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

// Minimal projection for IMMIGRATION_OFFICER (BR-10 data minimization) --
// built from VisaApplication's own snapshotted traveler fields, never a live
// join into the booking module (that role holds no booking.read grant).
// rejectionReason is deliberately excluded (same minimization posture as
// disabilities/allergies/phone) -- resubmissionCount is a bare count and
// enough signal that "this bounced before" without exposing the free-text
// reason to a strictly read-only role with no visa.process stake in it.
export interface OfficerVisaView {
  id: string;
  travelerFirstName: string;
  travelerLastName: string;
  travelerNationality: string;
  travelerIdOrPassportNumber: string;
  country: string;
  status: VisaStatus;
  resubmissionCount: number;
  submittedAt: Date;
  decidedAt: Date | null;
  hasDocument: boolean;
}

// My Schedule (DR-031): a VISA_FACILITATOR's own read-only dashboard --
// broader than OfficerVisaView since this role already holds visa.process
// (can act on any traveler in the org), so rejectionReason and travelerId
// (needed to resolve a travel date) are included, unlike the BR-10-minimized
// officer projection. documentId itself still isn't exposed -- hasDocument
// is enough signal, same minimization posture as OfficerVisaView.
// travelStartDate is resolved by the service (a live join through the
// booking/catalog modules, not stored on VisaApplication) -- null only if
// the underlying booking/departure data is itself missing, which shouldn't
// happen in practice but isn't schema-enforced.
export interface FacilitatorVisaView {
  id: string;
  travelerId: string;
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
