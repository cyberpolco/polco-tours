import { describe, it, expect, vi } from 'vitest';

// Simulates exactly what next.config.mjs's client-only webpack alias does
// (`config.resolve.alias.async_hooks = false`): the named import resolves
// to `undefined` in that bundle. DR-232's real production bug was that
// trusted-user-create.ts constructed `new AsyncLocalStorage()` at module
// top level, which threw the instant this module was evaluated under
// exactly this condition -- even though nothing on the client ever calls
// withTrustedUserCreate/getTrustedUserCreateSignal. This test proves the
// fix (lazy construction) survives that exact condition: merely importing
// the module must not throw when AsyncLocalStorage is undefined.
vi.mock('async_hooks', () => ({ AsyncLocalStorage: undefined }));

describe('trusted-user-create under a stubbed-out async_hooks (DR-232)', () => {
  it('importing the module does not throw even when AsyncLocalStorage is undefined', async () => {
    await expect(import('../src/lib/trusted-user-create')).resolves.toBeDefined();
  });

  it('calling withTrustedUserCreate under this condition throws only when actually invoked, not on import', async () => {
    const { withTrustedUserCreate } = await import('../src/lib/trusted-user-create');
    // This is the real, expected failure mode if genuinely called in a
    // browser context (which never happens in practice, since client code
    // never calls this) -- the point of this test is that it fails HERE,
    // on actual use, not on module load. Throws synchronously (getStorage
    // runs before any promise machinery), so this isn't a rejected promise.
    expect(() =>
      withTrustedUserCreate(
        { role: 'DRIVER', organizationId: 'org-a', mustChangePassword: true, phone: null },
        async () => 'unreachable',
      ),
    ).toThrow('AsyncLocalStorage is not a constructor');
  });
});
