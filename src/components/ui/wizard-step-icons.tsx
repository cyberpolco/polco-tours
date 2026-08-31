// Hand-drawn line icons for the guest booking wizards' step checklist
// (Plan My Trip + the direct-package-booking flow) -- same thin-stroke,
// currentColor, no-icon-library convention as BrandMark.tsx/contact-icons.tsx
// (charter rule 4: no new dependency for decorative art). One semantic key
// per step concept, shared across both wizards where the concept repeats
// (travelers, addOns) rather than duplicating near-identical icons.
function iconClassName(className?: string) {
  return ['h-full w-full', className].filter(Boolean).join(' ');
}

function DestinationIcon({ className }: { className?: string }) {
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

function DatesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8.25" cy="13.25" r="0.9" fill="currentColor" />
      <circle cx="12" cy="13.25" r="0.9" fill="currentColor" />
      <circle cx="8.25" cy="16.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

function TravelersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <circle cx="9" cy="8.5" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.75 19c.5-3.4 2.6-5 5.25-5s4.75 1.6 5.25 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16.5" cy="7.75" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14.75 19c.35-2.55 1.75-4 3.9-4.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PreferencesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <path
        d="M12 20s-7.5-4.6-9.4-9.3C1.5 7.7 3.3 5 6.3 5c2 0 3.4 1.1 4.2 2.4h3c.8-1.3 2.2-2.4 4.2-2.4 3 0 4.8 2.7 3.7 5.7C19.5 15.4 12 20 12 20Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SitesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <path d="m3.5 18 5.5-9 3.2 4.8L14.5 10l6 8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="16.5" cy="6" r="1.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 18.5h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TripNotesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <path d="M5.5 3.5h9L19 8v12.5a1 1 0 0 1-1 1h-12.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14.5 3.5V8H19" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.5 12.5h9M7.5 16h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AddonsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <path d="M8.5 6.5 9.8 4h4.4l1.3 2.5H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="12" cy="12.5" r="3.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function SpecialRequestsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <path
        d="M4 5.5h16v10.5a1 1 0 0 1-1 1H9l-4 3.5v-3.5H5a1 1 0 0 1-1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="8.25" cy="10.75" r="0.9" fill="currentColor" />
      <circle cx="12" cy="10.75" r="0.9" fill="currentColor" />
      <circle cx="15.75" cy="10.75" r="0.9" fill="currentColor" />
    </svg>
  );
}

function ContactIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 6.5 12 12.5l7.5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function YourDetailsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 19.5c.7-4.3 3.3-6.5 7.5-6.5s6.8 2.2 7.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PassportIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <rect x="5.5" y="3" width="13" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.5 15.5h7M9.5 18h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ConfirmPayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClassName(className)} aria-hidden="true">
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 9.5h19" stroke="currentColor" strokeWidth="1.5" />
      <path d="m14.5 15.25 1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const WIZARD_STEP_ICONS = {
  destination: DestinationIcon,
  dates: DatesIcon,
  travelers: TravelersIcon,
  preferences: PreferencesIcon,
  sites: SitesIcon,
  tripNotes: TripNotesIcon,
  addOns: AddonsIcon,
  specialRequests: SpecialRequestsIcon,
  contact: ContactIcon,
  yourDetails: YourDetailsIcon,
  passport: PassportIcon,
  confirmPay: ConfirmPayIcon,
} as const;

export type WizardStepIconKey = keyof typeof WIZARD_STEP_ICONS;
