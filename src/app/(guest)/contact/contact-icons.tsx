// Same hand-drawn line-icon convention as MenuGlyph.tsx -- thin strokes,
// currentColor, no icon-font/SVG-sprite dependency (charter rule 4).
function iconClassName(className?: string) {
  return ['h-5 w-5 shrink-0', className].filter(Boolean).join(' ');
}

export function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <path
        d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.5" r="2.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function MailIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 6.5 12 12.5l7.5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TicketIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <path
        d="M3.5 9.5a2 2 0 0 1 0-4h17a2 2 0 0 1 0 4 1.5 1.5 0 0 0 0 5 2 2 0 0 1 0 4h-17a2 2 0 0 1 0-4 1.5 1.5 0 0 0 0-5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 6v12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" strokeLinecap="round" />
    </svg>
  );
}

export function QuestionIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9.75 9.5a2.25 2.25 0 1 1 3.5 1.87c-.7.47-1.25.9-1.25 1.88"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.75" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function StarOutlineIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <path
        d="m12 3.5 2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.8l-5.25 2.85 1-5.85L3.5 9.65l5.9-.85Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <path
        d="M6.5 3.75h2.4l1.2 4-1.9 1.5a10.5 10.5 0 0 0 5.05 5.05l1.5-1.9 4 1.2v2.4c0 1-.85 1.8-1.85 1.7a16 16 0 0 1-13.1-13.1c-.1-1 .7-1.85 1.7-1.85Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <path d="M4.5 12h15M13.5 6.5 19 12l-5.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
