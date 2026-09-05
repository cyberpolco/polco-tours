// cms module — domain types & rules. Pure; no framework or DB imports.
// Originally the `content` module (DR-071): staff-editable guest-site
// content (About page text + FAQ list), replacing what used to be
// hardcoded JSX/TS literals in src/app/(guest)/{about,faq}. CmsTextBlock/
// CmsFaqEntry (formerly SiteContent/FaqEntry) were added ahead of this
// module as a deliberate unused scaffold in DR-042 -- DR-071 is what
// actually built the module around them. Renamed `content` -> `cms` in
// DR-162, which also adds CmsMediaItem to prisma/schema.prisma as the
// building block later phases will use for image/video items (Home hero,
// Gallery, etc.) -- not yet given domain types/repository methods here
// since nothing calls them until that page is actually built.
import { z } from 'zod';
import { OPERATING_COUNTRY_CODES } from '@lib/country-codes';
import { AFRICA_COUNTRIES } from '@lib/africa-country-ids';

// Only the two locales the guest site itself supports (src/i18n/request.ts).
export const SUPPORTED_LOCALES = ['en', 'fr'] as const;
export type CmsLocale = (typeof SUPPORTED_LOCALES)[number];

export interface CmsTextBlockView {
  id: string;
  key: string;
  locale: CmsLocale;
  title: string;
  body: string;
  eyebrow: string | null;
  updatedAt: Date;
  updatedByUserId: string | null;
}

export const UpdateCmsTextBlockInput = z.object({
  key: z.string().min(1).max(100),
  locale: z.enum(SUPPORTED_LOCALES),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  eyebrow: z.string().max(100).nullable().optional(),
});
export type UpdateCmsTextBlockInput = z.infer<typeof UpdateCmsTextBlockInput>;

export interface CmsFaqEntryView {
  id: string;
  question: string;
  answer: string;
  locale: CmsLocale;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateCmsFaqEntryInput = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1),
  locale: z.enum(SUPPORTED_LOCALES).default('en'),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type CreateCmsFaqEntryInput = z.infer<typeof CreateCmsFaqEntryInput>;

export const UpdateCmsFaqEntryInput = z.object({
  question: z.string().min(1).max(500).optional(),
  answer: z.string().min(1).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});
export type UpdateCmsFaqEntryInput = z.infer<typeof UpdateCmsFaqEntryInput>;

// Public-image upload validation -- promoted to src/lib/public-image-blob.ts
// (DR-114) so catalog module's package-image upload shares the same
// vocabulary; re-exported here under this module's own names so nothing
// else in this module (or its tests) needs to change.
export {
  MAX_PUBLIC_IMAGE_SIZE_BYTES as MAX_CMS_IMAGE_SIZE_BYTES,
  isValidPublicImageUpload as isValidCmsImageUpload,
  publicImageExtension as cmsImageExtension,
} from '@lib/public-image-blob';

// CmsMediaItem (DR-162 schema, DR-163 first real consumer: Home hero).
// `mediaType` is a plain zod-validated string, not a Postgres enum -- a
// third type later is a code-only change (schema.prisma's own comment).
export const CMS_MEDIA_TYPES = ['image', 'video'] as const;
export type CmsMediaType = (typeof CMS_MEDIA_TYPES)[number];

// Video is a genuinely different upload path from images (direct
// browser-to-Blob, no server-side compression, DR-163) -- these are the
// Blob-side allowlist/cap the new media-upload route enforces, mirroring
// isValidCmsImageUpload/MAX_CMS_IMAGE_SIZE_BYTES's shape for images above.
export const MAX_CMS_VIDEO_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
export const CMS_VIDEO_CONTENT_TYPES = ['video/mp4', 'video/webm'] as const;

export function isValidCmsVideoContentType(contentType: string): boolean {
  return (CMS_VIDEO_CONTENT_TYPES as readonly string[]).includes(contentType);
}

// `name`/`country` (DR-167) are gallery-site-only fields -- null/unused for
// Home hero's 'home-hero' page rows. `country` is validated against the
// same OPERATING_COUNTRY_CODES the rest of the app already uses (packages,
// country regulations, etc.), not a fresh vocabulary.
export const GALLERY_COUNTRY_CODES = OPERATING_COUNTRY_CODES;

// A gallery site's shareable-link identifier (DR-254) -- staff-editable,
// distinct from the server-generated `slotKey`. Lowercase letters/digits
// with single hyphens between words (no leading/trailing/double hyphens),
// same shape as a typical URL slug elsewhere on the web.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(SLUG_PATTERN, 'Use lowercase letters, numbers, and single hyphens only (e.g. "masai-mara")')
  .nullable()
  .optional();

