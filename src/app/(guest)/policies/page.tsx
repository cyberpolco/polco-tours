import Link from 'next/link';
import { Reveal } from '@/components/ui/Reveal';

// Honest placeholder -- no trademark/business registration cleared yet
// (OI-02/03 in CLAUDE.md), so no real policy text is fabricated here, same
// convention as the Contact page.
export default function PoliciesPage() {
  return (
    <Reveal>
      <div className="max-w-2xl">
        <p className="eyebrow text-mist">Policies</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">Policies</h1>
        <p className="mt-4 text-mist">
          We&apos;re still finalizing our privacy, cancellation, and refund policies -- check back soon.
        </p>
        <p className="mt-4 text-mist">
          Questions in the meantime?{' '}
          <Link href="/contact" className="text-forest hover:underline">
            Get in touch
          </Link>
          .
        </p>
      </div>
    </Reveal>
  );
}
