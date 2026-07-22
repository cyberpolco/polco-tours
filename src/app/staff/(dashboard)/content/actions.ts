'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { contentService, CreateFaqEntryInput, UpdateFaqEntryInput, UpdateSiteContentInput, type ContentLocale } from '@modules/content';

function localeFromForm(formData: FormData): ContentLocale {
  return formData.get('locale') === 'fr' ? 'fr' : 'en';
}

export async function updateSiteContentAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('content.write');
  const locale = localeFromForm(formData);
  const input = UpdateSiteContentInput.parse({
    key: 'about',
    locale,
    title: String(formData.get('title') ?? ''),
    body: String(formData.get('body') ?? ''),
  });
  await contentService.updateSiteContent(ctx, input);
  revalidatePath('/staff/content');
  revalidatePath('/about');
}

export async function createFaqEntryAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('content.write');
  const input = CreateFaqEntryInput.parse({
    question: String(formData.get('question') ?? ''),
    answer: String(formData.get('answer') ?? ''),
    locale: localeFromForm(formData),
    sortOrder: Number(formData.get('sortOrder') ?? 0),
  });
  await contentService.createFaqEntry(ctx, input);
  revalidatePath('/staff/content');
  revalidatePath('/faq');
}

export async function updateFaqEntryAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('content.write');
  const input = UpdateFaqEntryInput.parse({
    question: String(formData.get('question') ?? ''),
    answer: String(formData.get('answer') ?? ''),
    sortOrder: Number(formData.get('sortOrder') ?? 0),
  });
  await contentService.updateFaqEntry(ctx, id, input);
  revalidatePath('/staff/content');
  revalidatePath('/faq');
}

export async function deleteFaqEntryAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('content.write');
  await contentService.deleteFaqEntry(ctx, id);
  revalidatePath('/staff/content');
  revalidatePath('/faq');
}

// Not wired to any specific page in v1 (no licensed photography exists yet,
// OI-12) -- a SUPERADMIN uploads and gets a public URL back to use manually
// wherever it's needed. Result carried via a redirect query param, same
// "redirect with ?error=/?ok=" convention fleet's document-upload actions
// already use, rather than a client-side fetch to a new route.
export async function uploadContentImageAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('content.write');
  const locale = localeFromForm(formData);
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/staff/content?locale=${locale}&error=missing_file`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const { url } = await contentService.uploadImage(ctx, { contentType: file.type, sizeBytes: file.size, bytes });
  redirect(`/staff/content?locale=${locale}&uploadedUrl=${encodeURIComponent(url)}`);
}
