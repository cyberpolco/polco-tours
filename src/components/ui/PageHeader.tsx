interface PageHeaderProps {
  eyebrow: string;
  title: string;
}

// The eyebrow + h1 pair repeated across nearly every staff detail/list page
// (and the guest flow) -- one definition instead of retyping
// `.eyebrow`/`text-2xl font-bold text-navy` at every call site.
// `animate-fade-up` (tailwind.config.ts) is a plain CSS keyframe, not
// framer-motion -- this stays a Server Component (every staff list/detail
// page renders it that way today) while still getting a real per-navigation
// entrance instead of popping in fully-formed. Neutralized globally under
// prefers-reduced-motion in globals.css.
export function PageHeader({ eyebrow, title }: PageHeaderProps) {
  return (
    <div className="animate-fade-up">
      <p className="eyebrow text-mist">{eyebrow}</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">{title}</h1>
    </div>
  );
}
