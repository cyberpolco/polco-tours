'use server';

import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { AddItineraryDayInput, UpdateItineraryDayInput, UpdateItineraryInput, itineraryService } from '@modules/itinerary';

function emptyToUndefined(v: FormDataEntryValue | null): string | undefined {
  const s = v ? String(v).trim() : '';
  return s.length > 0 ? s : undefined;
}

export async function updateItineraryAction(itineraryId: string, formData: FormData) {
  const ctx = await requireStaffContext('itinerary.write');
  const input = UpdateItineraryInput.parse({
    notes: emptyToUndefined(formData.get('notes')),
    emergencyContactName: emptyToUndefined(formData.get('emergencyContactName')),
    emergencyContactPhone: emptyToUndefined(formData.get('emergencyContactPhone')),
    emergencyContactRelation: emptyToUndefined(formData.get('emergencyContactRelation')),
  });
  await itineraryService.updateItinerary(ctx, itineraryId, input);
  revalidatePath(`/staff/itineraries/${itineraryId}`);
}

export async function submitForReviewAction(itineraryId: string) {
  const ctx = await requireStaffContext('itinerary.write');
  await itineraryService.submitForReview(ctx, itineraryId);
  revalidatePath(`/staff/itineraries/${itineraryId}`);
}

export async function sendBackToDraftAction(itineraryId: string) {
  const ctx = await requireStaffContext('itinerary.write');
  await itineraryService.sendBackToDraft(ctx, itineraryId);
  revalidatePath(`/staff/itineraries/${itineraryId}`);
}

export async function approveItineraryAction(itineraryId: string) {
  const ctx = await requireStaffContext('itinerary.approve');
  await itineraryService.approveItinerary(ctx, itineraryId);
  revalidatePath(`/staff/itineraries/${itineraryId}`);
}

export async function addDayAction(itineraryId: string, formData: FormData) {
  const ctx = await requireStaffContext('itinerary.write');
  const input = AddItineraryDayInput.parse({
    dayNumber: Number(formData.get('dayNumber')),
    date: String(formData.get('date') ?? ''),
    departureTime: emptyToUndefined(formData.get('departureTime')),
    arrivalTime: emptyToUndefined(formData.get('arrivalTime')),
    pickupLocation: emptyToUndefined(formData.get('pickupLocation')),
    dropoffLocation: emptyToUndefined(formData.get('dropoffLocation')),
    plannedSites: emptyToUndefined(formData.get('plannedSites')),
    activities: emptyToUndefined(formData.get('activities')),
    estimatedTravelMinutes: formData.get('estimatedTravelMinutes')
      ? Number(formData.get('estimatedTravelMinutes'))
      : undefined,
    notes: emptyToUndefined(formData.get('notes')),
  });
  await itineraryService.addDay(ctx, itineraryId, input);
  revalidatePath(`/staff/itineraries/${itineraryId}`);
}

export async function updateDayAction(itineraryId: string, dayId: string, formData: FormData) {
  const ctx = await requireStaffContext('itinerary.write');
  const input = UpdateItineraryDayInput.parse({
    date: emptyToUndefined(formData.get('date')),
    departureTime: emptyToUndefined(formData.get('departureTime')),
    arrivalTime: emptyToUndefined(formData.get('arrivalTime')),
    pickupLocation: emptyToUndefined(formData.get('pickupLocation')),
    dropoffLocation: emptyToUndefined(formData.get('dropoffLocation')),
    plannedSites: emptyToUndefined(formData.get('plannedSites')),
    activities: emptyToUndefined(formData.get('activities')),
    estimatedTravelMinutes: formData.get('estimatedTravelMinutes')
      ? Number(formData.get('estimatedTravelMinutes'))
      : undefined,
    notes: emptyToUndefined(formData.get('notes')),
  });
  await itineraryService.updateDay(ctx, itineraryId, dayId, input);
  revalidatePath(`/staff/itineraries/${itineraryId}`);
}

export async function removeDayAction(itineraryId: string, dayId: string) {
  const ctx = await requireStaffContext('itinerary.write');
  await itineraryService.removeDay(ctx, itineraryId, dayId);
  revalidatePath(`/staff/itineraries/${itineraryId}`);
}

export async function assignHotelAction(itineraryId: string, formData: FormData) {
  const ctx = await requireStaffContext('itinerary.write');
  const hotelId = String(formData.get('hotelId') ?? '');
  if (hotelId) await itineraryService.assignHotel(ctx, itineraryId, hotelId);
  revalidatePath(`/staff/itineraries/${itineraryId}`);
}

export async function unassignHotelAction(itineraryId: string, hotelId: string) {
  const ctx = await requireStaffContext('itinerary.write');
  await itineraryService.unassignHotel(ctx, itineraryId, hotelId);
  revalidatePath(`/staff/itineraries/${itineraryId}`);
}

export async function assignRestaurantAction(itineraryId: string, formData: FormData) {
  const ctx = await requireStaffContext('itinerary.write');
  const restaurantId = String(formData.get('restaurantId') ?? '');
  if (restaurantId) await itineraryService.assignRestaurant(ctx, itineraryId, restaurantId);
  revalidatePath(`/staff/itineraries/${itineraryId}`);
}

export async function unassignRestaurantAction(itineraryId: string, restaurantId: string) {
  const ctx = await requireStaffContext('itinerary.write');
  await itineraryService.unassignRestaurant(ctx, itineraryId, restaurantId);
  revalidatePath(`/staff/itineraries/${itineraryId}`);
}
