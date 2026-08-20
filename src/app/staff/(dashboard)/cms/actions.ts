'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { cmsService, CreateCmsFaqEntryInput, UpdateCmsFaqEntryInput, UpdateCmsTextBlockInput, type CmsLocale } from '@modules/cms';

function localeFromForm(formData: FormData): CmsLocale {
  return formData.get('locale') === 'fr' ? 'fr' : 'en';
}

export async function updateTextBlockAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const locale = localeFromForm(formData);
  const input = UpdateCmsTextBlockInput.parse({
    key: 'about',
    locale,
    title: String(formData.get('title') ?? ''),
    body: String(formData.get('body') ?? ''),
  });
  await cmsService.updateTextBlock(ctx, input);
  revalidatePath('/staff/cms');
  revalidatePath('/about');
}

export async function createFaqEntryAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const input = CreateCmsFaqEntryInput.parse({
    question: String(formData.get('question') ?? ''),
    answer: String(formData.get('answer') ?? ''),
    locale: localeFromForm(formData),
    sortOrder: Number(formData.get('sortOrder') ?? 0),
  });
  await cmsService.createFaqEntry(ctx, input);
  revalidatePath('/staff/cms');
  revalidatePath('/faq');
}

export async function updateFaqEntryAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const input = UpdateCmsFaqEntryInput.parse({
    question: String(formData.get('question') ?? ''),
    answer: String(formData.get('answer') ?? ''),
    sortOrder: Number(formData.get('sortOrder') ?? 0),
  });
  await cmsService.updateFaqEntry(ctx, id, input);
  revalidatePath('/staff/cms');
  revalidatePath('/faq');
}

export async function deleteFaqEntryAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  await cmsService.deleteFaqEntry(ctx, id);
  revalidatePath('/staff/cms');
  revalidatePath('/faq');
}

// Not wired to any specific page in v1 (no licensed photography exists yet,
// OI-12) -- a SUPERADMIN uploads and gets a public URL back to use manually
// wherever it's needed. Result carried via a redirect query param, same
// "redirect with ?error=/?ok=" convention fleet's document-upload actions
// already use, rather than a client-side fetch to a new route.
export async function uploadCmsImageAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const locale = localeFromForm(formData);
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/staff/cms?locale=${locale}&error=missing_file`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const { url } = await cmsService.uploadImage(ctx, { contentType: file.type, sizeBytes: file.size, bytes });
  redirect(`/staff/cms?locale=${locale}&uploadedUrl=${encodeURIComponent(url)}`);
}
