// documents module — public interface. Other modules import ONLY from here.
export { documentsService } from './service';
export type { UploadPassportInput, UploadDocumentInput, DocumentStream } from './service';
export type { DocumentSummary } from './domain';
export { MAX_PASSPORT_SIZE_BYTES, PASSPORT_CONTENT_TYPE, MAX_COMPLIANCE_DOC_SIZE_BYTES } from './domain';
