'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaffContext } from '@lib/staff-guard';
import {
  cmsService,
  CMS_ABOUT_SECTIONS,
  CMS_SOCIAL_PLATFORMS,
  CreateCmsAboutEntryInput,
  CreateCmsFaqEntryInput,
  CreateCmsOperatingCountryInput,
  UpdateCmsAboutEntryInput,
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
  // DR-256 split /about from one flat `about` key into nine section keys.
  about: '/about',
  'about.stats': '/about',
  'about.story': '/about',
  'about.md': '/about',
  'about.md.person': '/about',
  'about.vm': '/about',
  'about.vision': '/about',
  'about.mission': '/about',
  'about.values': '/about',
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
  'about-md': ['/about'],
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

/** Generic page-intro editor (eyebrow/title/body) reused across every
 * "thin" guest page (About incl. its nine section blocks since DR-256,
 * Packages, Plan my trip, Find booking, Contact incl. its two office
 * blocks, Rate, Weather, Terms) -- one action for all of them, keyed by the
 * CmsTextBlock `key` itself. Replaced the old `updateTextBlockAction`,
 * which was the same thing hardcoded to the single flat 'about' key and
 * had no eyebrow field. */
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

// ------------------------------------------------------ About lists (DR-256)
// The /about page's stats/timeline/values rows. `section` arrives as a bound
// argument rather than a form field, but is still parsed rather than trusted
// -- it reaches the DB as a plain string column, so a bad value would create
// rows in a section that no page ever reads.
const AboutSection = z.enum(CMS_ABOUT_SECTIONS);

/** Optional numeric fields come back from FormData as '' when left blank;
 * Number('') is 0, which would silently write a real zero. */
function optionalNumber(formData: FormData, field: string): number | null {
  const raw = String(formData.get(field) ?? '').trim();
  return raw === '' ? null : Number(raw);
}

function optionalText(formData: FormData, field: string): string | null {
  return String(formData.get(field) ?? '').trim() || null;
}

export async function createAboutEntryAction(section: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const parsedSection = AboutSection.parse(section);
  const existing = await cmsService.listAboutEntries(ctx, parsedSection, localeFromForm(formData));
  const nextSortOrder = existing.reduce((max, entry) => Math.max(max, entry.sortOrder), -1) + 1;
  const input = CreateCmsAboutEntryInput.parse({
    heading: String(formData.get('heading') ?? ''),
    body: optionalText(formData, 'body'),
    marker: optionalText(formData, 'marker'),
    numericValue: optionalNumber(formData, 'numericValue'),
    prefix: optionalText(formData, 'prefix'),
    suffix: optionalText(formData, 'suffix'),
    animate: formData.get('animate') !== null,
    sortOrder: nextSortOrder,
  });
  await cmsService.createAboutEntry(ctx, parsedSection, input);
  revalidatePath('/staff/cms');
  revalidatePath('/about');
}

export async function updateAboutEntryAction(section: string, slotKey: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const parsedSection = AboutSection.parse(section);
  const input = UpdateCmsAboutEntryInput.parse({
    heading: String(formData.get('heading') ?? ''),
    body: optionalText(formData, 'body'),
    marker: optionalText(formData, 'marker'),
    numericValue: optionalNumber(formData, 'numericValue'),
    prefix: optionalText(formData, 'prefix'),
    suffix: optionalText(formData, 'suffix'),
    // An unchecked checkbox submits nothing at all, so its absence is the
    // 'off' signal -- there is no false value to read.
    animate: formData.get('animate') !== null,
    sortOrder: Number(formData.get('sortOrder') ?? 0),
  });
  await cmsService.updateAboutEntry(ctx, parsedSection, localeFromForm(formData), slotKey, input);
  revalidatePath('/staff/cms');
  revalidatePath('/about');
}

export async function deleteAboutEntryAction(section: string, slotKey: string): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  await cmsService.deleteAboutEntry(ctx, AboutSection.parse(section), slotKey);
  revalidatePath('/staff/cms');
  revalidatePath('/about');
}

