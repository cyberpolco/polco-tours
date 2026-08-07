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

// dayNumber is no longer a form field -- the service computes it from
// `date` relative to the trip's own start date (DR-083).
export async function addDayAction(itineraryId: string, formData: FormData) {
  const ctx = await requireStaffContext('itinerary.write');
  const input = AddItineraryDayInput.parse({
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
    hotelId: emptyToUndefined(formData.get('hotelId')),
    restaurantId: emptyToUndefined(formData.get('restaurantId')),
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
    hotelId: emptyToUndefined(formData.get('hotelId')),
    restaurantId: emptyToUndefined(formData.get('restaurantId')),
  });
  await itineraryService.updateDay(ctx, itineraryId, dayId, input);
  revalidatePath(`/staff/itineraries/${itineraryId}`);
}

export async function removeDayAction(itineraryId: string, dayId: string) {
  const ctx = await requireStaffContext('itinerary.write');
  await itineraryService.removeDay(ctx, itineraryId, dayId);
  revalidatePath(`/staff/itineraries/${itineraryId}`);
}
