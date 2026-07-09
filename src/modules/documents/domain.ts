// documents module — domain types & rules. Pure; no framework or DB imports.
// Generic document metadata store (Documents rule, CLAUDE.md); passport is the
// only kind exercised so far -- Phase 2 visa documents reuse this unchanged.
export const MAX_PASSPORT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const PASSPORT_CONTENT_TYPE = 'application/pdf';

export interface DocumentSummary {
  id: string;
  kind: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}

export function isValidPassportUpload(contentType: string, sizeBytes: number): boolean {
  return contentType === PASSPORT_CONTENT_TYPE && sizeBytes > 0 && sizeBytes <= MAX_PASSPORT_SIZE_BYTES;
}
