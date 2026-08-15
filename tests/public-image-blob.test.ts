import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Shared "upload a public image to Vercel Blob" primitive (DR-114,
 * extracted out of content/gateway.ts + content/domain.ts so catalog
 * module's package-image upload can reuse it). content's own blob gateway
 * had zero existing test coverage before this -- genuinely new, not moved.
 */
const { putMock } = vi.hoisted(() => ({ putMock: vi.fn() }));
vi.mock('@vercel/blob', () => ({ put: putMock }));

const {
  publicImageBlobGateway,
  PublicImageBlobGatewayError,
  isValidPublicImageUpload,
  publicImageExtension,
  MAX_PUBLIC_IMAGE_SIZE_BYTES,
} = await import('../src/lib/public-image-blob');

describe('public-image-blob (DR-114)', () => {
  beforeEach(() => {
    putMock.mockReset();
  });

  describe('publicImageBlobGateway.uploadPublicImage', () => {
    it('uploads with access: public and returns the pathname/url', async () => {
      putMock.mockResolvedValue({ pathname: 'package-images/abc.jpg', url: 'https://x.public.blob.vercel-storage.com/abc.jpg' });

      const result = await publicImageBlobGateway.uploadPublicImage('package-images/abc.jpg', Buffer.from('x'), 'image/jpeg');

      expect(result).toEqual({ pathname: 'package-images/abc.jpg', url: 'https://x.public.blob.vercel-storage.com/abc.jpg' });
      expect(putMock).toHaveBeenCalledWith(
        'package-images/abc.jpg',
        expect.any(Buffer),
        expect.objectContaining({ access: 'public', contentType: 'image/jpeg' }),
      );
    });

    it('collapses any upload failure to PublicImageBlobGatewayError', async () => {
      putMock.mockRejectedValue(new Error('network error'));

      await expect(publicImageBlobGateway.uploadPublicImage('x.jpg', Buffer.from('x'), 'image/jpeg')).rejects.toBeInstanceOf(
        PublicImageBlobGatewayError,
      );
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
});