// The Managing Director portrait -- a single CmsMediaItem rather than a list,
// but it still needs a row to exist before MediaPicker's setMediaItemAction
// can attach a url to it, hence the same "add the empty slot first, then
// upload into it" two-step every other media page uses.
const ABOUT_MD_PAGE = 'about-md';

export async function createAboutMdPhotoSlotAction(): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const existing = await cmsService.listMediaItems(ctx, ABOUT_MD_PAGE);
  if (existing.length > 0) return;
  await cmsService.createMediaItem(ctx, ABOUT_MD_PAGE, { sortOrder: 0 });
  revalidatePath('/staff/cms');
  revalidateMediaPage(ABOUT_MD_PAGE);
}

export async function deleteAboutMdPhotoAction(slotKey: string): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  await cmsService.deleteMediaItem(ctx, ABOUT_MD_PAGE, slotKey);
  revalidatePath('/staff/cms');
  revalidateMediaPage(ABOUT_MD_PAGE);
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
 * (server-side sharp compression), returning the url directly since it's
 * called from the client MediaPicker component, not a plain <form action>.
 * Page-agnostic (originally hero-slide-only; generalized so Gallery reuses
 * it too). */
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
    // DR-254: staff-editable shareable-link id. Lowercased so a staff typo
    // like "Masai-Mara" doesn't fail SLUG_PATTERN's lowercase-only check.
    slug: String(formData.get('slug') ?? '').trim().toLowerCase() || null,
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

// ----------------------------------------------------- Footer legal (DR-204,
// whole-line template since DR-214)
// The footer's closing "© {year} Mufasa Safaris & Tours, a Cyber PolCo
// Product." line is now a fully staff-editable template (explicit user
// request to make "everything under Footer legal line" editable, including
// the previously-hardcoded year/brand text) -- reuses the CmsTextBlock
// (key='footer.legal') PageTextEditor shape: `eyebrow` holds the line
// template (with the two live placeholders `{year}`/`{link}`,
// footer.tsx's renderFooterLegalLine substitutes both at render time so the
// year itself is never stored/frozen), `title` holds the link label, `body`
// holds its href -- rather than a dedicated table, same "no schema change
// needed" reasoning as reusing CmsMediaItem.url elsewhere. Its own action
// (not the generic updatePageTextAction) so body gets real server-side URL
// validation (charter rule 1 -- never trust the form's client-side
// `type="url"` alone) and the template is guaranteed to actually render its
// link.
const FOOTER_LEGAL_KEY = 'footer.legal';
const FooterLegalUrl = z.string().trim().url().max(300);
const FooterLegalTemplate = z
  .string()
  .max(100)
  .refine((value) => value.includes('{link}'), 'Template must include {link}');

export async function updateFooterLegalAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('cms.write');
  const locale = localeFromForm(formData);
  // Blank template -> null, so footer.tsx's own FALLBACK_FOOTER_LEGAL_TEMPLATE
  // keeps rendering (same "degrade to the default" convention as leaving
  // title/body unset) rather than forcing every install to type the default
  // sentence back in verbatim.
  const rawTemplate = String(formData.get('eyebrow') ?? '').trim();
  const input = UpdateCmsTextBlockInput.parse({
    key: FOOTER_LEGAL_KEY,
    locale,
    title: String(formData.get('title') ?? ''),
    body: FooterLegalUrl.parse(String(formData.get('body') ?? '')),
    eyebrow: rawTemplate === '' ? null : FooterLegalTemplate.parse(rawTemplate),
  });
  await cmsService.updateTextBlock(ctx, input);
  revalidatePath('/staff/cms');
  // The footer renders on every guest page via the shared (guest) layout
  // (same reasoning as social-links' revalidateMediaPage special case
  // above) -- 'layout' revalidates every route sharing it, not just one path.
  revalidatePath('/', 'layout');
}
