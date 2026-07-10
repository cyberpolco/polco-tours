interface PageHeaderProps {
  eyebrow: string;
  title: string;
}

// The eyebrow + h1 pair repeated across nearly every staff detail/list page
// (and the guest flow) -- one definition instead of retyping
// `.eyebrow`/`text-2xl font-bold text-navy` at every call site.
export function PageHeader({ eyebrow, title }: PageHeaderProps) {
  return (
    <div>
      <p className="eyebrow text-mist">{eyebrow}</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">{title}</h1>
    </div>
  );
}
