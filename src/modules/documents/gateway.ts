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
import { get, head, put } from '@vercel/blob';

export class BlobGatewayError extends Error {}

export interface UploadResult {
  pathname: string;
}

export interface DownloadResult {
  body: ReadableStream<Uint8Array>;
}

export interface InspectResult {
  pathname: string;
  contentType: string;
  sizeBytes: number;
}

export interface BlobGateway {
  upload(pathname: string, body: Buffer, contentType: string): Promise<UploadResult>;
  download(pathname: string): Promise<DownloadResult>;
  /** DR-257: the real content type + size of an object the BROWSER uploaded
   * directly (see api/v1/documents/passport-upload). The client hands back a
   * pathname it could have lied about, so the file's own metadata is read
   * from the store rather than trusted from the request. */
  inspect(pathname: string): Promise<InspectResult>;
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

  async inspect(pathname: string): Promise<InspectResult> {
    let result;
    try {
      result = await head(pathname);
    } catch {
      throw new BlobGatewayError('Passport lookup failed');
    }
    if (!result) throw new BlobGatewayError('Passport lookup failed');
    return { pathname: result.pathname, contentType: result.contentType, sizeBytes: result.size };
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
