// assignment module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import { Prisma } from '@prisma/client';
import type { AuthContext } from '@modules/auth';
import { authService } from '@modules/auth';
import { catalogService } from '@modules/catalog';
import { fleetService } from '@modules/fleet';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import { departuresOverlap, type AssignmentView, type CreateAssignmentInput } from './domain';
import { assignmentRepository } from './repository';

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

export const assignmentService = {
  // 'assignment.write' is only ever granted to TOUR_OPERATOR/SUPERADMIN/
  // PLATFORM_ADMIN (rbac.ts) -- every method gated on it is inherently
  // manager-only, no separate role check needed.
  async createAssignment(
    ctx: AuthContext,
    departureId: string,
    input: CreateAssignmentInput,
  ): Promise<AssignmentView> {
    assertCan(ctx.roles, 'assignment.write');
    const organizationId = requireOrg(ctx);

    const { departure } = await catalogService.getDepartureDetail(ctx, departureId); // 404s if not found/visible

    const vehicle = await fleetService.getVehicle(ctx, input.vehicleId);
    if (vehicle.status !== 'ACTIVE') throw Errors.conflict('Vehicle is not ACTIVE');

    const driverProfile = await fleetService.getDriverProfile(ctx, input.driverProfileId);
    if (driverProfile.status !== 'ACTIVE') throw Errors.conflict('Driver is not ACTIVE');

    if (input.guideUserId) {
      const guide = await authService.getUser(input.guideUserId);
      // authService.getUser is a raw, org-unscoped lookup (mirrors
      // getUserByEmail's convention) -- check the org explicitly here to
      // avoid assigning a guide from a different tenant.
      if (!guide || !guide.roles.includes('TOUR_GUIDE') || guide.organizationId !== organizationId) {
        throw Errors.validation('guideUserId must reference a TOUR_GUIDE in this organization');
      }
    }

    // Double-booking: neither the vehicle nor the driver may already be
    // assigned to a *different* departure whose dates overlap this one.
    const [vehicleAssignments, driverAssignments] = await Promise.all([
      assignmentRepository.listForVehicle(organizationId, input.vehicleId),
      assignmentRepository.listForDriverProfile(organizationId, input.driverProfileId),
    ]);
    const otherDepartureIds = new Set(
      [...vehicleAssignments, ...driverAssignments].map((a) => a.departureId).filter((id) => id !== departureId),
    );
    for (const otherDepartureId of otherDepartureIds) {
      const other = await catalogService.getDepartureDetail(ctx, otherDepartureId);
      if (departuresOverlap(departure, other.departure)) {
        throw Errors.conflict('Vehicle or driver is already assigned to an overlapping departure');
      }
    }

    let assignment: AssignmentView;
    try {
      assignment = await assignmentRepository.create(organizationId, departureId, input);
    } catch (err) {
      // @@unique([departureId, vehicleId]) -- this vehicle is already on this departure.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Errors.conflict('This vehicle is already assigned to this departure');
      }
      throw err;
    }

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'assignment.created',
      resourceType: 'Assignment',
      resourceId: assignment.id,
      organizationId,
    });

    return assignment;
  },

  /** Manager-only -- the staff departure-detail page's data source. */
  async listForDeparture(ctx: AuthContext, departureId: string): Promise<AssignmentView[]> {
    assertCan(ctx.roles, 'assignment.write');
    const organizationId = requireOrg(ctx);
    await catalogService.getDepartureDetail(ctx, departureId); // 404s if not found/visible
    return assignmentRepository.listForDeparture(organizationId, departureId);
  },

  async removeAssignment(ctx: AuthContext, assignmentId: string): Promise<void> {
    assertCan(ctx.roles, 'assignment.write');
    const organizationId = requireOrg(ctx);
    const removed = await assignmentRepository.remove(organizationId, assignmentId);
    if (!removed) throw Errors.notFound('Assignment not found');

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'assignment.removed',
      resourceType: 'Assignment',
      resourceId: removed.id,
      organizationId,
    });
  },

  /** Self-service read, scoped per held role. No staff UI consumes this yet
   * (DR-018 deliberately defers a guide/driver/vehicle-owner portal) -- it
   * exists so the data is reachable and is covered by its own tests.
   *
   * DR-026: a user can hold several of these roles simultaneously, so this
   * collects the union across every role they hold (not just the first
   * match) and dedupes by assignment id in case the same row surfaces via
   * more than one angle. */
  async listMyAssignments(ctx: AuthContext): Promise<AssignmentView[]> {
    assertCan(ctx.roles, 'assignment.read');
    const organizationId = requireOrg(ctx);

    const lists: AssignmentView[][] = [];
    if (ctx.roles.includes('TOUR_GUIDE')) {
      lists.push(await assignmentRepository.listForGuide(organizationId, ctx.userId));
    }
    if (ctx.roles.includes('DRIVER')) {
      const profile = await fleetService.getMyDriverProfile(ctx);
      if (profile) lists.push(await assignmentRepository.listForDriverProfile(organizationId, profile.id));
    }
    if (ctx.roles.includes('VEHICLE_OWNER')) {
      const vehicles = await fleetService.listVehicles(ctx); // already owner-scoped
      const perVehicle = await Promise.all(vehicles.map((v) => assignmentRepository.listForVehicle(organizationId, v.id)));
      lists.push(perVehicle.flat());
    }
    // Managers use listForDeparture (per-departure) instead of a flat "mine" view.
    const byId = new Map<string, AssignmentView>();
    for (const list of lists) for (const a of list) byId.set(a.id, a);
    return [...byId.values()];
  },
};
