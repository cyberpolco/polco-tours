// documents module — public interface. Other modules import ONLY from here.
export { documentsService } from './service';
export type { UploadPassportInput, DocumentStream } from './service';
export type { DocumentSummary } from './domain';
export { MAX_PASSPORT_SIZE_BYTES, PASSPORT_CONTENT_TYPE } from './domain';
