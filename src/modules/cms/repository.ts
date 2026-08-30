// cms module — repository. The only place that touches
// prisma.cmsTextBlock/cmsFaqEntry for this module. Both tables are
// platform-wide (no organizationId, no RLS -- same precedent as settings/'s
// TaxRate/PlatformRate), plain global `prisma` client, no withOrg. Table
// names are unchanged (`site_content`/`faq_entries`, via @@map) even though
// the Prisma model names were renamed in DR-162 -- a pure TS-facing rename,
// not a migration, so no data was at risk.
import type { CmsFaqEntry, CmsMediaItem, CmsOperatingCountry, CmsTextBlock } from '@prisma/client';
import { prisma } from '@lib/db';
import type {
  CmsFaqEntryView,
  CmsLocale,
  CmsMediaItemView,
  CmsMediaType,
  CmsOperatingCountryView,
  CmsSocialPlatform,
  CmsTextBlockView,
  CreateCmsFaqEntryInput,
  CreateCmsMediaItemInput,
  CreateCmsOperatingCountryInput,
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
        sortOrder: input.sortOrder,
        updatedByUserId,
      },
    });
    return toCmsMediaItemView(row);
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
};
