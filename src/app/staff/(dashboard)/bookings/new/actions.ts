'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { CreateBookingWithDatesInput, CreateTailorMadeInput, bookingService } from '@modules/booking';
import { ApiError } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';

// Explicit user direction: only SUPERADMIN and TOUR_OPERATOR may create a
// booking manually here -- see page.tsx's requireNewBookingAccess for the
// full reasoning; re-checked here too since a Server Action is a real
// network entry point of its own, not just reachable through this page.
function requireNewBookingAccess(roles: string[]): void {
  if (!roles.includes('SUPERADMIN') && !roles.includes('TOUR_OPERATOR')) redirect('/staff/forbidden');
}

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// Mirrors (guest)/book-package/[packageId]'s own createGuestPackageBookingAction
// (same createHoldWithDates call, same start-date-only/no-departure-picker
// shape, DR-054) -- the one difference is identifying which client the
// booking is for: DR-036's findOrCreateTouristByEmail resolves-or-creates a
// login-less tourist record from the staff-typed email, same as this
// codebase's existing staff booking actions already did.
export async function createStaffPackageBookingAction(packageId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('booking.create');
  requireNewBookingAccess(ctx.roles);

  const email = String(formData.get('email') ?? '').trim();
  const client = await authService.findOrCreateTouristByEmail(ctx, email);

  const input = CreateBookingWithDatesInput.parse({
    packageId,
    startDate: String(formData.get('startDate') ?? ''),
    seats: Number(formData.get('seats')),
    touristUserId: client.id,
    specialRequests: optionalString(formData, 'specialRequests'),
  });
  const booking = await bookingService.createHoldWithDates(ctx, input);
  redirect(`/staff/bookings/${booking.id}`);
}

export type CreateStaffTailorMadeResult = { bookingId: string } | { error: string };

export interface CreateStaffTailorMadePayload {
  countries: string[];
  customTravelStart: string;
  customTravelEnd: string;
  seats: number;
  preferredTags: string[];
  preferredSites: string[];
  customDescription?: string;
  preferredAddons?: string[];
  countryOfResidence?: string;
  citizenship?: string;
  specialRequests?: string;
  firstName: string;
  lastName: string;
  email: string;
}

// Mirrors (guest)/plan-my-trip's own createPlanMyTripRequestAction --
// identical CreateTailorMadeInput shape/validation, same
// bookingService.createTailorMadeRequest call (so the same confirmation
// email/SMS fire, DR-055/056). Two real differences: (1) no anonymous-
// session dance -- ctx is already a real staff session; (2) the wizard's
// own `email` field doubles as the staff lookup key (DR-036's
// findOrCreateTouristByEmail) instead of just a booking-scoped contact
// field, so no separate "which client" field is needed at all. Returns a
// result rather than calling redirect() -- invoked from a plain client
// button handler (the wizard's own multi-step state), not a <form action>.
export async function createStaffTailorMadeBookingAction(
  payload: CreateStaffTailorMadePayload,
): Promise<CreateStaffTailorMadeResult> {
  // Outside the try/catch deliberately -- both of these can call Next's
  // redirect() (unauthenticated session, or wrong role), which throws a
  // special signal that must propagate, not get swallowed as an "error"
  // result by the catch block below.
  const ctx = await requireStaffContext('booking.create');
  requireNewBookingAccess(ctx.roles);

  const traceId = newTraceId();
  try {
    const client = await authService.findOrCreateTouristByEmail(ctx, payload.email.trim());

    const input = CreateTailorMadeInput.parse({
      countries: payload.countries.map((c) => c.trim().toUpperCase()),
      customTravelStart: payload.customTravelStart,
      customTravelEnd: payload.customTravelEnd,
      seats: payload.seats,
      customDescription: payload.customDescription?.trim() || undefined,
      specialRequests: payload.specialRequests?.trim() || undefined,
      preferredTags: payload.preferredTags,
      preferredSites: payload.preferredSites,
      touristUserId: client.id,
      email: payload.email.trim(),
      firstName: payload.firstName.trim(),
      lastName: payload.lastName.trim(),
      preferredAddons: payload.preferredAddons,
      countryOfResidence: payload.countryOfResidence?.trim().toUpperCase() || undefined,
      citizenship: payload.citizenship?.trim().toUpperCase() || undefined,
    });
    const booking = await bookingService.createTailorMadeRequest(ctx, input);
    return { bookingId: booking.id };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.detail ?? err.title };
    }
    logger(traceId).error('staff tailor-made booking failed unexpectedly', {
      message: err instanceof Error ? err.message : String(err),
    });
    return { error: 'Something went wrong creating this request -- please try again.' };
  }
}
