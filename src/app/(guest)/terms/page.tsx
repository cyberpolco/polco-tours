import Link from 'next/link';
import { Reveal } from '@/components/ui/Reveal';

// Honest placeholder -- no trademark/business registration cleared yet
// (OI-02/03 in CLAUDE.md), so no real terms-of-service/policy text is
// fabricated here, same convention as the Contact page. Merged with the
// former standalone /policies page (privacy/cancellation/refund) into one
// page, since both were placeholders with nothing to actually keep separate
// yet -- /policies is removed entirely, not redirected (nothing else in the
// app linked to it besides the footer, updated in the same change).
export default function TermsPage() {
  return (
    <Reveal>
      <div className="max-w-2xl">
        <p className="eyebrow text-mist">Terms &amp; Policies</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">Terms of service &amp; policies</h1>
        <p className="mt-4 text-mist">
          We&apos;re still finalizing our terms of service and our privacy, cancellation, and refund policies --
          check back soon.
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
