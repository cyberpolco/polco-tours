// Applies prisma/rls.sql to the database in DIRECT_URL (or DATABASE_URL).
// Uses the Prisma-bundled connection via a child process to psql-less env by
// executing statements through @prisma/client's $executeRawUnsafe.
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const sql = readFileSync(new URL('../prisma/rls.sql', import.meta.url), 'utf8');
// Strip `--` comments BEFORE splitting on ';' — a semicolon inside a comment
// (e.g. "without FORCE, owners bypass RLS.") would otherwise break the naive
// split and get sent to Postgres as a stray statement. See CLAUDE.md gotchas.
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
  console.log(`Applied ${statements.length} RLS statements.`);
} catch (err) {
  console.error('Failed to apply RLS:', err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
