import { redirect } from 'next/navigation';
import { requireGuestContext } from '@lib/guest-guard';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { bookingService } from '@modules/booking';
import { addTravelerAction } from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
}

export default async function NewTravelerPage({ params }: Props) {
  const { bookingId } = await params;
  const ctx = await requireGuestContext();
  const [booking, travelers] = await Promise.all([
    bookingService.getById(ctx, bookingId),
    bookingService.listTravelers(ctx, bookingId),
  ]);

  if (travelers.length >= booking.seats) {
    redirect(`/booking/${bookingId}/passport`);
  }

  const hasTourLead = travelers.some((t) => t.isTourLead);
  const travelerNumber = travelers.length + 1;

  return (
    <div className="max-w-lg">
      <p className="text-xs tracking-survey text-mist">BOOKING SETUP · TRAVELERS</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">
        Traveler {travelerNumber} of {booking.seats}
      </h1>
      <p className="mt-1 text-sm text-mist">
        {travelers.length} of {booking.seats} entered
      </p>

      <form action={addTravelerAction.bind(null, bookingId)} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="mb-1 block text-sm text-mist">
              First name
            </label>
            <input id="firstName" name="firstName" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </div>
          <div>
            <label htmlFor="lastName" className="mb-1 block text-sm text-mist">
              Last name
            </label>
            <input id="lastName" name="lastName" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="age" className="mb-1 block text-sm text-mist">
              Age
            </label>
            <input
              id="age"
              name="age"
              type="number"
              min={0}
              max={120}
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="sex" className="mb-1 block text-sm text-mist">
              Sex
            </label>
            <select id="sex" name="sex" required className="w-full rounded-survey border border-rule px-3 py-2">
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="X">X</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="nationality" className="mb-1 block text-sm text-mist">
            Nationality
          </label>
          <select id="nationality" name="nationality" required className="w-full rounded-survey border border-rule px-3 py-2">
            {COUNTRY_CODES.map((c) => (
              <option key={c.alpha2} value={c.alpha2}>
                {flagEmoji(c.alpha2)} {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="idOrPassportNumber" className="mb-1 block text-sm text-mist">
            ID / passport number
          </label>
          <input
            id="idOrPassportNumber"
            name="idOrPassportNumber"
            required
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </div>

        <div>
          <p className="mb-1 block text-sm text-mist">Phone (optional)</p>
          <div className="flex gap-2">
            <select name="dialCode" defaultValue="264" className="rounded-survey border border-rule px-2 py-2">
              {COUNTRY_CODES.map((c) => (
                <option key={c.alpha2} value={c.dialCode}>
                  {flagEmoji(c.alpha2)} +{c.dialCode}
                </option>
              ))}
            </select>
            <input
              name="localNumber"
              type="tel"
              placeholder="81 234 5678"
              className="flex-1 rounded-survey border border-rule px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label htmlFor="disabilities" className="mb-1 block text-sm text-mist">
            Disabilities (optional)
          </label>
          <input id="disabilities" name="disabilities" className="w-full rounded-survey border border-rule px-3 py-2" />
        </div>

        <div>
          <label htmlFor="allergies" className="mb-1 block text-sm text-mist">
            Allergies (optional)
          </label>
          <input id="allergies" name="allergies" className="w-full rounded-survey border border-rule px-3 py-2" />
        </div>

        <div>
          <label htmlFor="drinkPreference" className="mb-1 block text-sm text-mist">
            Drink preference (optional)
          </label>
          <input id="drinkPreference" name="drinkPreference" className="w-full rounded-survey border border-rule px-3 py-2" />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="isTourLead" defaultChecked={!hasTourLead} disabled={hasTourLead} />
          Tour lead (uploads the group&apos;s passport)
        </label>

        <button type="submit" className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
          {travelerNumber === booking.seats ? 'Finish travelers' : 'Add traveler & continue'}
        </button>
      </form>
    </div>
  );
}
