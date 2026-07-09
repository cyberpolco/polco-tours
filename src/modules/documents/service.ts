// documents module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { AuthContext } from '@modules/auth';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import { isValidPassportUpload, MAX_PASSPORT_SIZE_BYTES, type DocumentSummary } from './domain';
import { BlobGatewayError, blobGateway } from './gateway';
import { documentsRepository } from './repository';

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

function toSummary(d: { id: string; kind: string; contentType: string; sizeBytes: number; createdAt: Date }): DocumentSummary {
  return { id: d.id, kind: d.kind, contentType: d.contentType, sizeBytes: d.sizeBytes, createdAt: d.createdAt };
}

export interface UploadPassportInput {
  contentType: string;
  sizeBytes: number;
  bytes: Buffer;
}

export interface DocumentStream {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  sizeBytes: number;
}

export const documentsService = {
  async uploadPassport(ctx: AuthContext, input: UploadPassportInput): Promise<DocumentSummary> {
    assertCan(ctx.role, 'documents.write');
    const organizationId = requireOrg(ctx);

    if (!isValidPassportUpload(input.contentType, input.sizeBytes)) {
      throw Errors.validation(`Passport must be a PDF up to ${MAX_PASSPORT_SIZE_BYTES / (1024 * 1024)}MB`);
    }

    const pathname = `passports/${organizationId}/${crypto.randomUUID()}.pdf`;
    let uploaded;
    try {
      uploaded = await blobGateway.upload(pathname, input.bytes, input.contentType);
    } catch (err) {
      if (err instanceof BlobGatewayError) throw Errors.internal();
      throw err;
    }

    const doc = await documentsRepository.create(organizationId, {
      kind: 'PASSPORT',
      blobPathname: uploaded.pathname,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      uploadedByUserId: ctx.userId,
    });

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: 'document.uploaded',
      resourceType: 'Document',
      resourceId: doc.id,
      organizationId,
    });

    return toSummary(doc);
  },

  /** Streams the document's bytes server-side -- the underlying blobPathname never
   * leaves this module. Every access is audited (Documents rule, CLAUDE.md). */
  async streamDocument(ctx: AuthContext, documentId: string): Promise<DocumentStream> {
    assertCan(ctx.role, 'documents.read');
    const organizationId = requireOrg(ctx);

    const record = await documentsRepository.findById(organizationId, documentId);
    if (!record) throw Errors.notFound('Document not found');

    let downloaded;
    try {
      downloaded = await blobGateway.download(record.blobPathname);
    } catch (err) {
      if (err instanceof BlobGatewayError) throw Errors.internal();
      throw err;
    }

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: 'document.accessed',
      resourceType: 'Document',
      resourceId: record.id,
      organizationId,
    });

    return { body: downloaded.body, contentType: record.contentType, sizeBytes: record.sizeBytes };
  },
};
