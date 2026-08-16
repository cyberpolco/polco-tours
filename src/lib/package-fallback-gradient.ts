// DR-068's "Horizon" gradient plates, factored out of PackageImage so the
// opengraph-image route can reuse the identical fallback (same package ->
// same plate) without duplicating the palette/hash logic.
export const FALLBACK_GRADIENTS = [
  'linear-gradient(155deg, #3b1f3a, #d65b2e)',
  'linear-gradient(155deg, #122b2c, #2f6e4f)',
  'linear-gradient(155deg, #12222f, #2a6b78)',
  'linear-gradient(155deg, #d65b2e, #f2b441)',
  'linear-gradient(155deg, #211a1d, #3b1f3a)',
];

export function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function fallbackGradientFor(seed: string): string {
  return FALLBACK_GRADIENTS[hashSeed(seed) % FALLBACK_GRADIENTS.length] as string;
}
