import Link from 'next/link';

// Honest placeholder -- no trademark/business registration cleared yet
// (OI-02/03 in CLAUDE.md), so no real terms-of-service text is fabricated
// here, same convention as the Contact page.
export default function TermsPage() {
  return (
    <div className="max-w-2xl">
      <p className="eyebrow text-mist">Terms</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">Terms of service</h1>
      <p className="mt-4 text-mist">We&apos;re still finalizing this -- check back soon.</p>
      <p className="mt-4 text-mist">
        Questions in the meantime?{' '}
        <Link href="/contact" className="text-forest hover:underline">
          Get in touch
        </Link>
        .
      </p>
    </div>
  );
}
