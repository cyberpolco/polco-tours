'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import {
  cmsService,
  CMS_SOCIAL_PLATFORMS,
  CreateCmsFaqEntryInput,
  CreateCmsOperatingCountryInput,
  UpdateCmsFaqEntryInput,
  UpdateCmsMediaItemInput,
  UpdateCmsOperatingCountryInput,
  UpdateCmsTextBlockInput,
  type CmsLocale,
  type CmsMediaType,
} from '@modules/cms';

function localeFromForm(formData: FormData): CmsLocale {
  return formData.get('locale') === 'fr' ? 'fr' : 'en';
}

// Guest path to revalidate per CmsTextBlock key / CmsMediaItem page, for
// the generic page-intro editor and media picker below -- every entry here
// is a full CmsTextBlock `key` (not just a page-name prefix), since
// Contact's two office blocks share the /contact page with Contact's own
// intro key.
const GUEST_PATH_BY_TEXT_KEY: Record<string, string> = {
  packages: '/packages',
  'plan-my-trip': '/plan-my-trip',
  'find-booking': '/find-booking',
  contact: '/contact',
  'contact.office.namibia': '/contact',
  'contact.office.drc': '/contact',
  'contact.general': '/contact',
  rate: '/rate',
  weather: '/weather',
  terms: '/terms',
  'home-map': '/',
  gallery: '/gallery',
};

const GUEST_PATHS_BY_MEDIA_PAGE: Record<string, string[]> = {
  'home-hero': ['/'],
  // Gallery sites are also the single source of truth for the plan-my-trip
  // wizard's "sites to visit" step (DR-167), guest and staff both.
  gallery: ['/gallery', '/plan-my-trip', '/staff/bookings/new'],
  partners: ['/'],
};

function revalidateMediaPage(page: string): void {
  if (page === 'social-links') {
    // The footer renders on every guest page via the shared (guest)
    // layout (DR-200) -- 'layout' revalidates every route sharing that
    // layout, not just '/' the way a single-page section's revalidatePath
    // call above does.
    revalidatePath('/', 'layout');
    return;
  }
  for (const path of GUEST_PATHS_BY_MEDIA_PAGE[page] ?? []) revalidatePath(path);
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

/** Generic page-intro editor (eyebrow/title/body) reused across every
 * "thin" guest page (Packages, Plan my trip, Find booking, Contact incl.
 * its two office blocks, Rate, Weather, Terms) -- one action for all of
 * them, keyed by the CmsTextBlock `key` itself, same as `updateTextBlockAction`
 * above but not hardcoded to 'about'. */
export async function updatePageTextAction(key: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const locale = localeFromForm(formData);
  const input = UpdateCmsTextBlockInput.parse({
    key,
    locale,
    title: String(formData.get('title') ?? ''),
    body: String(formData.get('body') ?? ''),
    eyebrow: String(formData.get('eyebrow') ?? '') || null,
  });
  await cmsService.updateTextBlock(ctx, input);
  revalidatePath('/staff/cms');
  const guestPath = GUEST_PATH_BY_TEXT_KEY[key];
  if (guestPath) revalidatePath(guestPath);
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
 * the client MediaPicker component, not a plain <form action>. Page-agnostic
 * (originally hero-slide-only; generalized so Gallery reuses it too). */
export async function uploadMediaImageAction(formData: FormData): Promise<{ url: string }> {
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
 * called -- this just persists the resulting url against the (page, slotKey)
 * slot. Also covers the image path's final "attach" step, after
 * uploadMediaImageAction has already produced a compressed url. Generalized
 * from the original Home-hero-only setHeroSlideMediaAction so Gallery can
 * reuse the same MediaPicker under a different `page`. */
export async function setMediaItemAction(page: string, slotKey: string, mediaType: CmsMediaType, url: string): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const input = UpdateCmsMediaItemInput.parse({ mediaType, url });
  await cmsService.updateMediaItem(ctx, page, slotKey, input);
  revalidatePath('/staff/cms');
  revalidateMediaPage(page);
}

// ----------------------------------------------------------- Gallery (DR-167)
const GALLERY_PAGE = 'gallery';

/** Creates a bare site (no name/country/media yet) at the end of the
 * current order -- every site (new or existing) shares the same edit card
 * in the admin UI, same "add blank, edit in place" convention as
 * createHeroSlideAction. A blank site is filtered out of every guest-facing
 * read (Gallery, both plan-my-trip pickers) until staff sets a name+country. */
export async function createGallerySiteAction(): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const existing = await cmsService.listMediaItems(ctx, GALLERY_PAGE);
  const nextSortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
  await cmsService.createMediaItem(ctx, GALLERY_PAGE, { sortOrder: nextSortOrder });
  revalidatePath('/staff/cms');
  revalidateMediaPage(GALLERY_PAGE);
}

/** name + country + description + sortOrder in one form -- a gallery site
 * is fully described by CmsMediaItem alone (DR-167), no paired CmsTextBlock
 * the way Home hero slides need (a site only has 2 text fields, and
 * `description` already lives on CmsMediaItem). */
export async function updateGallerySiteAction(slotKey: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const input = UpdateCmsMediaItemInput.parse({
    name: String(formData.get('name') ?? '') || null,
    country: String(formData.get('country') ?? '') || null,
    description: String(formData.get('description') ?? '') || null,
    sortOrder: Number(formData.get('sortOrder') ?? 0),
  });
  await cmsService.updateMediaItem(ctx, GALLERY_PAGE, slotKey, input);
  revalidatePath('/staff/cms');
  revalidateMediaPage(GALLERY_PAGE);
}

export async function deleteGallerySiteAction(slotKey: string): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  await cmsService.deleteMediaItem(ctx, GALLERY_PAGE, slotKey);
  revalidatePath('/staff/cms');
  revalidateMediaPage(GALLERY_PAGE);
}

