'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ContactTravelerInput, DecideVisaInput, UpdateDocumentStatusInput, visaService } from '@modules/visa';

export async function contactTravelerAction(bookingId: string, travelerId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('visa.process');
  const input = ContactTravelerInput.parse({ message: String(formData.get('message') ?? '') });
  await visaService.contactTraveler(ctx, bookingId, travelerId, input);
  revalidatePath('/staff/visa-queue');
}

// DR-060: manually starts an application for a row in the "Needs
// application" reconciliation section -- the same visaService.submitApplication
// that already existed but, before this DR, had no UI anywhere calling it.
export async function startApplicationAction(bookingId: string, travelerId: string): Promise<void> {
  const ctx = await requireStaffContext('visa.process');
  await visaService.submitApplication(ctx, bookingId, travelerId);
  revalidatePath('/staff/visa-queue');
}

// DR-154 (explicit user request): closes the "decide/resubmit/upload stay
// API-only" gap this page's own header comment used to document -- staff can
// now approve/reject an application directly from the table.
export async function decideApplicationAction(bookingId: string, travelerId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('visa.process');
  const rawReason = String(formData.get('reason') ?? '').trim();
  const input = DecideVisaInput.parse({
    outcome: String(formData.get('outcome') ?? ''),
    reason: rawReason ? rawReason : undefined,
  });
  await visaService.decideApplication(ctx, bookingId, travelerId, input);
  revalidatePath('/staff/visa-queue');
}

// DR-154: uploads the granted visa document once an application is decided --
// same file-upload shape as bookings/[bookingId]/passport/actions.ts.
export async function uploadVisaDocumentAction(bookingId: string, travelerId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('visa.process');
  const file = formData.get('document');
  if (!(file instanceof File) || file.size === 0) {
    redirect('/staff/visa-queue?error=missing_file');
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  await visaService.uploadDocument(ctx, bookingId, travelerId, {
    contentType: file.type,
    sizeBytes: file.size,
    bytes,
    fileName: file.name,
  });
  revalidatePath('/staff/visa-queue');
}

// DR-210 (explicit user request): a facilitator's manual Missing/Received/
// Not required toggle for the granted visa document, independent of
// whether a real file has actually been uploaded.
export async function updateDocumentStatusAction(bookingId: string, travelerId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('visa.process');
  const input = UpdateDocumentStatusInput.parse({ status: String(formData.get('status') ?? '') });
  await visaService.updateDocumentStatus(ctx, bookingId, travelerId, input);
  revalidatePath('/staff/visa-queue');
}

// DR-184: marks the destination country's government fee (distinct from the
// guest-facing VISA_ASSISTANCE add-on charge) as requested from the
// traveler -- a status flag only, no Payment/Invoice, no notification.
export async function requestFeePaymentAction(bookingId: string, travelerId: string): Promise<void> {
  const ctx = await requireStaffContext('visa.process');
  await visaService.requestFeePayment(ctx, bookingId, travelerId);
  revalidatePath('/staff/visa-queue');
}

// DR-184: marks that fee as collected.
export async function markFeePaidAction(bookingId: string, travelerId: string): Promise<void> {
  const ctx = await requireStaffContext('visa.process');
  await visaService.markFeePaid(ctx, bookingId, travelerId);
  revalidatePath('/staff/visa-queue');
}

// DR-151 (explicit user request): SUPERADMIN-only genuine delete of an
// individual visa application. requireStaffContext('visa.delete') redirects
// to /staff/forbidden for anyone else -- visa.delete is never seeded to any
// role, so only SUPERADMIN's hardcoded wildcard ever passes this gate.
export async function deleteApplicationAction(applicationId: string): Promise<void> {
  const ctx = await requireStaffContext('visa.delete');
  await visaService.deleteApplication(ctx, applicationId);
  revalidatePath('/staff/visa-queue');
}
