'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import {
  cmsService,
  CreateCmsFaqEntryInput,
  UpdateCmsFaqEntryInput,
  UpdateCmsMediaItemInput,
  UpdateCmsTextBlockInput,
  type CmsLocale,
  type CmsMediaType,
} from '@modules/cms';

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

// -------------------------------------------------------- Home hero (DR-163)
const HOME_HERO_PAGE = 'home-hero';

function heroTextKey(slotKey: string): string {
  return `${HOME_HERO_PAGE}.${slotKey}`;
}

/** Creates a bare slide (no media, no text yet) at the end of the current
 * order -- every slide (new or existing) shares the same edit card in the
 * admin UI, so "add" just inserts a blank one rather than needing its own
 * differently-shaped creation form. */
export async function createHeroSlideAction(): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const existing = await cmsService.listMediaItems(ctx, HOME_HERO_PAGE);
  const nextSortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
  await cmsService.createMediaItem(ctx, HOME_HERO_PAGE, { sortOrder: nextSortOrder });
  revalidatePath('/staff/cms');
  revalidatePath('/');
}

export async function updateHeroSlideTextAction(slotKey: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const locale = localeFromForm(formData);
  const input = UpdateCmsTextBlockInput.parse({
    key: heroTextKey(slotKey),
    locale,
    title: String(formData.get('headline') ?? ''),
    body: String(formData.get('lede') ?? ''),
    eyebrow: String(formData.get('eyebrow') ?? '') || null,
  });
  await cmsService.updateTextBlock(ctx, input);
  revalidatePath('/staff/cms');
  revalidatePath('/');
}

export async function updateHeroSlideMetaAction(slotKey: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const input = UpdateCmsMediaItemInput.parse({
    overlayGradient: String(formData.get('overlayGradient') ?? '') || null,
    sortOrder: Number(formData.get('sortOrder') ?? 0),
  });
  await cmsService.updateMediaItem(ctx, HOME_HERO_PAGE, slotKey, input);
  revalidatePath('/staff/cms');
  revalidatePath('/');
}

export async function deleteHeroSlideAction(slotKey: string): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  await cmsService.deleteMediaItem(ctx, HOME_HERO_PAGE, slotKey);
  revalidatePath('/staff/cms');
  revalidatePath('/');
}

/** Image path only -- small enough to proxy through this Server Action
 * (server-side sharp compression, same as uploadCmsImageAction above), just
 * returning the url instead of redirecting since it's called directly from
 * the client media-picker component, not a plain <form action>. */
export async function uploadHeroSlideImageAction(formData: FormData): Promise<{ url: string }> {
  const ctx = await requireStaffContext('cms.write');
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('No file provided');
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  return cmsService.uploadImage(ctx, { contentType: file.type, sizeBytes: file.size, bytes });
}

/** Video path: the file itself already reached Vercel Blob directly from
 * the browser (bypassing this server entirely, DR-163) by the time this is
 * called -- this just persists the resulting url against the slide. Also
 * covers the image path's final "attach to slide" step, after
 * uploadHeroSlideImageAction has already produced a compressed url. */
export async function setHeroSlideMediaAction(slotKey: string, mediaType: CmsMediaType, url: string): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const input = UpdateCmsMediaItemInput.parse({ mediaType, url });
  await cmsService.updateMediaItem(ctx, HOME_HERO_PAGE, slotKey, input);
  revalidatePath('/staff/cms');
  revalidatePath('/');
}
