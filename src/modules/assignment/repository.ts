// assignment module — repository. The only place that touches the DB for this module.
import type { Assignment } from '@prisma/client';
import { withOrg } from '@lib/db';
import type { AssignmentView, CreateAssignmentInput } from './domain';

function toView(a: Assignment): AssignmentView {
  return {
    id: a.id,
    organizationId: a.organizationId,
    departureId: a.departureId,
    vehicleId: a.vehicleId,
    driverProfileId: a.driverProfileId,
    guideUserId: a.guideUserId,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export const assignmentRepository = {
  async create(organizationId: string, departureId: string, input: CreateAssignmentInput): Promise<AssignmentView> {
    return withOrg(organizationId, async (tx) => {
      const a = await tx.assignment.create({ data: { organizationId, departureId, ...input } });
      return toView(a);
    });
  },

  async listForDeparture(organizationId: string, departureId: string): Promise<AssignmentView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.assignment.findMany({ where: { departureId }, orderBy: { createdAt: 'asc' } });
      return rows.map(toView);
    });
  },

  /** Insights & Decision Making (DR-038): every assignment in the org --
   * source data for fleet/driver/guide utilization reporting. */
  async listAllForOrg(organizationId: string): Promise<AssignmentView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.assignment.findMany();
      return rows.map(toView);
    });
  },

  async listForVehicle(organizationId: string, vehicleId: string): Promise<AssignmentView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.assignment.findMany({ where: { vehicleId } });
      return rows.map(toView);
    });
  },

  async listForDriverProfile(organizationId: string, driverProfileId: string): Promise<AssignmentView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.assignment.findMany({ where: { driverProfileId } });
      return rows.map(toView);
    });
  },

  async listForGuide(organizationId: string, guideUserId: string): Promise<AssignmentView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.assignment.findMany({ where: { guideUserId } });
      return rows.map(toView);
    });
  },

  async remove(organizationId: string, id: string): Promise<AssignmentView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.assignment.findUnique({ where: { id } });
      if (!existing) return null;
      await tx.assignment.delete({ where: { id } });
      return toView(existing);
    });
  },
};
