import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Reveal } from '@/components/ui/Reveal';

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
  {
    q: 'Do I need a visa to enter Namibia?',
    a: "It depends on your nationality, and the rules changed twice in 2025 -- a number of previously visa-exempt nationalities now need an e-visa or visa-on-arrival. Always verify your specific requirement with the Namibian Ministry of Home Affairs/Immigration or your nearest Namibian embassy before you travel; we'll flag anything we can confirm on your booking, but this isn't legal guidance.",
  },
  {
    q: 'Do I need a visa to enter the DRC?',
    a: "Most visitors need a visa arranged in advance, typically through a licensed local operator (a DMC) working with DRC immigration (DGM). Requirements vary by nationality and purpose of visit, so confirm directly with the DRC embassy nearest you or your booking's operator well ahead of travel.",
  },
  {
    q: 'Is it safe to travel in the DRC?',
    a: 'It depends heavily on the region. Kinshasa and western DRC are generally accessible to visitors; some areas further east carry an elevated risk or require specialist arrangements, and a few provinces are not currently recommended for tourism at all. We only sell packages into areas our operators consider appropriate, and any current-advisory details apply at booking time -- always check your government\'s official travel advisory too.',
  },
  {
    q: 'Do I need proof of yellow fever vaccination?',
    a: "If you're arriving from (or have recently transited through) a country with a risk of yellow fever, Namibia, the DRC, Zambia, and Zimbabwe may all require proof of vaccination on entry. Malaria risk is also present in parts of each country. Check current requirements with your travel clinic or the relevant embassy before you go.",
  },
  {
    q: 'Do I need a visa to enter Zambia or Zimbabwe?',
    a: "Most visitors can get a visa on arrival or an e-visa before travel, and some nationalities are visa-exempt for short stays -- a joint KAZA UniVisa (where available) can cover both countries plus day trips across the border to Botswana. Requirements vary by nationality, so confirm directly with Zambia's or Zimbabwe's Department of Immigration, or your nearest embassy, before you travel.",
  },
] as const;

export default function FaqPage() {
  return (
    <Reveal>
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
    </Reveal>
  );
}
