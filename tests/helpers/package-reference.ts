import { formatPackageReference } from '@modules/catalog';

/** A collision-safe throwaway package reference for test fixtures.
 * formatPackageReference() itself expects a real DB sequence value
 * (nextval) -- tests instead need a unique-enough one without touching
 * the real sequence, and used a raw Date.now() as a shortcut across ~40
 * files. That collides for real: CI runs test files in parallel, and two
 * workers reading Date.now() within the same millisecond produce the
 * identical reference, tripping the DB's `packageReference @unique`
 * constraint (real incident -- an intermittent "Unique constraint failed"
 * in whichever file lost the race, unrelated to that file's own logic).
 * A random component removes the collision risk regardless of timing. */
export function testPackageReference(): string {
  return formatPackageReference(Math.floor(Math.random() * 1e15));
}
