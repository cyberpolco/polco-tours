const TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

// A plain GET form -- no client JS, no Server Action needed. Submitting
// navigates straight to /quiz/results?country=..&tripLength=..&tags=.. ,
// same query-param-driven convention as the rest of this app's wizards.
export default function QuizPage() {
  return (
    <div className="max-w-lg">
      <p className="text-xs tracking-survey text-mist">TAILOR MY TRIP</p>
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
          <p className="mb-1 text-sm text-mist">How long?</p>
          <div className="space-y-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="tripLength" value="" defaultChecked /> No preference
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="tripLength" value="SHORT" /> Short (up to 5 days)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="tripLength" value="MEDIUM" /> Medium (6-10 days)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="tripLength" value="LONG" /> Long (11+ days)
            </label>
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm text-mist">What matters most? (pick any)</p>
          <div className="grid grid-cols-2 gap-1 text-sm">
            {TAGS.map((tag) => (
              <label key={tag} className="flex items-center gap-2">
                <input type="checkbox" name="tags" value={tag} /> {tag}
              </label>
            ))}
          </div>
        </div>

        <button type="submit" className="rounded-survey bg-amber px-5 py-2 text-sm font-semibold text-navy">
          Show my matches
        </button>
      </form>
    </div>
  );
}
