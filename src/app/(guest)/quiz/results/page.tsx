import Link from 'next/link';
import type { PackageTag } from '@prisma/client';
import { catalogService, type QuizAnswers } from '@modules/catalog';
import { PackageCard } from '../../package-card';

interface Props {
  searchParams: Promise<{ country?: string; tripLength?: string; tags?: string | string[] }>;
}

const VALID_TAGS: readonly string[] = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'];

export default async function QuizResultsPage({ searchParams }: Props) {
  const raw = await searchParams;
  const rawTags = raw.tags ? (Array.isArray(raw.tags) ? raw.tags : [raw.tags]) : [];

  // Lenient, query-param-driven parse (same convention as the rest of this
  // app's GET-form/query-string pages) -- no zod validation error page for a
  // malformed or empty quiz submission, just falls back to "no preference".
  const answers: QuizAnswers = {
    country: raw.country || undefined,
    tripLength: raw.tripLength === 'SHORT' || raw.tripLength === 'MEDIUM' || raw.tripLength === 'LONG' ? raw.tripLength : undefined,
    tags: rawTags.filter((t): t is PackageTag => VALID_TAGS.includes(t)),
  };

  const results = await catalogService.getQuizResults(answers);

  return (
    <div>
      <Link href="/quiz" className="text-sm text-forest hover:underline">
        ← retake the quiz
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-navy">Your matches</h1>

      {results.length === 0 ? (
        <p className="mt-6 text-mist">
          Nothing matched exactly -- try{' '}
          <Link href="/packages" className="text-forest hover:underline">
            browsing everything
          </Link>{' '}
          instead.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {results.map((p) => (
            <PackageCard key={p.id} pkg={p} />
          ))}
        </ul>
      )}
    </div>
  );
}
