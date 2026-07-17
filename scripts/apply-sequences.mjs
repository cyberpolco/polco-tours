// Applies prisma/sequences.sql to the database in DIRECT_URL (or
// DATABASE_URL). Same pattern as apply-rls.mjs -- strips `--` comments
// before splitting on ';' so a semicolon inside a comment can't break the
// naive split (see CLAUDE.md gotchas).
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const sql = readFileSync(new URL('../prisma/sequences.sql', import.meta.url), 'utf8');
const withoutComments = sql
  .split('\n')
  .map((line) => {
    const idx = line.indexOf('--');
    return idx === -1 ? line : line.slice(0, idx);
  })
  .join('\n');

const statements = withoutComments
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const prisma = new PrismaClient();
try {
  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
  }
  console.log(`Applied ${statements.length} sequence statements.`);
} catch (err) {
  console.error('Failed to apply sequences:', err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
