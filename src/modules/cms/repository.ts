// cms module — repository. The only place that touches
// prisma.cmsTextBlock/cmsFaqEntry for this module. Both tables are
// platform-wide (no organizationId, no RLS -- same precedent as settings/'s
// TaxRate/PlatformRate), plain global `prisma` client, no withOrg. Table
// names are unchanged (`site_content`/`faq_entries`, via @@map) even though
// the Prisma model names were renamed in DR-162 -- a pure TS-facing rename,
// not a migration, so no data was at risk.
import type { CmsAboutEntry, CmsFaqEntry, CmsMediaItem, CmsOperatingCountry, CmsTextBlock } from '@prisma/client';
import { prisma } from '@lib/db';
import type {
  CmsAboutEntryView,
  CmsAboutSection,
  CmsFaqEntryView,
  CmsLocale,
  CmsMediaItemView,
  CmsMediaType,
  CmsOperatingCountryView,
  CmsSocialPlatform,
  CmsTextBlockView,
  CreateCmsAboutEntryInput,
  CreateCmsFaqEntryInput,
  CreateCmsMediaItemInput,
  CreateCmsOperatingCountryInput,
  UpdateCmsAboutEntryInput,
  UpdateCmsFaqEntryInput,
  UpdateCmsMediaItemInput,
  UpdateCmsOperatingCountryInput,
  UpdateCmsTextBlockInput,
} from './domain';

function toCmsTextBlockView(r: CmsTextBlock): CmsTextBlockView {
  return {
    id: r.id,
    key: r.key,
    locale: r.locale as CmsLocale,
    title: r.title,
    body: r.body,
    eyebrow: r.eyebrow,
    updatedAt: r.updatedAt,
    updatedByUserId: r.updatedByUserId,
  };
}

function toCmsMediaItemView(r: CmsMediaItem): CmsMediaItemView {
  return {
    id: r.id,
    page: r.page,
    slotKey: r.slotKey,
    mediaType: r.mediaType as CmsMediaType,
    url: r.url,
    description: r.description,
    overlayGradient: r.overlayGradient,
    name: r.name,
    country: r.country,
    platform: r.platform as CmsSocialPlatform | null,
    slug: r.slug,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    updatedByUserId: r.updatedByUserId,
  };
}

function toCmsOperatingCountryView(r: CmsOperatingCountry): CmsOperatingCountryView {
  return {
    id: r.id,
    countryCode: r.countryCode,
    capital: r.capital,
    languages: r.languages,
    currency: r.currency,
    population: r.population,
    areaKm2: r.areaKm2,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    updatedByUserId: r.updatedByUserId,
  };
}

function toCmsAboutEntryView(r: CmsAboutEntry): CmsAboutEntryView {
  return {
    id: r.id,
    section: r.section as CmsAboutSection,
    locale: r.locale as CmsLocale,
    slotKey: r.slotKey,
    heading: r.heading,
    body: r.body,
    marker: r.marker,
    numericValue: r.numericValue,
    prefix: r.prefix,
    suffix: r.suffix,
    animate: r.animate,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    updatedByUserId: r.updatedByUserId,
  };
}

