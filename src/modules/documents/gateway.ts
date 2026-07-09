// documents module — Vercel Blob gateway (charter rule 8: third-party
// integrations must be wrapped so an outage never crashes the request; every
// failure is caught here and re-thrown as a typed error the service layer
// turns into a clean problem+json response). First real exercise of DR-010's
// storage decision -- object storage = Vercel Blob, fra1.
//
// access: 'private' means the object has no public URL at all -- retrieval
// requires the same BLOB_READ_WRITE_TOKEN the server uses to upload, via the
// SDK's get(). This is what makes the Documents rule's "short-lived signed
// URL + access logging" real: nothing is ever exposed to the browser, every
// server-side fetch is auditable (service.ts logs it), and there is no
// standing public link to leak.
import { get, put } from '@vercel/blob';

export class BlobGatewayError extends Error {}

export interface UploadResult {
  pathname: string;
}

export interface DownloadResult {
  body: ReadableStream<Uint8Array>;
}

export interface BlobGateway {
  upload(pathname: string, body: Buffer, contentType: string): Promise<UploadResult>;
  download(pathname: string): Promise<DownloadResult>;
}

class VercelBlobGateway implements BlobGateway {
  async upload(pathname: string, body: Buffer, contentType: string): Promise<UploadResult> {
    try {
      const blob = await put(pathname, body, { access: 'private', addRandomSuffix: true, contentType });
      return { pathname: blob.pathname };
    } catch {
      throw new BlobGatewayError('Passport upload failed');
    }
  }

  async download(pathname: string): Promise<DownloadResult> {
    let result;
    try {
      result = await get(pathname, { access: 'private' });
    } catch {
      throw new BlobGatewayError('Passport download failed');
    }
    if (!result || !result.stream) throw new BlobGatewayError('Passport download failed');
    return { body: result.stream };
  }
}

export const blobGateway: BlobGateway = new VercelBlobGateway();
