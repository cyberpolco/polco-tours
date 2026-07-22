// content module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { AuthContext } from '@modules/auth';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import {
  contentImageExtension,
  isValidContentImageUpload,
  type ContentLocale,
  type CreateFaqEntryInput,
  type FaqEntryView,
  type SiteContentView,
  type UpdateFaqEntryInput,
  type UpdateSiteContentInput,
} from './domain';
import { ContentBlobGatewayError, contentBlobGateway } from './gateway';
import { contentRepository } from './repository';

/** Same layering as settings/service.ts's requireSettingsWriter -- a direct
 * role-identity check, not just the content.write permission, since a future
 * SUPERADMIN could otherwise grant that permission to another role and
 * silently change who this actually means. */
function requireContentWriter(ctx: AuthContext): void {
  assertCan(ctx, 'content.write');
  if (!ctx.roles.includes('SUPERADMIN')) {
    throw Errors.forbidden('Only SUPERADMIN may edit site content');
  }
}

export interface UploadContentImageInput {
  contentType: string;
  sizeBytes: number;
  bytes: Buffer;
}

export const contentService = {
  // --------------------------------------------------------- staff (DR-071)
  async getSiteContent(ctx: AuthContext, key: string, locale: ContentLocale = 'en'): Promise<SiteContentView | null> {
    assertCan(ctx, 'content.read');
    return contentRepository.getSiteContentByKey(key, locale);
  },
  async updateSiteContent(ctx: AuthContext, input: UpdateSiteContentInput): Promise<SiteContentView> {
    requireContentWriter(ctx);
    const content = await contentRepository.upsertSiteContent(input, ctx.userId);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'content.site_content_updated',
      resourceType: 'SiteContent',
      resourceId: content.id,
      metadata: { key: input.key, locale: input.locale },
    });
    return content;
  },
  async listFaqEntries(ctx: AuthContext, locale: ContentLocale = 'en'): Promise<FaqEntryView[]> {
    assertCan(ctx, 'content.read');
    return contentRepository.listFaqEntries(locale);
  },
  async createFaqEntry(ctx: AuthContext, input: CreateFaqEntryInput): Promise<FaqEntryView> {
    requireContentWriter(ctx);
    const entry = await contentRepository.createFaqEntry(input);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'content.faq_entry_created',
      resourceType: 'FaqEntry',
      resourceId: entry.id,
    });
    return entry;
  },
  async updateFaqEntry(ctx: AuthContext, id: string, input: UpdateFaqEntryInput): Promise<FaqEntryView> {
    requireContentWriter(ctx);
    const entry = await contentRepository.updateFaqEntry(id, input);
    if (!entry) throw Errors.notFound('FAQ entry not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'content.faq_entry_updated',
      resourceType: 'FaqEntry',
      resourceId: id,
    });
    return entry;
  },
  async deleteFaqEntry(ctx: AuthContext, id: string): Promise<void> {
    requireContentWriter(ctx);
    const deleted = await contentRepository.deleteFaqEntry(id);
    if (!deleted) throw Errors.notFound('FAQ entry not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'content.faq_entry_deleted',
      resourceType: 'FaqEntry',
      resourceId: id,
    });
  },

  /** General-purpose "upload an image, get a public URL back" primitive
   * (DR-071) -- not wired to any specific field/page in v1 (no licensed
   * photography exists yet, OI-12); a SUPERADMIN uses the returned URL
   * manually wherever it's needed. */
  async uploadImage(ctx: AuthContext, input: UploadContentImageInput): Promise<{ url: string }> {
    requireContentWriter(ctx);
    if (!isValidContentImageUpload(input.contentType, input.sizeBytes)) {
      throw Errors.validation('Invalid image upload (unsupported content type or size)');
    }
    const pathname = `content-images/${crypto.randomUUID()}.${contentImageExtension(input.contentType)}`;
    let uploaded;
    try {
      uploaded = await contentBlobGateway.uploadPublicImage(pathname, input.bytes, input.contentType);
    } catch (err) {
      if (err instanceof ContentBlobGatewayError) throw Errors.internal();
      throw err;
    }
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'content.image_uploaded',
      resourceType: 'ContentImage',
      metadata: { pathname: uploaded.pathname },
    });
    return { url: uploaded.url };
  },

  // ---------------------------------------------------------- public (DR-071)
  // No ctx/session exists for these callers -- the public /about and /faq
  // guest pages. Mirrors catalogService's listPublicPackages/etc: no
  // permission check at all, deliberately, since these ARE the public read
  // path content.read otherwise gates for staff.

  async getPublicSiteContent(key: string, locale: ContentLocale): Promise<SiteContentView | null> {
    return contentRepository.getSiteContentByKey(key, locale);
  },

  async listPublicFaqEntries(locale: ContentLocale): Promise<FaqEntryView[]> {
    return contentRepository.listFaqEntries(locale);
  },
};
