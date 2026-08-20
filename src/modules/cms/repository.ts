// cms module — repository. The only place that touches
// prisma.cmsTextBlock/cmsFaqEntry for this module. Both tables are
// platform-wide (no organizationId, no RLS -- same precedent as settings/'s
// TaxRate/PlatformRate), plain global `prisma` client, no withOrg. Table
// names are unchanged (`site_content`/`faq_entries`, via @@map) even though
// the Prisma model names were renamed in DR-162 -- a pure TS-facing rename,
// not a migration, so no data was at risk.
import type { CmsFaqEntry, CmsTextBlock } from '@prisma/client';
import { prisma } from '@lib/db';
import type {
  CmsFaqEntryView,
  CmsLocale,
  CmsTextBlockView,
  CreateCmsFaqEntryInput,
  UpdateCmsFaqEntryInput,
  UpdateCmsTextBlockInput,
} from './domain';

function toCmsTextBlockView(r: CmsTextBlock): CmsTextBlockView {
  return {
    id: r.id,
    key: r.key,
    locale: r.locale as CmsLocale,
    title: r.title,
    body: r.body,
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
    const row = await prisma.cmsTextBlock.upsert({
      where: { key_locale: { key: input.key, locale: input.locale } },
      update: { title: input.title, body: input.body, updatedByUserId },
      create: { key: input.key, locale: input.locale, title: input.title, body: input.body, updatedByUserId },
    });
    return toCmsTextBlockView(row);
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
};
