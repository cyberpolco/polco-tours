// content module — Vercel Blob gateway, public-access variant. Distinct from
// documents/gateway.ts's `access: 'private'` wrapper (passports/compliance
// docs, server-streamed, never a public URL): guest pages render a hero/
// gallery-type image directly via <img>/next/image, unauthenticated, so it
// needs a real public URL. Same charter-rule-8 wrapping (third-party
// integration failures never crash the request, always a typed error).
import { put } from '@vercel/blob';

export class ContentBlobGatewayError extends Error {}

export interface ContentImageUploadResult {
  pathname: string;
  url: string;
}

export interface ContentBlobGateway {
  uploadPublicImage(pathname: string, body: Buffer, contentType: string): Promise<ContentImageUploadResult>;
}

class VercelContentBlobGateway implements ContentBlobGateway {
  async uploadPublicImage(pathname: string, body: Buffer, contentType: string): Promise<ContentImageUploadResult> {
    try {
      const blob = await put(pathname, body, { access: 'public', addRandomSuffix: true, contentType });
      return { pathname: blob.pathname, url: blob.url };
    } catch {
      throw new ContentBlobGatewayError('Content image upload failed');
    }
  }
}

export const contentBlobGateway: ContentBlobGateway = new VercelContentBlobGateway();