// Social links only (DR-200, page='social-links') -- a fixed, closed set
// matching the hand-drawn SVG icons the guest footer already knows how to
// render (src/app/(guest)/footer.tsx). Adding a 6th platform is a code
// change (new icon path + enum entry), same "no Postgres enum" convention
// as `mediaType`/`country` above -- not staff-configurable free text.
export const CMS_SOCIAL_PLATFORMS = ['facebook', 'instagram', 'x', 'whatsapp', 'tiktok'] as const;
export type CmsSocialPlatform = (typeof CMS_SOCIAL_PLATFORMS)[number];

// Display labels are proper nouns (brand names), not translated -- same
// convention as Role/permission-slug values elsewhere in the app. Shared
// by the staff platform dropdown and the guest footer's icon aria-label so
// the two never drift.
export const CMS_SOCIAL_PLATFORM_LABELS: Record<CmsSocialPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X',
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
};

// `mediaType`/`url` are nullable -- a freshly-added slide/site (dynamic
// add/remove, DR-163/167) can have its text filled in with no media chosen
// yet; `page`/`slotKey` are supplied as repository/service function
// arguments, not part of this input, since callers never choose their own
// slotKey (server-generated) and always operate within one known page.
export interface CmsMediaItemView {
  id: string;
  page: string;
  slotKey: string;
  mediaType: CmsMediaType | null;
  url: string | null;
  description: string | null;
  overlayGradient: string | null;
  name: string | null;
  country: string | null;
  platform: CmsSocialPlatform | null;
  slug: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  updatedByUserId: string | null;
}

export const CreateCmsMediaItemInput = z.object({
  mediaType: z.enum(CMS_MEDIA_TYPES).nullable().optional(),
  url: z.string().url().nullable().optional(),
  description: z.string().max(300).nullable().optional(),
  overlayGradient: z.string().max(500).nullable().optional(),
  name: z.string().min(1).max(200).nullable().optional(),
  country: z.enum(GALLERY_COUNTRY_CODES).nullable().optional(),
  platform: z.enum(CMS_SOCIAL_PLATFORMS).nullable().optional(),
  slug: slugSchema,
  sortOrder: z.number().int().nonnegative().default(0),
});
export type CreateCmsMediaItemInput = z.infer<typeof CreateCmsMediaItemInput>;

export const UpdateCmsMediaItemInput = z.object({
  mediaType: z.enum(CMS_MEDIA_TYPES).nullable().optional(),
  url: z.string().url().nullable().optional(),
  description: z.string().max(300).nullable().optional(),
  overlayGradient: z.string().max(500).nullable().optional(),
  name: z.string().min(1).max(200).nullable().optional(),
  country: z.enum(GALLERY_COUNTRY_CODES).nullable().optional(),
  platform: z.enum(CMS_SOCIAL_PLATFORMS).nullable().optional(),
  slug: slugSchema,
  sortOrder: z.number().int().nonnegative().optional(),
});
export type UpdateCmsMediaItemInput = z.infer<typeof UpdateCmsMediaItemInput>;

// CmsOperatingCountry (DR-202, homepage "Where we operate" map) -- which of
// the full 55 AU member states (AFRICA_COUNTRIES) get individually
// highlighted/interactive on the homepage map, plus their hover-tooltip
// snapshot facts. Deliberately a *separate* table/vocabulary from
// GALLERY_COUNTRY_CODES/OPERATING_COUNTRY_CODES above -- this is a
// decorative map highlight, not the platform's real booking/visa/tax
// operating footprint, so it's validated against the full continent list,
// not the narrower 4-country business set.
const AFRICA_ALPHA2_CODES = new Set(AFRICA_COUNTRIES.map((c) => c.alpha2));

export interface CmsOperatingCountryView {
  id: string;
  countryCode: string;
  capital: string;
  languages: string;
  currency: string;
  population: string;
  areaKm2: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  updatedByUserId: string | null;
}

/** Facts default to '' (blank) -- staff picks a country from the dropdown
 * first (add-blank-then-edit, same convention as createPartnerAction/
 * createSocialLinkAction), then fills in the snapshot facts afterward via
 * UpdateCmsOperatingCountryInput. */
export const CreateCmsOperatingCountryInput = z.object({
  countryCode: z.string().refine((v) => AFRICA_ALPHA2_CODES.has(v), 'Must be a valid African country code'),
  capital: z.string().max(200).optional(),
  languages: z.string().max(300).optional(),
  currency: z.string().max(200).optional(),
  population: z.string().max(100).optional(),
  areaKm2: z.string().max(100).optional(),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type CreateCmsOperatingCountryInput = z.infer<typeof CreateCmsOperatingCountryInput>;

/** `countryCode` isn't editable -- same "identity is fixed at create time"
 * convention as CmsMediaItem's (page, slotKey). Removing a country and
 * re-adding it is how staff would ever need a different code. */
export const UpdateCmsOperatingCountryInput = z.object({
  capital: z.string().max(200).optional(),
  languages: z.string().max(300).optional(),
  currency: z.string().max(200).optional(),
  population: z.string().max(100).optional(),
  areaKm2: z.string().max(100).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});
export type UpdateCmsOperatingCountryInput = z.infer<typeof UpdateCmsOperatingCountryInput>;
