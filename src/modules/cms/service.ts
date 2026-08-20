// cms module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { AuthContext } from '@modules/auth';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import {
  cmsImageExtension,
  isValidCmsImageUpload,
  type CmsFaqEntryView,
  type CmsLocale,
  type CmsMediaItemView,
  type CmsTextBlockView,
  type CreateCmsFaqEntryInput,
  type CreateCmsMediaItemInput,
  type UpdateCmsFaqEntryInput,
  type UpdateCmsMediaItemInput,
  type UpdateCmsTextBlockInput,
} from './domain';
import { CmsBlobGatewayError, CmsImageCompressionError, cmsBlobGateway } from './gateway';
import { cmsRepository } from './repository';

/** Same layering as settings/service.ts's requireSettingsWriter -- a direct
 * role-identity check, not just the cms.write permission, since a future
 * SUPERADMIN could otherwise grant that permission to another role and
 * silently change who this actually means. */
function requireCmsWriter(ctx: AuthContext): void {
  assertCan(ctx, 'cms.write');
  if (!ctx.roles.includes('SUPERADMIN')) {
    throw Errors.forbidden('Only SUPERADMIN may edit site content');
  }
}

export interface UploadCmsImageInput {
  contentType: string;
  sizeBytes: number;
  bytes: Buffer;
}

