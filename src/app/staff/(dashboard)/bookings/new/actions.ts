'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { bookingService, CreateBookingInput, CreateTailorMadeInput } from '@modules/booking';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// DR-036: clients never sign up (DR-016) -- staff just type the client's (or,
// for a group, the tour lead's) email, and the system resolves-or-creates a
// login-less tourist record behind the scenes. No account, no signup gate.
export async function createBookingForClientAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('booking.create');
  const departureId = String(formData.get('departureId'));
  const email = String(formData.get('email')).trim();

  const client = await authService.findOrCreateTouristByEmail(ctx, email);

  const input = CreateBookingInput.parse({
    departureId,
    seats: Number(formData.get('seats')),
    touristUserId: client.id,
    specialRequests: optionalString(formData, 'specialRequests'),
  });
  const booking = await bookingService.createHold(ctx, input);
  redirect(`/staff/bookings/${booking.id}`);
}

// Same no-account-needed behavior as createBookingForClientAction.
export async function createTailorMadeBookingAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('booking.create');
  const email = String(formData.get('email')).trim();

  const client = await authService.findOrCreateTouristByEmail(ctx, email);

  const input = CreateTailorMadeInput.parse({
    customCountry: String(formData.get('customCountry')).trim().toUpperCase(),
    customTravelStart: String(formData.get('customTravelStart')),
    customTravelEnd: String(formData.get('customTravelEnd')),
    seats: Number(formData.get('seats')),
    customDescription: String(formData.get('customDescription')),
    touristUserId: client.id,
    specialRequests: optionalString(formData, 'specialRequests'),
  });
  const booking = await bookingService.createTailorMadeRequest(ctx, input);
  redirect(`/staff/bookings/${booking.id}`);
}
