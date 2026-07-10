interface StepIndicatorProps {
  steps: string[];
  currentIndex: number;
}

// Horizontal stepper for the actual linear checkout (Book -> Travelers ->
// Passport -> Add-ons) -- replaces the ad hoc unicode checklist that only
// existed on the booking-home page and nowhere else in the wizard.
export function StepIndicator({ steps, currentIndex }: StepIndicatorProps) {
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
      {steps.map((label, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <li key={label} className={`flex items-center gap-2 ${current ? 'text-navy' : done ? 'text-forest' : 'text-mist'}`}>
            <span
              className={[
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                current ? 'border-amber bg-amber text-navy' : done ? 'border-forest bg-forest text-bone' : 'border-rule text-mist',
              ].join(' ')}
            >
              {done ? '✓' : i + 1}
            </span>
            <span className={current ? 'font-semibold' : ''}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
