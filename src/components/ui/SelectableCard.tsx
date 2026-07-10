import type { InputHTMLAttributes } from 'react';

interface SelectableCardProps extends InputHTMLAttributes<HTMLInputElement> {
  type: 'radio' | 'checkbox';
  children: React.ReactNode;
}

// Styled label wrapping a native radio/checkbox -- the whole row is the
// click target (generalizing the add-ons page's already-good pattern), and
// the checked/disabled look uses Tailwind's has-[:checked] variant, so no
// client JS is needed just to restyle a native input.
export function SelectableCard({ type, children, className, ...inputProps }: SelectableCardProps) {
  return (
    <label
      className={[
        'flex cursor-pointer items-center gap-3 rounded-survey border border-rule px-3 py-2 text-sm',
        'has-[:checked]:border-amber has-[:checked]:bg-amber/10',
        'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <input type={type} className="h-4 w-4 accent-amber" {...inputProps} />
      {children}
    </label>
  );
}
