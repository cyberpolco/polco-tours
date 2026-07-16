// documents module — repository. The only place that touches the DB for this
// module. blobPathname is kept in the internal DocumentRecord only -- service.ts
// never returns it to a caller outside the module (see DocumentSummary).
import type { Document } from '@prisma/client';
import { withOrg } from '@lib/db';

export interface DocumentRecord {
  id: string;
  organizationId: string;
  kind: string;
  blobPathname: string;
  contentType: string;
  sizeBytes: number;
  uploadedByUserId: string;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface CreateDocumentParams {
  kind: string;
  blobPathname: string;
  contentType: string;
  sizeBytes: number;
  uploadedByUserId: string;
  expiresAt?: Date;
  vehicleId?: string;
  driverProfileId?: string;
  guideProfileId?: string;
}

function toRecord(d: Document): DocumentRecord {
  return {
    id: d.id,
    organizationId: d.organizationId,
    kind: d.kind,
    blobPathname: d.blobPathname,
    contentType: d.contentType,
    sizeBytes: d.sizeBytes,
    uploadedByUserId: d.uploadedByUserId,
    expiresAt: d.expiresAt,
    createdAt: d.createdAt,
  };
}

export const documentsRepository = {
  async create(organizationId: string, params: CreateDocumentParams): Promise<DocumentRecord> {
    return withOrg(organizationId, async (tx) => {
      const d = await tx.document.create({ data: { organizationId, ...params } });
      return toRecord(d);
    });
  },

  async findById(organizationId: string, id: string): Promise<DocumentRecord | null> {
    return withOrg(organizationId, async (tx) => {
      const d = await tx.document.findUnique({ where: { id } });
      return d ? toRecord(d) : null;
    });
  },

  async listForVehicle(organizationId: string, vehicleId: string): Promise<DocumentRecord[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.document.findMany({ where: { vehicleId }, orderBy: { createdAt: 'desc' } });
      return rows.map(toRecord);
    });
  },

  async listForDriverProfile(organizationId: string, driverProfileId: string): Promise<DocumentRecord[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.document.findMany({ where: { driverProfileId }, orderBy: { createdAt: 'desc' } });
      return rows.map(toRecord);
    });
  },

  async listForGuideProfile(organizationId: string, guideProfileId: string): Promise<DocumentRecord[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.document.findMany({ where: { guideProfileId }, orderBy: { createdAt: 'desc' } });
      return rows.map(toRecord);
    });
  },
};
