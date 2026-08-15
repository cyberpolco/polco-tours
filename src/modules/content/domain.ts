// content module — domain types & rules. Pure; no framework or DB imports.
// Content module (DR-071): staff-editable guest-site content (About page
// text + FAQ list), replacing what used to be hardcoded JSX/TS literals in
// src/app/(guest)/{about,faq}. SiteContent/FaqEntry themselves were added
// ahead of this module as a deliberate unused scaffold in DR-042 -- this DR
// is what actually builds the module around them.
import { z } from 'zod';

// Only the two locales the guest site itself supports (src/i18n/request.ts).
export const SUPPORTED_LOCALES = ['en', 'fr'] as const;
export type ContentLocale = (typeof SUPPORTED_LOCALES)[number];

export interface SiteContentView {
  id: string;
  key: string;
  locale: ContentLocale;
  title: string;
  body: string;
  updatedAt: Date;
  updatedByUserId: string | null;
}

export const UpdateSiteContentInput = z.object({
  key: z.string().min(1).max(100),
  locale: z.enum(SUPPORTED_LOCALES),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
});
export type UpdateSiteContentInput = z.infer<typeof UpdateSiteContentInput>;

export interface FaqEntryView {
  id: string;
  question: string;
  answer: string;
  locale: ContentLocale;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateFaqEntryInput = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1),
  locale: z.enum(SUPPORTED_LOCALES).default('en'),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type CreateFaqEntryInput = z.infer<typeof CreateFaqEntryInput>;

export const UpdateFaqEntryInput = z.object({
  question: z.string().min(1).max(500).optional(),
  answer: z.string().min(1).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});
export type UpdateFaqEntryInput = z.infer<typeof UpdateFaqEntryInput>;

// Public-image upload validation -- promoted to src/lib/public-image-blob.ts
// (DR-114) so catalog module's package-image upload shares the same
// vocabulary; re-exported here under content's original names so nothing
// else in this module (or its tests) needs to change.
export {
  MAX_PUBLIC_IMAGE_SIZE_BYTES as MAX_CONTENT_IMAGE_SIZE_BYTES,
  isValidPublicImageUpload as isValidContentImageUpload,
  publicImageExtension as contentImageExtension,
} from '@lib/public-image-blob';