// ---------------------------------------------------------- Partners (DR-185)
const PARTNERS_PAGE = 'partners';

/** Creates a bare partner (no name/logo yet) at the end of the current
 * order -- same "add blank, edit in place" convention as
 * createHeroSlideAction/createGallerySiteAction. A blank partner is filtered
 * out of the homepage read until staff sets a name. */
export async function createPartnerAction(): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const existing = await cmsService.listMediaItems(ctx, PARTNERS_PAGE);
  const nextSortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
  await cmsService.createMediaItem(ctx, PARTNERS_PAGE, { sortOrder: nextSortOrder });
  revalidatePath('/staff/cms');
  revalidateMediaPage(PARTNERS_PAGE);
}

/** name + sortOrder only -- a partner has no country/description fields,
 * unlike a gallery site (DR-167); the logo itself is set separately via
 * MediaPicker/setMediaItemAction, same as every other CmsMediaItem page. */
export async function updatePartnerAction(slotKey: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const input = UpdateCmsMediaItemInput.parse({
    name: String(formData.get('name') ?? '') || null,
    sortOrder: Number(formData.get('sortOrder') ?? 0),
  });
  await cmsService.updateMediaItem(ctx, PARTNERS_PAGE, slotKey, input);
  revalidatePath('/staff/cms');
  revalidateMediaPage(PARTNERS_PAGE);
}

export async function deletePartnerAction(slotKey: string): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  await cmsService.deleteMediaItem(ctx, PARTNERS_PAGE, slotKey);
  revalidatePath('/staff/cms');
  revalidateMediaPage(PARTNERS_PAGE);
}

// ------------------------------------------------------- Social links (DR-200)
const SOCIAL_LINKS_PAGE = 'social-links';

/** Creates a bare social link (no platform/URL yet) at the end of the
 * current order -- same "add blank, edit in place" convention as
 * createPartnerAction/createGallerySiteAction. Filtered out of the footer
 * read until staff sets both a platform and a URL. */
export async function createSocialLinkAction(): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const existing = await cmsService.listMediaItems(ctx, SOCIAL_LINKS_PAGE);
  const nextSortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
  await cmsService.createMediaItem(ctx, SOCIAL_LINKS_PAGE, { sortOrder: nextSortOrder });
  revalidatePath('/staff/cms');
  revalidateMediaPage(SOCIAL_LINKS_PAGE);
}

/** platform + url + sortOrder only -- no image/logo upload, unlike every
 * other CmsMediaItem page, since the icon is a fixed hand-drawn SVG keyed
 * off `platform` (src/app/(guest)/footer.tsx), not staff-supplied media. */
export async function updateSocialLinkAction(slotKey: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const rawPlatform = String(formData.get('platform') ?? '');
  const rawUrl = String(formData.get('url') ?? '').trim();
  const input = UpdateCmsMediaItemInput.parse({
    platform: (CMS_SOCIAL_PLATFORMS as readonly string[]).includes(rawPlatform) ? rawPlatform : null,
    url: rawUrl || null,
    sortOrder: Number(formData.get('sortOrder') ?? 0),
  });
  await cmsService.updateMediaItem(ctx, SOCIAL_LINKS_PAGE, slotKey, input);
  revalidatePath('/staff/cms');
  revalidateMediaPage(SOCIAL_LINKS_PAGE);
}

// ---------------------------------------------- Home map countries (DR-202)
// "Where we operate": which African countries get highlighted/interactive
// on the homepage map, plus their hover-tooltip snapshot facts. Unlike
// partners/social-links' "add blank, edit in place" convention, a country
// row's identity (countryCode) is chosen up front from a dropdown of every
// not-yet-added African country -- there's nothing meaningful to add blank.
export async function createOperatingCountryAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const existing = await cmsService.listOperatingCountries(ctx);
  const nextSortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
  const input = CreateCmsOperatingCountryInput.parse({
    countryCode: String(formData.get('countryCode') ?? ''),
    sortOrder: nextSortOrder,
  });
  await cmsService.createOperatingCountry(ctx, input);
  revalidatePath('/staff/cms');
  revalidatePath('/');
}

export async function updateOperatingCountryAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const input = UpdateCmsOperatingCountryInput.parse({
    capital: String(formData.get('capital') ?? ''),
    languages: String(formData.get('languages') ?? ''),
    currency: String(formData.get('currency') ?? ''),
    population: String(formData.get('population') ?? ''),
    areaKm2: String(formData.get('areaKm2') ?? ''),
    sortOrder: Number(formData.get('sortOrder') ?? 0),
  });
  await cmsService.updateOperatingCountry(ctx, id, input);
  revalidatePath('/staff/cms');
  revalidatePath('/');
}

export async function deleteOperatingCountryAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  await cmsService.deleteOperatingCountry(ctx, id);
  revalidatePath('/staff/cms');
  revalidatePath('/');
}

export async function deleteSocialLinkAction(slotKey: string): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  await cmsService.deleteMediaItem(ctx, SOCIAL_LINKS_PAGE, slotKey);
  revalidatePath('/staff/cms');
  revalidateMediaPage(SOCIAL_LINKS_PAGE);
}