export const cmsService = {
  // --------------------------------------------------------- staff (DR-071)
  async getTextBlock(ctx: AuthContext, key: string, locale: CmsLocale = 'en'): Promise<CmsTextBlockView | null> {
    assertCan(ctx, 'cms.read');
    return cmsRepository.getTextBlockByKey(key, locale);
  },
  async updateTextBlock(ctx: AuthContext, input: UpdateCmsTextBlockInput): Promise<CmsTextBlockView> {
    requireCmsWriter(ctx);
    const content = await cmsRepository.upsertTextBlock(input, ctx.userId);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'cms.text_block_updated',
      resourceType: 'CmsTextBlock',
      resourceId: content.id,
      metadata: { key: input.key, locale: input.locale },
    });
    return content;
  },
  async listFaqEntries(ctx: AuthContext, locale: CmsLocale = 'en'): Promise<CmsFaqEntryView[]> {
    assertCan(ctx, 'cms.read');
    return cmsRepository.listFaqEntries(locale);
  },
  async createFaqEntry(ctx: AuthContext, input: CreateCmsFaqEntryInput): Promise<CmsFaqEntryView> {
    requireCmsWriter(ctx);
    const entry = await cmsRepository.createFaqEntry(input);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'cms.faq_entry_created',
      resourceType: 'CmsFaqEntry',
      resourceId: entry.id,
    });
    return entry;
  },
  async updateFaqEntry(ctx: AuthContext, id: string, input: UpdateCmsFaqEntryInput): Promise<CmsFaqEntryView> {
    requireCmsWriter(ctx);
    const entry = await cmsRepository.updateFaqEntry(id, input);
    if (!entry) throw Errors.notFound('FAQ entry not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'cms.faq_entry_updated',
      resourceType: 'CmsFaqEntry',
      resourceId: id,
    });
    return entry;
  },
  async deleteFaqEntry(ctx: AuthContext, id: string): Promise<void> {
    requireCmsWriter(ctx);
    const deleted = await cmsRepository.deleteFaqEntry(id);
    if (!deleted) throw Errors.notFound('FAQ entry not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'cms.faq_entry_deleted',
      resourceType: 'CmsFaqEntry',
      resourceId: id,
    });
  },

  /** General-purpose "upload an image, get a public URL back" primitive
   * (DR-071) -- not wired to any specific field/page in v1 (no licensed
   * photography exists yet, OI-12); a SUPERADMIN uses the returned URL
   * manually wherever it's needed. */
  async uploadImage(ctx: AuthContext, input: UploadCmsImageInput): Promise<{ url: string }> {
    requireCmsWriter(ctx);
    if (!isValidCmsImageUpload(input.contentType, input.sizeBytes)) {
      throw Errors.validation('Invalid image upload (unsupported content type or size)');
    }
    const pathname = `cms-images/${crypto.randomUUID()}.${cmsImageExtension(input.contentType)}`;
    let uploaded;
    try {
      uploaded = await cmsBlobGateway.uploadPublicImage(pathname, input.bytes, input.contentType);
    } catch (err) {
      if (err instanceof CmsImageCompressionError) throw Errors.validation('Unable to process image');
      if (err instanceof CmsBlobGatewayError) throw Errors.internal();
      throw err;
    }
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'cms.image_uploaded',
      resourceType: 'CmsImage',
      metadata: { pathname: uploaded.pathname },
    });
    return { url: uploaded.url };
  },

  // ------------------------------------------------------- CmsMediaItem
  // (DR-163, Home hero) -- a media item's paired per-locale text (if any)
  // lives in CmsTextBlock under key `${page}.${slotKey}`; callers that want
  // both fetch each separately (mirrors how the guest homepage composes
  // catalog+itinerary data one level up, not inside either service).
  async listMediaItems(ctx: AuthContext, page: string): Promise<CmsMediaItemView[]> {
    assertCan(ctx, 'cms.read');
    return cmsRepository.listMediaItems(page);
  },
  /** Generates a fresh slotKey server-side -- callers never choose their
   * own, so (page, slotKey) can never collide with an existing slot. */
  async createMediaItem(ctx: AuthContext, page: string, input: CreateCmsMediaItemInput): Promise<CmsMediaItemView> {
    requireCmsWriter(ctx);
    const slotKey = crypto.randomUUID();
    const item = await cmsRepository.createMediaItem(page, slotKey, input, ctx.userId);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'cms.media_item_created',
      resourceType: 'CmsMediaItem',
      resourceId: item.id,
      metadata: { page, slotKey },
    });
    return item;
  },
  async updateMediaItem(ctx: AuthContext, page: string, slotKey: string, input: UpdateCmsMediaItemInput): Promise<CmsMediaItemView> {
    requireCmsWriter(ctx);
    const item = await cmsRepository.updateMediaItem(page, slotKey, input, ctx.userId);
    if (!item) throw Errors.notFound('Media item not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'cms.media_item_updated',
      resourceType: 'CmsMediaItem',
      resourceId: item.id,
      metadata: { page, slotKey },
    });
    return item;
  },
  /** Also removes the paired text block (every locale) under the same
   * (page, slotKey) key -- a removed slide shouldn't leave orphaned text
   * rows behind with no media to pair with. */
  async deleteMediaItem(ctx: AuthContext, page: string, slotKey: string): Promise<void> {
    requireCmsWriter(ctx);
    const deleted = await cmsRepository.deleteMediaItem(page, slotKey);
    if (!deleted) throw Errors.notFound('Media item not found');
    await cmsRepository.deleteTextBlocksByKey(`${page}.${slotKey}`);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'cms.media_item_deleted',
      resourceType: 'CmsMediaItem',
      resourceId: deleted.id,
      metadata: { page, slotKey },
    });
  },

  // ---------------------------------------------------------- public (DR-071)
  // No ctx/session exists for these callers -- the public /about, /faq, and
  // (DR-163) homepage hero. Mirrors catalogService's listPublicPackages/etc:
  // no permission check at all, deliberately, since these ARE the public
  // read path cms.read otherwise gates for staff.

  async getPublicTextBlock(key: string, locale: CmsLocale): Promise<CmsTextBlockView | null> {
    return cmsRepository.getTextBlockByKey(key, locale);
  },

  async listPublicFaqEntries(locale: CmsLocale): Promise<CmsFaqEntryView[]> {
    return cmsRepository.listFaqEntries(locale);
  },

  async listPublicMediaItems(page: string): Promise<CmsMediaItemView[]> {
    return cmsRepository.listMediaItems(page);
  },
};
