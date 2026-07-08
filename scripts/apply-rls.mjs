// Applies prisma/rls.sql to the database in DIRECT_URL (or DATABASE_URL).
// Uses the Prisma-bundled connection via a child process to psql-less env by
// executing statements through @prisma/client's $executeRawUnsafe.
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const sql = readFileSync(new URL('../prisma/rls.sql', import.meta.url), 'utf8');
// Split on statement boundaries, ignoring blank lines and comment-only lines.
const statements = sql
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.split('\n').every((l) => l.trim().startsWith('--')));

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
