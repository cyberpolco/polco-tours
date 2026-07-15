// visa module — repository. The only place that touches the DB for this module.
import type { VisaApplication, VisaStatus } from '@prisma/client';
import { withOrg } from '@lib/db';
import type { OfficerVisaView, VisaApplicationView } from './domain';

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

function toOfficerView(a: VisaApplication): OfficerVisaView {
  return {
    id: a.id,
    travelerFirstName: a.travelerFirstName,
    travelerLastName: a.travelerLastName,
    travelerNationality: a.travelerNationality,
    travelerIdOrPassportNumber: a.travelerIdOrPassportNumber,
    country: a.country,
    status: a.status,
    resubmissionCount: a.resubmissionCount,
    submittedAt: a.submittedAt,
    decidedAt: a.decidedAt,
    hasDocument: a.documentId !== null,
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
   * submittedAt so the officer/facilitator queues (ordered by submittedAt
   * desc) actually resurface it for review. */
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

  async listForCountry(organizationId: string, country: string): Promise<OfficerVisaView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.visaApplication.findMany({ where: { country }, orderBy: { submittedAt: 'desc' } });
      return rows.map(toOfficerView);
    });
  },

  /** No country filter -- admin-only auditing view (visaService.listForCountry). */
  async listAll(organizationId: string): Promise<OfficerVisaView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.visaApplication.findMany({ orderBy: { submittedAt: 'desc' } });
      return rows.map(toOfficerView);
    });
  },
};
