// visa module — repository. The only place that touches the DB for this module.
import type { VisaApplication, VisaStatus } from '@prisma/client';
import { withOrg } from '@lib/db';
import type { FacilitatorVisaView, VisaApplicationView } from './domain';

type FacilitatorVisaRow = Omit<
  FacilitatorVisaView,
  'travelStartDate' | 'bookingId' | 'origin' | 'hasPassport' | 'packageReference' | 'bookingReference'
>;

export interface CreateVisaApplicationParams {
  travelerId: string;
  country: string;
  travelerFirstName: string;
  travelerLastName: string;
  travelerNationality: string;
  travelerIdOrPassportNumber: string;
}

function toView(a: VisaApplication): VisaApplicationView {
  return {
    id: a.id,
    organizationId: a.organizationId,
    travelerId: a.travelerId,
    country: a.country,
    status: a.status,
    rejectionReason: a.rejectionReason,
    resubmissionCount: a.resubmissionCount,
    documentId: a.documentId,
    submittedAt: a.submittedAt,
    decidedAt: a.decidedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function toFacilitatorRow(a: VisaApplication): FacilitatorVisaRow {
  return {
    id: a.id,
    travelerId: a.travelerId,
    travelerFirstName: a.travelerFirstName,
    travelerLastName: a.travelerLastName,
    travelerNationality: a.travelerNationality,
    travelerIdOrPassportNumber: a.travelerIdOrPassportNumber,
    country: a.country,
    status: a.status,
    rejectionReason: a.rejectionReason,
    resubmissionCount: a.resubmissionCount,
    hasDocument: a.documentId !== null,
    submittedAt: a.submittedAt,
    decidedAt: a.decidedAt,
  };
}

export const visaRepository = {
  async create(organizationId: string, params: CreateVisaApplicationParams): Promise<VisaApplicationView> {
    return withOrg(organizationId, async (tx) => {
      const a = await tx.visaApplication.create({ data: { organizationId, ...params } });
      return toView(a);
    });
  },

  async findByTravelerId(organizationId: string, travelerId: string): Promise<VisaApplicationView | null> {
    return withOrg(organizationId, async (tx) => {
      const a = await tx.visaApplication.findUnique({ where: { travelerId } });
      return a ? toView(a) : null;
    });
  },

  async decide(
    organizationId: string,
    id: string,
    outcome: VisaStatus,
    decidedAt: Date,
    reason?: string,
  ): Promise<VisaApplicationView> {
    return withOrg(organizationId, async (tx) => {
      const a = await tx.visaApplication.update({
        where: { id },
        data: { status: outcome, decidedAt, rejectionReason: outcome === 'REJECTED' ? (reason ?? null) : null },
      });
      return toView(a);
    });
  },

  /** DR-025: resets the SAME row REJECTED -> SUBMITTED. Nulls documentId so
   * a stale rejected document stops 200'ing from streamDocument; nulls
   * rejectionReason/decidedAt to reflect a fresh, undecided cycle; bumps
   * submittedAt so the facilitator queue (ordered by submittedAt desc)
   * actually resurfaces it for review. */
  async resubmit(organizationId: string, id: string): Promise<VisaApplicationView> {
    return withOrg(organizationId, async (tx) => {
      const a = await tx.visaApplication.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          decidedAt: null,
          documentId: null,
          rejectionReason: null,
          resubmissionCount: { increment: 1 },
        },
      });
      return toView(a);
    });
  },

  async setDocument(organizationId: string, id: string, documentId: string): Promise<VisaApplicationView> {
    return withOrg(organizationId, async (tx) => {
      const a = await tx.visaApplication.update({ where: { id }, data: { documentId } });
      return toView(a);
    });
  },

  /** VISA_FACILITATOR's whole-org queue (DR-031) -- no country filter, since
   * this role has no scoping concept of its own (IMMIGRATION_OFFICER, which
   * did, was removed entirely in DR-032). travelStartDate isn't resolved
   * here (that's a live cross-module join the service layer does); order is
   * left as submittedAt desc, the service re-sorts by travelStartDate once
   * resolved. */
  async listAllForFacilitator(organizationId: string): Promise<FacilitatorVisaRow[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.visaApplication.findMany({ orderBy: { submittedAt: 'desc' } });
      return rows.map(toFacilitatorRow);
    });
  },

  /** DR-060: every travelerId that already has a VisaApplication -- used to
   * diff against booking's whole-org "requires visa" candidate list for the
   * "needs application" reconciliation view. */
  async listExistingTravelerIds(organizationId: string): Promise<Set<string>> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.visaApplication.findMany({ select: { travelerId: true } });
      return new Set(rows.map((r) => r.travelerId));
    });
  },
};
