import Link from 'next/link';
import { Card } from '@/components/ui/Card';

const FAQS = [
  {
    q: 'Do I need to create an account?',
    a: 'No. You book as a guest -- pick a departure, add your travelers, and pay a deposit, all without a password. You get a reference code afterward to check on your booking any time.',
  },
  {
    q: 'How do I pay?',
    a: "You'll see a deposit (40%) and a balance (60%) on your booking page. Click \"Pay deposit\" or \"Pay balance\" when you're ready -- our team confirms the payment by hand right now, so it may take a little time to show as complete.",
  },
  {
    q: "I lost my booking's page -- how do I find it again?",
    a: 'Use "Find my booking" with your reference code and the tour lead\'s last name.',
  },
  {
    q: 'What do I need to have ready to book?',
    a: "Each traveler's name, age, sex, and nationality, plus the tour lead's passport. Add-on services (if any) are selected during the same booking flow.",
  },
  {
    q: 'What currency will I pay in?',
    a: 'It depends on the package -- prices are shown in the currency the package is listed in (USD, EUR, NAD, or CDF) and we do not convert between currencies.',
  },
] as const;

export default function FaqPage() {
  return (
    <div className="max-w-2xl">
      <p className="eyebrow text-mist">FAQ</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">Frequently asked questions</h1>
      <dl className="mt-6 space-y-4">
        {FAQS.map(({ q, a }) => (
          <Card as="div" key={q}>
            <dt className="font-semibold text-navy">{q}</dt>
            <dd className="mt-2 text-sm text-mist">{a}</dd>
          </Card>
        ))}
      </dl>
      <p className="mt-6 text-sm text-mist">
        Still have a question?{' '}
        <Link href="/contact" className="text-forest hover:underline">
          Get in touch
        </Link>
        .
      </p>
    </div>
  );
}
