// Shared kernel: turns a human-typed title into a URL-safe slug. Used by
// catalog/repository.ts to give every TourPackage a personalized public URL
// segment (DR-118) generated once at creation time from its title -- never
// regenerated on a later title edit, so a published package's URL stays
// stable (no link rot / broken bookmarks or SEO backlinks).
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents (e.g. "é" -> "e")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}
