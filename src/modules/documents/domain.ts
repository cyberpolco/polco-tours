// documents module — domain types & rules. Pure; no framework or DB imports.
// Generic document metadata store (Documents rule, CLAUDE.md). Originally
// passport-only; generalized in DR-017 (Phase 2 Increment 1) to also cover
// fleet compliance documents (vehicle registration/insurance/inspection,
// driver license); DR-019 (Increment 3) added the VISA kind unchanged.
export const MAX_PASSPORT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const PASSPORT_CONTENT_TYPE = 'application/pdf';

// Compliance docs are often just a phone photo of a paper certificate, so
// images are allowed alongside PDF (unlike a passport scan, which is always PDF).
export const MAX_COMPLIANCE_DOC_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const COMPLIANCE_CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export interface DocumentSummary {
  id: string;
  kind: string;
  contentType: string;
  sizeBytes: number;
  expiresAt: Date | null;
  createdAt: Date;
}

interface DocumentKindRule {
  allowedContentTypes: string[];
  maxSizeBytes: number;
}

// `kind` stays a plain string (not an enum) so adding a new one never needs a
// migration (DR-015) -- this table is the closed set of kinds the app will
// actually accept an upload for today.
const DOCUMENT_KIND_RULES: Record<string, DocumentKindRule> = {
  PASSPORT: { allowedContentTypes: [PASSPORT_CONTENT_TYPE], maxSizeBytes: MAX_PASSPORT_SIZE_BYTES },
  VEHICLE_REGISTRATION: { allowedContentTypes: COMPLIANCE_CONTENT_TYPES, maxSizeBytes: MAX_COMPLIANCE_DOC_SIZE_BYTES },
  VEHICLE_INSURANCE: { allowedContentTypes: COMPLIANCE_CONTENT_TYPES, maxSizeBytes: MAX_COMPLIANCE_DOC_SIZE_BYTES },
  VEHICLE_INSPECTION: { allowedContentTypes: COMPLIANCE_CONTENT_TYPES, maxSizeBytes: MAX_COMPLIANCE_DOC_SIZE_BYTES },
  DRIVER_LICENSE: { allowedContentTypes: COMPLIANCE_CONTENT_TYPES, maxSizeBytes: MAX_COMPLIANCE_DOC_SIZE_BYTES },
  // A granted visa is often just a stamped page photographed, not always a
  // scanned PDF -- same allowance as the fleet compliance kinds (DR-019).
  VISA: { allowedContentTypes: COMPLIANCE_CONTENT_TYPES, maxSizeBytes: MAX_COMPLIANCE_DOC_SIZE_BYTES },
  // Guide certifications (first-aid, wilderness guiding, etc.) -- same
  // allowance as the other compliance kinds (DR-030).
  GUIDE_CERTIFICATION: { allowedContentTypes: COMPLIANCE_CONTENT_TYPES, maxSizeBytes: MAX_COMPLIANCE_DOC_SIZE_BYTES },
};

export function isValidDocumentUpload(kind: string, contentType: string, sizeBytes: number): boolean {
  const rule = DOCUMENT_KIND_RULES[kind];
  if (!rule) return false;
  return rule.allowedContentTypes.includes(contentType) && sizeBytes > 0 && sizeBytes <= rule.maxSizeBytes;
}
