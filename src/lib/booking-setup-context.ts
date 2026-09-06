import type { AuthContext } from '@modules/auth';
import { resolvePermissionsForRoles } from '@lib/rbac';

// DR-257: the guest's own AuthContext, rebuilt server-side after the
// /complete-booking flow has proved three factors (booking reference, tour
// lead surname, on-file email) and issued a booking_setup credential.
//
// Why this rather than more *ForBookingLookup twins: the payment step runs
// through getOrCreateInvoiceForBooking -> getBillableTotal ->
// initiatePayment -> applyPaymentOutcome -> recordPaymentReceived +
// notifyPaymentSucceeded, carrying real tax, platform-fee and
// late-booking-surcharge logic. Re-implementing that chain without a ctx
// would mean duplicating money maths -- exactly the kind of second copy
// that drifts and misprices. Handing the existing, already-tested chain a
// context instead keeps one implementation.
//
// This is NOT an escalation. `userId` is the booking's own touristUserId, so
// every anti-BOLA check downstream ("is this booking/invoice ctx's own?")
// still runs and still has to pass -- it just passes, because the guest
// really is that booking's owner and has proved it. The role is TOURIST and
// the permissions come from rbac.ts's own ROLE_PERMISSIONS rather than being
// hand-listed here, so this context can never hold more than a signed-in
// tourist would. TOURIST's own grants are already documented in rbac.ts as
// "own booking/invoice only -- enforced in service.ts".
//
// Only ever construct this from a booking resolved server-side out of the
// setup credential. Never from anything a client supplied.
export function buildGuestSetupContext(booking: { touristUserId: string; organizationId: string }): AuthContext {
  return {
    userId: booking.touristUserId,
    roles: ['TOURIST'],
    permissions: resolvePermissionsForRoles(['TOURIST']),
    organizationId: booking.organizationId,
    // Not a real better-auth session id -- nothing resolves a Session row
    // from this. Labelled so it is obvious in any audit/log line that this
    // context came from the setup flow rather than a signed-in session.
    sessionId: 'booking-setup',
    mustChangePassword: false,
  };
}
