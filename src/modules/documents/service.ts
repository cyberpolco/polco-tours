// documents module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { AuthContext } from '@modules/auth';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import { isValidDocumentUpload, type DocumentSummary } from './domain';
import { BlobGatewayError, blobGateway } from './gateway';
import { documentsRepository } from './repository';

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

function toSummary(d: {
  id: string;
  kind: string;
  contentType: string;
  sizeBytes: number;
  expiresAt: Date | null;
  createdAt: Date;
}): DocumentSummary {
  return {
    id: d.id,
    kind: d.kind,
    contentType: d.contentType,
    sizeBytes: d.sizeBytes,
    expiresAt: d.expiresAt,
    createdAt: d.createdAt,
  };
}

export interface UploadPassportInput {
  contentType: string;
  sizeBytes: number;
  bytes: Buffer;
}

export interface UploadDocumentInput {
  kind: string;
  contentType: string;
  sizeBytes: number;
  bytes: Buffer;
  expiresAt?: Date;
  vehicleId?: string;
  driverProfileId?: string;
  guideProfileId?: string;
}

export interface DocumentStream {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  sizeBytes: number;
}

/** kind -> pathname prefix + file extension, since compliance kinds may be uploaded as an image, not always PDF. */
function pathnameFor(kind: string, organizationId: string, contentType: string): string {
  const ext = contentType === 'application/pdf' ? 'pdf' : contentType === 'image/png' ? 'png' : 'jpg';
  const prefix = kind === 'PASSPORT' ? 'passports' : 'compliance-docs';
  return `${prefix}/${organizationId}/${crypto.randomUUID()}.${ext}`;
}

export const documentsService = {
  /** Generic upload path -- any module needing document storage (fleet compliance
   * docs, future visa docs) goes through this rather than re-wrapping Vercel Blob
   * itself (charter rule 8: third-party integrations wrapped in exactly one place). */
  async uploadDocument(ctx: AuthContext, input: UploadDocumentInput): Promise<DocumentSummary> {
    assertCan(ctx.roles, 'documents.write');
    const organizationId = requireOrg(ctx);

    if (!isValidDocumentUpload(input.kind, input.contentType, input.sizeBytes)) {
      throw Errors.validation(`Invalid ${input.kind} upload (unsupported content type or size)`);
    }

    const pathname = pathnameFor(input.kind, organizationId, input.contentType);
    let uploaded;
    try {
      uploaded = await blobGateway.upload(pathname, input.bytes, input.contentType);
    } catch (err) {
      if (err instanceof BlobGatewayError) throw Errors.internal();
      throw err;
    }

    const doc = await documentsRepository.create(organizationId, {
      kind: input.kind,
      blobPathname: uploaded.pathname,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      uploadedByUserId: ctx.userId,
      expiresAt: input.expiresAt,
      vehicleId: input.vehicleId,
      driverProfileId: input.driverProfileId,
      guideProfileId: input.guideProfileId,
    });

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'document.uploaded',
      resourceType: 'Document',
      resourceId: doc.id,
      organizationId,
    });

    return toSummary(doc);
  },

  async uploadPassport(ctx: AuthContext, input: UploadPassportInput): Promise<DocumentSummary> {
    return documentsService.uploadDocument(ctx, { ...input, kind: 'PASSPORT' });
  },

  /** Streams the document's bytes server-side -- the underlying blobPathname never
   * leaves this module. Every access is audited (Documents rule, CLAUDE.md). */
  async streamDocument(ctx: AuthContext, documentId: string): Promise<DocumentStream> {
    assertCan(ctx.roles, 'documents.read');
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
      actorRole: ctx.roles[0],
      action: 'document.accessed',
      resourceType: 'Document',
      resourceId: record.id,
      organizationId,
    });

    return { body: downloaded.body, contentType: record.contentType, sizeBytes: record.sizeBytes };
  },

  /** Lists compliance-document summaries for a vehicle/driver profile -- called by
   * the fleet module through this module's public interface (module boundary rule). */
  async listVehicleDocuments(ctx: AuthContext, vehicleId: string): Promise<DocumentSummary[]> {
    assertCan(ctx.roles, 'documents.read');
    const organizationId = requireOrg(ctx);
    const rows = await documentsRepository.listForVehicle(organizationId, vehicleId);
    return rows.map(toSummary);
  },

  async listDriverProfileDocuments(ctx: AuthContext, driverProfileId: string): Promise<DocumentSummary[]> {
    assertCan(ctx.roles, 'documents.read');
    const organizationId = requireOrg(ctx);
    const rows = await documentsRepository.listForDriverProfile(organizationId, driverProfileId);
    return rows.map(toSummary);
  },

  async listGuideProfileDocuments(ctx: AuthContext, guideProfileId: string): Promise<DocumentSummary[]> {
    assertCan(ctx.roles, 'documents.read');
    const organizationId = requireOrg(ctx);
    const rows = await documentsRepository.listForGuideProfile(organizationId, guideProfileId);
    return rows.map(toSummary);
  },
};
