import { Button } from '@/components/ui/Button';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { DESTINATION_SITES } from '@lib/destination-sites';
import { BOOKING_WIZARD_STEPS } from '../booking-wizard-steps';

const TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

const TRIP_LENGTHS = [
  { value: '', label: 'No preference' },
  { value: 'SHORT', label: 'Short (up to 5 days)' },
  { value: 'MEDIUM', label: 'Medium (6-10 days)' },
  { value: 'LONG', label: 'Long (11+ days)' },
] as const;

function titleCase(tag: string): string {
  return tag.charAt(0) + tag.slice(1).toLowerCase();
}

// A plain GET form -- no client JS, no Server Action needed. Submitting
// navigates straight to /quiz/results?country=..&tripLength=..&tags=.. ,
// same query-param-driven convention as the rest of this app's wizards.
export default function QuizPage() {
  return (
    <div className="max-w-lg">
      <StepIndicator steps={BOOKING_WIZARD_STEPS} currentIndex={0} />
      <p className="eyebrow mt-4 text-mist">Tailor my trip</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">A few questions</h1>

      <form method="get" action="/quiz/results" className="mt-6 space-y-6">
        <div>
          <label htmlFor="country" className="mb-1 block text-sm text-mist">
            Which country?
          </label>
          <select id="country" name="country" className="w-full rounded-survey border border-rule px-3 py-2">
            <option value="">No preference</option>
            <option value="NA">Namibia</option>
            <option value="CD">DR Congo</option>
          </select>
        </div>

        <div>
          <p className="mb-2 text-sm text-mist">How long?</p>
          <div className="space-y-2">
            {TRIP_LENGTHS.map(({ value, label }) => (
              <SelectableCard key={value || 'any'} type="radio" name="tripLength" value={value} defaultChecked={value === ''}>
                {label}
              </SelectableCard>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm text-mist">What matters most? (pick any)</p>
          <div className="grid grid-cols-2 gap-2">
            {TAGS.map((tag) => (
              <SelectableCard key={tag} type="checkbox" name="tags" value={tag}>
                {titleCase(tag)}
              </SelectableCard>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm text-mist">Sites you&apos;d like to visit (pick any)</p>
          <div className="grid grid-cols-2 gap-2">
            {DESTINATION_SITES.map(({ name }) => (
              <SelectableCard key={name} type="checkbox" name="sites" value={name}>
                {name}
              </SelectableCard>
            ))}
          </div>
        </div>

        <Button type="submit">Show my matches</Button>
      </form>
    </div>
  );
}
