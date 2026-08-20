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

// Only the two locales the guest site itself supports (src/i18n/request.ts).
export const SUPPORTED_LOCALES = ['en', 'fr'] as const;
export type CmsLocale = (typeof SUPPORTED_LOCALES)[number];

export interface CmsTextBlockView {
  id: string;
  key: string;
  locale: CmsLocale;
  title: string;
  body: string;
  updatedAt: Date;
  updatedByUserId: string | null;
}

export const UpdateCmsTextBlockInput = z.object({
  key: z.string().min(1).max(100),
  locale: z.enum(SUPPORTED_LOCALES),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
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
