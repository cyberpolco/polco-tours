import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import sharp from 'sharp';

/**
 * Shared "upload a public image to Vercel Blob" primitive (DR-114,
 * extracted out of content/gateway.ts + content/domain.ts so catalog
 * module's package-image upload can reuse it). content's own blob gateway
 * had zero existing test coverage before this -- genuinely new, not moved.
 *
 * DR-163: uploadPublicImage now always recompresses to webp via sharp
 * before calling put() -- these tests use a real (tiny, generated) image
 * buffer rather than an arbitrary byte string, since sharp genuinely
 * parses the input now.
 */
const { putMock } = vi.hoisted(() => ({ putMock: vi.fn() }));
vi.mock('@vercel/blob', () => ({ put: putMock }));

const {
  publicImageBlobGateway,
  PublicImageBlobGatewayError,
  PublicImageCompressionError,
  isValidPublicImageUpload,
  isTrustedPublicBlobUrl,
  publicImageExtension,
  MAX_PUBLIC_IMAGE_SIZE_BYTES,
} = await import('../src/lib/public-image-blob');

describe('public-image-blob (DR-114, DR-163)', () => {
  let realImageBuffer: Buffer;

  beforeAll(async () => {
    realImageBuffer = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } }).png().toBuffer();
  });

  beforeEach(() => {
    putMock.mockReset();
  });

  describe('publicImageBlobGateway.uploadPublicImage', () => {
    it('compresses to webp, rewrites the pathname extension, and returns the pathname/url', async () => {
      putMock.mockResolvedValue({ pathname: 'package-images/abc.webp', url: 'https://x.public.blob.vercel-storage.com/abc.webp' });

      const result = await publicImageBlobGateway.uploadPublicImage('package-images/abc.jpg', realImageBuffer, 'image/jpeg');

      expect(result).toEqual({ pathname: 'package-images/abc.webp', url: 'https://x.public.blob.vercel-storage.com/abc.webp' });
      expect(putMock).toHaveBeenCalledWith(
        'package-images/abc.webp',
        expect.any(Buffer),
        expect.objectContaining({ access: 'public', contentType: 'image/webp' }),
      );
    });

    it('collapses any upload failure to PublicImageBlobGatewayError', async () => {
      putMock.mockRejectedValue(new Error('network error'));

      await expect(publicImageBlobGateway.uploadPublicImage('x.jpg', realImageBuffer, 'image/jpeg')).rejects.toBeInstanceOf(
        PublicImageBlobGatewayError,
      );
    });

    it('rejects a malformed/corrupt image with PublicImageCompressionError, before ever calling put()', async () => {
      await expect(
        publicImageBlobGateway.uploadPublicImage('x.jpg', Buffer.from('not an image'), 'image/jpeg'),
      ).rejects.toBeInstanceOf(PublicImageCompressionError);
      expect(putMock).not.toHaveBeenCalled();
    });
  });

  describe('isValidPublicImageUpload', () => {
    it('accepts jpeg/png/webp within the size limit', () => {
      expect(isValidPublicImageUpload('image/jpeg', 1024)).toBe(true);
      expect(isValidPublicImageUpload('image/png', 1024)).toBe(true);
      expect(isValidPublicImageUpload('image/webp', 1024)).toBe(true);
    });

    it('rejects an unsupported content type', () => {
      expect(isValidPublicImageUpload('application/pdf', 1024)).toBe(false);
    });

    it('rejects a zero-byte or oversized file', () => {
      expect(isValidPublicImageUpload('image/jpeg', 0)).toBe(false);
      expect(isValidPublicImageUpload('image/jpeg', MAX_PUBLIC_IMAGE_SIZE_BYTES + 1)).toBe(false);
    });
  });

  describe('publicImageExtension', () => {
    it('maps content type to the right extension, defaulting to jpg', () => {
      expect(publicImageExtension('image/png')).toBe('png');
      expect(publicImageExtension('image/webp')).toBe('webp');
      expect(publicImageExtension('image/jpeg')).toBe('jpg');
    });
  });

  // DR-264: guards the one server-side fetch() against a client-supplied
  // URL (finalizing a direct-to-Blob raw upload) -- must reject anything
  // that isn't genuinely our own public Blob store, or this is an SSRF gate
  // with a hole in it.
  describe('isTrustedPublicBlobUrl (DR-264)', () => {
    it('accepts our own public Blob store host', () => {
      expect(isTrustedPublicBlobUrl('https://abc123.public.blob.vercel-storage.com/x.jpg')).toBe(true);
      expect(isTrustedPublicBlobUrl('https://public.blob.vercel-storage.com/x.jpg')).toBe(true);
    });

    it('rejects a different host', () => {
      expect(isTrustedPublicBlobUrl('https://evil.example.com/x.jpg')).toBe(false);
    });

    it('rejects a host merely containing the real one as a suffix trick', () => {
      expect(isTrustedPublicBlobUrl('https://public.blob.vercel-storage.com.evil.com/x.jpg')).toBe(false);
    });

    it('rejects non-https', () => {
      expect(isTrustedPublicBlobUrl('http://abc123.public.blob.vercel-storage.com/x.jpg')).toBe(false);
    });

    it('rejects a malformed URL', () => {
      expect(isTrustedPublicBlobUrl('not-a-url')).toBe(false);
    });
  });
});