function toCmsFaqEntryView(r: CmsFaqEntry): CmsFaqEntryView {
  return {
    id: r.id,
    question: r.question,
    answer: r.answer,
    locale: r.locale as CmsLocale,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export const cmsRepository = {
  // -------------------------------------------------------- CmsTextBlock
  async getTextBlockByKey(key: string, locale: CmsLocale): Promise<CmsTextBlockView | null> {
    const row = await prisma.cmsTextBlock.findUnique({ where: { key_locale: { key, locale } } });
    return row ? toCmsTextBlockView(row) : null;
  },
  async upsertTextBlock(input: UpdateCmsTextBlockInput, updatedByUserId: string): Promise<CmsTextBlockView> {
    const eyebrow = input.eyebrow ?? null;
    const row = await prisma.cmsTextBlock.upsert({
      where: { key_locale: { key: input.key, locale: input.locale } },
      update: { title: input.title, body: input.body, eyebrow, updatedByUserId },
      create: { key: input.key, locale: input.locale, title: input.title, body: input.body, eyebrow, updatedByUserId },
    });
    return toCmsTextBlockView(row);
  },
  /** Deletes every locale's row sharing one key -- used when a Home hero
   * slide (or any future per-slot text) is removed, since each slot's text
   * lives as one row per locale under the same key (DR-163). */
  async deleteTextBlocksByKey(key: string): Promise<void> {
    await prisma.cmsTextBlock.deleteMany({ where: { key } });
  },
  /** One query for every `email.*` override instead of 26+ single-key
   * reads -- notifications/service.ts's per-send lookup (DR-217). */
  async listTextBlocksByKeyPrefix(prefix: string, locale: CmsLocale): Promise<CmsTextBlockView[]> {
    const rows = await prisma.cmsTextBlock.findMany({ where: { key: { startsWith: prefix }, locale } });
    return rows.map(toCmsTextBlockView);
  },

  // --------------------------------------------------------- CmsFaqEntry
  async listFaqEntries(locale: CmsLocale): Promise<CmsFaqEntryView[]> {
    const rows = await prisma.cmsFaqEntry.findMany({ where: { locale }, orderBy: { sortOrder: 'asc' } });
    return rows.map(toCmsFaqEntryView);
  },
  async createFaqEntry(input: CreateCmsFaqEntryInput): Promise<CmsFaqEntryView> {
    const row = await prisma.cmsFaqEntry.create({ data: input });
    return toCmsFaqEntryView(row);
  },
  async updateFaqEntry(id: string, input: UpdateCmsFaqEntryInput): Promise<CmsFaqEntryView | null> {
    const existing = await prisma.cmsFaqEntry.findUnique({ where: { id } });
    if (!existing) return null;
    const row = await prisma.cmsFaqEntry.update({ where: { id }, data: input });
    return toCmsFaqEntryView(row);
  },
  async deleteFaqEntry(id: string): Promise<CmsFaqEntryView | null> {
    const existing = await prisma.cmsFaqEntry.findUnique({ where: { id } });
    if (!existing) return null;
    await prisma.cmsFaqEntry.delete({ where: { id } });
    return toCmsFaqEntryView(existing);
  },

  // ------------------------------------------------------- CmsMediaItem
  async listMediaItems(page: string): Promise<CmsMediaItemView[]> {
    const rows = await prisma.cmsMediaItem.findMany({ where: { page }, orderBy: { sortOrder: 'asc' } });
    return rows.map(toCmsMediaItemView);
  },
  /** A fresh, server-generated slotKey (add-a-slide); (page, slotKey) is
   * unique so this can never collide with an existing slot. */
  async createMediaItem(page: string, slotKey: string, input: CreateCmsMediaItemInput, updatedByUserId: string): Promise<CmsMediaItemView> {
    const row = await prisma.cmsMediaItem.create({
      data: {
        page,
        slotKey,
        mediaType: input.mediaType,
        url: input.url,
        description: input.description ?? null,
        overlayGradient: input.overlayGradient ?? null,
        name: input.name ?? null,
        country: input.country ?? null,
        platform: input.platform ?? null,
        slug: input.slug ?? null,
        sortOrder: input.sortOrder,
        updatedByUserId,
      },
    });
    return toCmsMediaItemView(row);
  },
  /** Resolves a gallery site's shareable-link identifier -- staff's editable
   * `slug` if it matches, else the server-generated `slotKey` (DR-254) --
   * so an item with no slug set yet still has a working share link, and an
   * existing slotKey-shaped link never breaks once a slug is added later. */
  async getMediaItemBySlugOrSlotKey(page: string, identifier: string): Promise<CmsMediaItemView | null> {
    const row = await prisma.cmsMediaItem.findFirst({ where: { page, OR: [{ slug: identifier }, { slotKey: identifier }] } });
    return row ? toCmsMediaItemView(row) : null;
  },
  /** Whether another item on the same page already has this slug -- checked
   * before a write since this table carries no organizationId/RLS at all
   * (a plain SELECT is reliable here, unlike the RLS-scoped anti-pattern
   * CLAUDE.md's Gotchas section documents for `polco_app`-connected tenant
   * tables). `excludeSlotKey` lets an update re-save its own unchanged slug. */
  async isSlugTaken(page: string, slug: string, excludeSlotKey?: string): Promise<boolean> {
    const row = await prisma.cmsMediaItem.findFirst({
      where: { page, slug, ...(excludeSlotKey ? { slotKey: { not: excludeSlotKey } } : {}) },
      select: { id: true },
    });
    return row !== null;
  },
  async updateMediaItem(
    page: string,
    slotKey: string,
    input: UpdateCmsMediaItemInput,
    updatedByUserId: string,
  ): Promise<CmsMediaItemView | null> {
    const existing = await prisma.cmsMediaItem.findUnique({ where: { page_slotKey: { page, slotKey } } });
    if (!existing) return null;
    const row = await prisma.cmsMediaItem.update({
      where: { page_slotKey: { page, slotKey } },
      data: { ...input, updatedByUserId },
    });
    return toCmsMediaItemView(row);
  },
  async deleteMediaItem(page: string, slotKey: string): Promise<CmsMediaItemView | null> {
    const existing = await prisma.cmsMediaItem.findUnique({ where: { page_slotKey: { page, slotKey } } });
    if (!existing) return null;
    await prisma.cmsMediaItem.delete({ where: { page_slotKey: { page, slotKey } } });
    return toCmsMediaItemView(existing);
  },

  // --------------------------------------------- CmsOperatingCountry (DR-202)
  async listOperatingCountries(): Promise<CmsOperatingCountryView[]> {
    const rows = await prisma.cmsOperatingCountry.findMany({ orderBy: { sortOrder: 'asc' } });
    return rows.map(toCmsOperatingCountryView);
  },
  async createOperatingCountry(input: CreateCmsOperatingCountryInput, updatedByUserId: string): Promise<CmsOperatingCountryView> {
    const row = await prisma.cmsOperatingCountry.create({
      data: {
        countryCode: input.countryCode,
        capital: input.capital ?? '',
        languages: input.languages ?? '',
        currency: input.currency ?? '',
        population: input.population ?? '',
        areaKm2: input.areaKm2 ?? '',
        sortOrder: input.sortOrder,
        updatedByUserId,
      },
    });
    return toCmsOperatingCountryView(row);
  },
  async updateOperatingCountry(
    id: string,
    input: UpdateCmsOperatingCountryInput,
    updatedByUserId: string,
  ): Promise<CmsOperatingCountryView | null> {
    const existing = await prisma.cmsOperatingCountry.findUnique({ where: { id } });
    if (!existing) return null;
    const row = await prisma.cmsOperatingCountry.update({ where: { id }, data: { ...input, updatedByUserId } });
    return toCmsOperatingCountryView(row);
  },
  async deleteOperatingCountry(id: string): Promise<CmsOperatingCountryView | null> {
    const existing = await prisma.cmsOperatingCountry.findUnique({ where: { id } });
    if (!existing) return null;
    await prisma.cmsOperatingCountry.delete({ where: { id } });
    return toCmsOperatingCountryView(existing);
  },

  // -------------------------------------------------- CmsAboutEntry (DR-256)
  async listAboutEntries(section: CmsAboutSection, locale: CmsLocale): Promise<CmsAboutEntryView[]> {
    const rows = await prisma.cmsAboutEntry.findMany({ where: { section, locale }, orderBy: { sortOrder: 'asc' } });
    return rows.map(toCmsAboutEntryView);
  },
  /** Writes one row per locale under a single slotKey, so an entry always
   * exists in both languages (prefilled with the same text) and staff only
   * has to translate it, never remember to add it twice. */
  async createAboutEntryForLocales(
    section: CmsAboutSection,
    slotKey: string,
    locales: readonly CmsLocale[],
    input: CreateCmsAboutEntryInput,
    updatedByUserId: string,
  ): Promise<CmsAboutEntryView[]> {
    const rows = await prisma.$transaction(
      locales.map((locale) =>
        prisma.cmsAboutEntry.create({
          data: {
            section,
            locale,
            slotKey,
            heading: input.heading,
            body: input.body ?? null,
            marker: input.marker ?? null,
            numericValue: input.numericValue ?? null,
            prefix: input.prefix ?? null,
            suffix: input.suffix ?? null,
            animate: input.animate,
            sortOrder: input.sortOrder,
            updatedByUserId,
          },
        }),
      ),
    );
    return rows.map(toCmsAboutEntryView);
  },
  async updateAboutEntry(
    section: CmsAboutSection,
    locale: CmsLocale,
    slotKey: string,
    input: UpdateCmsAboutEntryInput,
    updatedByUserId: string,
  ): Promise<CmsAboutEntryView | null> {
    const existing = await prisma.cmsAboutEntry.findUnique({
      where: { section_locale_slotKey: { section, locale, slotKey } },
    });
    if (!existing) return null;
    const row = await prisma.cmsAboutEntry.update({
      where: { section_locale_slotKey: { section, locale, slotKey } },
      data: { ...input, updatedByUserId },
    });
    return toCmsAboutEntryView(row);
  },
  /** Applies the locale-invariant half of an update (order, number, affixes)
   * to this entry's other-language rows -- see cmsService.updateAboutEntry. */
  async syncAboutEntryInvariants(
    section: CmsAboutSection,
    slotKey: string,
    data: Pick<UpdateCmsAboutEntryInput, 'numericValue' | 'prefix' | 'suffix' | 'animate' | 'sortOrder'>,
    updatedByUserId: string,
  ): Promise<void> {
    await prisma.cmsAboutEntry.updateMany({ where: { section, slotKey }, data: { ...data, updatedByUserId } });
  },
  /** Removes every locale's row for this entry -- same "a removed item
   * shouldn't leave orphaned per-locale rows behind" reasoning as
   * deleteTextBlocksByKey above. Returns the rows that were deleted. */
  async deleteAboutEntry(section: CmsAboutSection, slotKey: string): Promise<CmsAboutEntryView[]> {
    const existing = await prisma.cmsAboutEntry.findMany({ where: { section, slotKey } });
    if (existing.length === 0) return [];
    await prisma.cmsAboutEntry.deleteMany({ where: { section, slotKey } });
    return existing.map(toCmsAboutEntryView);
  },
};
