// Cross-module orchestration: a client (bare/anonymous TOURIST contact
// record) may only be deleted once every one of their non-deleted bookings
// is COMPLETED and reviewed -- an active or future booking must never lose
// its contact record out from under it, and a completed-but-unreviewed
// booking hasn't finished its lifecycle yet. A booking the superadmin
// already deleted (soft-deleted) doesn't count against the client at all --
// bookingService.listForTourist only ever returns non-deleted rows.
//
// Lives here, not inside authService.deleteClient, because auth cannot
// depend on booking/ratings (booking already depends on auth -- the
// reverse would be circular), same "cross-module orchestration one layer
// up" convention as fleet-availability.ts.
import type { AuthContext } from '@modules/auth';
import { bookingService } from '@modules/booking';
import { ratingsService } from '@modules/ratings';
import { Errors } from '@lib/errors';

export async function assertClientDeletable(ctx: AuthContext, organizationId: string, clientUserId: string): Promise<void> {
  const bookings = await bookingService.listForTourist(ctx, clientUserId);
  for (const booking of bookings) {
    if (booking.status !== 'COMPLETED') {
      throw Errors.conflict('This client has an active or upcoming booking -- it must be completed or deleted first');
    }
    const ratingStatus = await ratingsService.getRatingCodeStatusForBookingLookup(organizationId, booking.id);
    if (!ratingStatus || ratingStatus.usedAt === null) {
      throw Errors.conflict('This client has a completed booking that has not been reviewed yet');
    }
  }
}
