// visa module — domain types & rules. Pure; no framework or DB imports.
import type { VisaStatus } from '@prisma/client';
import { z } from 'zod';

export interface VisaApplicationView {
  id: string;
  organizationId: string;
  travelerId: string;
  country: string;
  status: VisaStatus;
  documentId: string | null;
  submittedAt: Date;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Minimal projection for IMMIGRATION_OFFICER (BR-10 data minimization) --
// built from VisaApplication's own snapshotted traveler fields, never a live
// join into the booking module (that role holds no booking.read grant).
export interface OfficerVisaView {
  id: string;
  travelerFirstName: string;
  travelerLastName: string;
  travelerNationality: string;
  travelerIdOrPassportNumber: string;
  country: string;
  status: VisaStatus;
  submittedAt: Date;
  decidedAt: Date | null;
  hasDocument: boolean;
}

export const DecideVisaInput = z.object({
  outcome: z.enum(['APPROVED', 'REJECTED']),
});
export type DecideVisaInput = z.infer<typeof DecideVisaInput>;

/** The only status-transition rule this increment: a decision may only be
 * made once, from SUBMITTED. No resubmission after REJECTED. */
export function canDecide(status: VisaStatus): boolean {
  return status === 'SUBMITTED';
}
