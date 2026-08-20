import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '../src/modules/auth';
import { ApiError } from '../src/lib/errors';

/**
 * uploadPackageImage (DR-114) touches no Prisma table of its own -- it's a
 * permission check + validation + gateway call, so this is a pure unit test
 * with a fake AuthContext, no DB needed. Mocks @lib/public-image-blob the
 * same way tests/api/booking-setup.api.test.ts mocks @modules/documents/gateway
 * (deterministic, doesn't depend on a real Vercel Blob token).
 */
const { uploadPublicImageMock, PublicImageBlobGatewayErrorForTest, PublicImageCompressionErrorForTest } = vi.hoisted(() => {
  class PublicImageBlobGatewayErrorForTest extends Error {}
  class PublicImageCompressionErrorForTest extends Error {}
  return {
    uploadPublicImageMock: vi.fn(),
    PublicImageBlobGatewayErrorForTest,
    PublicImageCompressionErrorForTest,
  };
});
vi.mock('@lib/public-image-blob', () => ({
  PublicImageBlobGatewayError: PublicImageBlobGatewayErrorForTest,
  // DR-163: catalog/service.ts now also checks `instanceof
  // PublicImageCompressionError` (a malformed image, mapped to a
  // validation error rather than internal) -- must exist on this mock or
  // that instanceof check throws.
  PublicImageCompressionError: PublicImageCompressionErrorForTest,
  publicImageBlobGateway: { uploadPublicImage: uploadPublicImageMock },
  isValidPublicImageUpload: (contentType: string, sizeBytes: number) =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(contentType) && sizeBytes > 0 && sizeBytes <= 5 * 1024 * 1024,
  publicImageExtension: (contentType: string) => (contentType === 'image/png' ? 'png' : 'jpg'),
}));

const { catalogService } = await import('../src/modules/catalog/service');

function ctxWith(permissions: string[]): AuthContext {
  return {
    userId: 'staff-1',
    roles: ['TOUR_OPERATOR'],
    permissions: new Set(permissions) as ReadonlySet<AuthContext['permissions'] extends ReadonlySet<infer P> ? P : never>,
    organizationId: 'org-1',
    sessionId: 'session-1',
    mustChangePassword: false,
  };
}

describe('catalogService.uploadPackageImage (DR-114)', () => {
  beforeEach(() => {
    uploadPublicImageMock.mockReset();
  });

  it('rejects a caller without catalog.write', async () => {
    // assertCan (rbac.ts) throws a plain Error ("FORBIDDEN: ..."), not an
    // ApiError -- same convention asserted in tests/booking-delete.test.ts.
    const ctx = ctxWith([]);
    const err = await catalogService
      .uploadPackageImage(ctx, { contentType: 'image/jpeg', sizeBytes: 1024, bytes: Buffer.from('x') })
      .catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/FORBIDDEN/);
    expect(uploadPublicImageMock).not.toHaveBeenCalled();
  });

  it('rejects an unsupported content type without calling the gateway', async () => {
    const ctx = ctxWith(['catalog.write']);
    await expect(
      catalogService.uploadPackageImage(ctx, { contentType: 'application/pdf', sizeBytes: 1024, bytes: Buffer.from('x') }),
    ).rejects.toMatchObject({ status: 422 });
    expect(uploadPublicImageMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized file without calling the gateway', async () => {
    const ctx = ctxWith(['catalog.write']);
    await expect(
      catalogService.uploadPackageImage(ctx, {
        contentType: 'image/jpeg',
        sizeBytes: 6 * 1024 * 1024,
        bytes: Buffer.from('x'),
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(uploadPublicImageMock).not.toHaveBeenCalled();
  });

  it('uploads via the shared gateway and returns its URL', async () => {
    const ctx = ctxWith(['catalog.write']);
    uploadPublicImageMock.mockResolvedValue({ pathname: 'package-images/abc.jpg', url: 'https://example.public.blob.vercel-storage.com/abc.jpg' });

    const result = await catalogService.uploadPackageImage(ctx, {
      contentType: 'image/jpeg',
      sizeBytes: 1024,
      bytes: Buffer.from('x'),
    });

    expect(result.url).toBe('https://example.public.blob.vercel-storage.com/abc.jpg');
    expect(uploadPublicImageMock).toHaveBeenCalledOnce();
  });

  it('collapses a gateway failure to Errors.internal(), never leaking the raw error', async () => {
    const ctx = ctxWith(['catalog.write']);
    uploadPublicImageMock.mockRejectedValue(new PublicImageBlobGatewayErrorForTest('upload failed'));

    await expect(
      catalogService.uploadPackageImage(ctx, { contentType: 'image/jpeg', sizeBytes: 1024, bytes: Buffer.from('x') }),
    ).rejects.toMatchObject({ status: 500, slug: 'internal' });
  });

  it('maps a malformed-image compression failure to a validation error, not internal (DR-163)', async () => {
    const ctx = ctxWith(['catalog.write']);
    uploadPublicImageMock.mockRejectedValue(new PublicImageCompressionErrorForTest('Unable to process image'));

    await expect(
      catalogService.uploadPackageImage(ctx, { contentType: 'image/jpeg', sizeBytes: 1024, bytes: Buffer.from('x') }),
    ).rejects.toMatchObject({ status: 422, slug: 'validation-failed' });
  });
});
