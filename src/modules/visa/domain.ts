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
