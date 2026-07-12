import Link from 'next/link';
import { Card } from '@/components/ui/Card';

// Structurally real (two offices, address/email/phone/social rows) but the
// actual values are honest placeholders -- no cleared trademark/business
// registration yet (OI-02/03 in CLAUDE.md), so no fabricated specifics.
const OFFICES = [
  {
    country: 'Namibia',
    address: 'Address -- coming soon',
    email: 'Email -- coming soon',
    phone: 'Phone -- coming soon',
  },
  {
    country: 'DR Congo',
    address: 'Address -- coming soon',
    email: 'Email -- coming soon',
    phone: 'Phone -- coming soon',
  },
] as const;

export default function ContactPage() {
  return (
    <div className="max-w-2xl">
      <p className="eyebrow text-mist">Contact</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">Get in touch</h1>
      <p className="mt-4 text-mist">Reach either of our offices below -- full details are on their way.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {OFFICES.map((office) => (
          <Card as="div" key={office.country}>
            <p className="eyebrow text-mist">{office.country} office</p>
            <dl className="mt-3 space-y-1 text-sm text-mist">
              <div>
                <dt className="sr-only">Address</dt>
                <dd>{office.address}</dd>
              </div>
              <div>
                <dt className="sr-only">Email</dt>
                <dd>{office.email}</dd>
              </div>
              <div>
                <dt className="sr-only">Phone</dt>
                <dd>{office.phone}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-mist">
        Social channels are coming soon too -- in the meantime, if your question is about an existing
        booking, try{' '}
        <Link href="/find-booking" className="text-forest hover:underline">
          Find my booking
        </Link>
        .
      </p>
    </div>
  );
}
