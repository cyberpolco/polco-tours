// DR-138: when a staff account is created or edited holding DRIVER/
// TOUR_GUIDE/VEHICLE_OWNER, give it a starter fleet record instead of
// leaving staff to remember to create one separately on /staff/fleet/* --
// same "auto-create the shell, staff finishes it" precedent as DR-108's
// createCustomizedPackageFromBooking. Composes auth + fleet here, one level
// up from both modules (auth can't depend on fleet -- fleet already types
// its ctx param off auth's AuthContext, so the reverse would be circular),
// same convention as create-customized-package.ts/client-deletion.ts/
// fleet-availability.ts.
//
// Idempotent per role: DriverProfile/GuideProfile are true 1:1s (userId
// unique on both tables), skipped if one already exists so a later role
// edit (e.g. removing then re-adding the same role) never throws a
// duplicate-key error or silently clobbers a profile staff have already
// filled in. Vehicle has no such uniqueness -- guarded instead by "does
// this user already own ANY vehicle," so toggling VEHICLE_OWNER on/off/on
// doesn't pile up placeholder vehicles.
//
// Best-effort: a failure here (e.g. a customized permission matrix that
// grants admin.all to a role fleetService doesn't recognize as a manager)
// must never fail the user create/edit action itself -- same "never fail X
// creation over a Y issue" posture as itineraryService.createItinerary's
// own template-copy step.
import type { Role } from '@prisma/client';
import type { AuthContext } from '@modules/auth';
import { fleetService } from '@modules/fleet';
import { audit } from '@lib/audit';

// Every required field with no source data on a freshly created User
// (licenseNumber, plate/make/model/vehicleType) gets this placeholder --
// staff overwrite it with the real value on the fleet edit page. seatCapacity
// must be a positive int, so 1 is the smallest honest placeholder.
const PENDING = 'PENDING';

export async function provisionFleetProfilesForUser(ctx: AuthContext, userId: string, roles: Role[]): Promise<void> {
  if (!ctx.organizationId) return;
  const provisioned: string[] = [];

  try {
    if (roles.includes('DRIVER') && !(await fleetService.findDriverProfileByUserId(ctx, userId))) {
      await fleetService.createDriverProfile(ctx, { userId, licenseNumber: PENDING });
      provisioned.push('DriverProfile');
    }
    if (roles.includes('TOUR_GUIDE') && !(await fleetService.findGuideProfileByUserId(ctx, userId))) {
      await fleetService.createGuideProfile(ctx, { userId });
      provisioned.push('GuideProfile');
    }
    if (roles.includes('VEHICLE_OWNER') && (await fleetService.findVehiclesByOwnerId(ctx, userId)).length === 0) {
      await fleetService.createVehicle(ctx, {
        ownerId: userId,
        plateNumber: `${PENDING}-${userId.slice(0, 8).toUpperCase()}`,
        make: PENDING,
        model: PENDING,
        vehicleType: PENDING,
        seatCapacity: 1,
      });
      provisioned.push('Vehicle');
    }
  } catch {
    // Never fail user creation/editing over a fleet-provisioning issue --
    // staff can still create the profile manually on /staff/fleet/*, same
    // as before this feature existed.
    return;
  }

  if (provisioned.length > 0) {
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'fleet.profile_auto_provisioned',
      resourceType: 'User',
      resourceId: userId,
      organizationId: ctx.organizationId,
      metadata: { provisioned },
    });
  }
}
