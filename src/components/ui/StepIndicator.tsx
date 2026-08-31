import { ProgressRing } from './ProgressRing';
import { WIZARD_STEP_ICONS, type WizardStepIconKey } from './wizard-step-icons';

export interface StepIndicatorStepDetail {
  label: string;
  /** One-line description of what this step collects -- 'checklist' variant
   * only, ignored by 'compact'. */
  description?: string;
  /** Selects the themed icon shown in this step's badge -- 'checklist'
   * variant only. Falls back to a plain numbered/check circle if omitted. */
  iconKey?: WizardStepIconKey;
}

type StepIndicatorStep = string | StepIndicatorStepDetail;

interface StepIndicatorProps {
  steps: StepIndicatorStep[];
  currentIndex: number;
  /** 'checklist' (the Plan My Trip + booking-wizard reference redesign:
   * icon badge + title + description for the current step, a completion
   * ring, and a themed dot row for every step) vs. the original 'compact'
   * plain numbered stepper -- default stays 'compact' so every caller that
   * hasn't opted in (the staff dashboard's own booking wizard clone) is
   * visually unaffected. */
  variant?: 'compact' | 'checklist';
}

function normalize(step: StepIndicatorStep): StepIndicatorStepDetail {
  return typeof step === 'string' ? { label: step } : step;
}

// Horizontal stepper for the actual linear checkout (Book -> Travelers ->
// Passport -> Add-ons) -- replaces the ad hoc unicode checklist that only
// existed on the booking-home page and nowhere else in the wizard.
export function StepIndicator({ steps, currentIndex, variant = 'compact' }: StepIndicatorProps) {
  const items = steps.map(normalize);

  if (variant === 'checklist') {
    return <ChecklistStepIndicator items={items} currentIndex={currentIndex} />;
  }

  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
      {items.map(({ label }, i) => {
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

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChecklistStepIndicator({ items, currentIndex }: { items: StepIndicatorStepDetail[]; currentIndex: number }) {
  const total = items.length;
  const current = items[currentIndex] ?? items[total - 1];
  const CurrentIcon = current?.iconKey ? WIZARD_STEP_ICONS[current.iconKey] : null;
  const percent = Math.round(((currentIndex + 1) / total) * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 rounded-card border border-rule bg-white/70 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber/15 p-2.5 text-amber">
            {CurrentIcon ? <CurrentIcon /> : <span className="font-mono text-sm font-bold">{currentIndex + 1}</span>}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-mist">
              {currentIndex + 1} / {total}
            </p>
            <p className="truncate font-semibold text-navy">{current?.label}</p>
            {current?.description && <p className="truncate text-sm text-mist">{current.description}</p>}
          </div>
        </div>
        <ProgressRing percent={percent} label={`${percent}%`} size={48} />
      </div>

      <ol className="flex flex-wrap gap-2">
        {items.map((item, i) => {
          const done = i < currentIndex;
          const isCurrent = i === currentIndex;
          const Icon = item.iconKey ? WIZARD_STEP_ICONS[item.iconKey] : null;
          return (
            <li key={item.label} title={item.label}>
              <span
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-full border p-1.5',
                  isCurrent
                    ? 'border-amber bg-amber text-navy'
                    : done
                      ? 'border-forest bg-forest text-bone'
                      : 'border-rule text-mist',
                ].join(' ')}
              >
                {done ? <CheckGlyph /> : Icon ? <Icon /> : <span className="text-[10px] font-semibold">{i + 1}</span>}
              </span>
              <span className="sr-only">{item.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
