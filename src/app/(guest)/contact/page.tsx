import Link from 'next/link';

export default function ContactPage() {
  return (
    <div className="max-w-2xl">
      <p className="eyebrow text-mist">Contact</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">Get in touch</h1>
      <p className="mt-4 text-mist">
        We&apos;re still setting up a direct contact channel here -- check back soon.
      </p>
      <p className="mt-4 text-mist">
        In the meantime, if your question is about an existing booking, try{' '}
        <Link href="/find-booking" className="text-forest hover:underline">
          Find my booking
        </Link>
        .
      </p>
    </div>
  );
}
