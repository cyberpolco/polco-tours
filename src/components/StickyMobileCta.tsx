import { LinkButton } from '@/components/ui/Button';

// DR-068: a persistent bottom CTA bar, mobile-only (sm:hidden) -- the
// hero's own CTAs scroll out of view quickly on a small screen, so this
// keeps "Browse packages" one tap away no matter how far down the guest
// has scrolled. No JS/interactivity needed (always visible, not
// scroll-triggered), so this stays a plain Server Component.
interface StickyMobileCtaProps {
  href: string;
  label: string;
}

export function StickyMobileCta({ href, label }: StickyMobileCtaProps) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-bone/95 px-4 pt-3 backdrop-blur sm:hidden"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <LinkButton href={href} className="flex w-full">
        {label}
      </LinkButton>
    </div>
  );
}
