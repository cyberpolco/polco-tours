// content module — repository. The only place that touches
// prisma.siteContent/faqEntry for this module. Both tables are platform-wide
// (no organizationId, no RLS -- same precedent as settings/'s TaxRate/
// PlatformRate), plain global `prisma` client, no withOrg.
import type { FaqEntry, SiteContent } from '@prisma/client';
import { prisma } from '@lib/db';
import type {
  ContentLocale,
  CreateFaqEntryInput,
  FaqEntryView,
  SiteContentView,
  UpdateFaqEntryInput,
  UpdateSiteContentInput,
} from './domain';

function toSiteContentView(r: SiteContent): SiteContentView {
  return {
    id: r.id,
    key: r.key,
    locale: r.locale as ContentLocale,
    title: r.title,
    body: r.body,
    updatedAt: r.updatedAt,
    updatedByUserId: r.updatedByUserId,
  };
}

function toFaqEntryView(r: FaqEntry): FaqEntryView {
  return {
    id: r.id,
    question: r.question,
    answer: r.answer,
    locale: r.locale as ContentLocale,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export const contentRepository = {
  // --------------------------------------------------------- SiteContent
  async getSiteContentByKey(key: string, locale: ContentLocale): Promise<SiteContentView | null> {
    const row = await prisma.siteContent.findUnique({ where: { key_locale: { key, locale } } });
    return row ? toSiteContentView(row) : null;
  },
  async upsertSiteContent(input: UpdateSiteContentInput, updatedByUserId: string): Promise<SiteContentView> {
    const row = await prisma.siteContent.upsert({
      where: { key_locale: { key: input.key, locale: input.locale } },
      update: { title: input.title, body: input.body, updatedByUserId },
      create: { key: input.key, locale: input.locale, title: input.title, body: input.body, updatedByUserId },
    });
    return toSiteContentView(row);
  },

  // ------------------------------------------------------------ FaqEntry
  async listFaqEntries(locale: ContentLocale): Promise<FaqEntryView[]> {
    const rows = await prisma.faqEntry.findMany({ where: { locale }, orderBy: { sortOrder: 'asc' } });
    return rows.map(toFaqEntryView);
  },
  async createFaqEntry(input: CreateFaqEntryInput): Promise<FaqEntryView> {
    const row = await prisma.faqEntry.create({ data: input });
    return toFaqEntryView(row);
  },
  async updateFaqEntry(id: string, input: UpdateFaqEntryInput): Promise<FaqEntryView | null> {
    const existing = await prisma.faqEntry.findUnique({ where: { id } });
    if (!existing) return null;
    const row = await prisma.faqEntry.update({ where: { id }, data: input });
    return toFaqEntryView(row);
  },
  async deleteFaqEntry(id: string): Promise<FaqEntryView | null> {
    const existing = await prisma.faqEntry.findUnique({ where: { id } });
    if (!existing) return null;
    await prisma.faqEntry.delete({ where: { id } });
    return toFaqEntryView(existing);
  },
};
