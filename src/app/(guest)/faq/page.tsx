import { cookies } from 'next/headers';
import Link from 'next/link';
import { contentService, type ContentLocale } from '@modules/content';
import { Card } from '@/components/ui/Card';
import { Reveal } from '@/components/ui/Reveal';

// DR-071: FAQ list is now DB-backed (FaqEntry) instead of a hardcoded array
// -- edited at /staff/content. Same direct-cookie-read convention as
// about/page.tsx.
async function resolveLocale(): Promise<ContentLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

export default async function FaqPage() {
  const locale = await resolveLocale();
  const faqs = await contentService.listPublicFaqEntries(locale);

  return (
    <Reveal>
      <div className="max-w-3xl">
        <p className="eyebrow text-mist">FAQ</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">Frequently asked questions</h1>
        {faqs.length === 0 ? (
          <p className="mt-6 text-mist">No questions added yet.</p>
        ) : (
          <dl className="mt-6 space-y-4">
            {faqs.map(({ id, question, answer }) => (
              <Card as="div" key={id}>
                <dt className="font-semibold text-navy">{question}</dt>
                <dd className="mt-2 text-sm text-mist">{answer}</dd>
              </Card>
            ))}
          </dl>
        )}
        <p className="mt-6 text-sm text-mist">
          Still have a question?{' '}
          <Link href="/contact" className="text-forest hover:underline">
            Get in touch
          </Link>
          .
        </p>
      </div>
    </Reveal>
  );
}
