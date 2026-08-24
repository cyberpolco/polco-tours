import Image from 'next/image';

// The real Mufasa Safaris & Tours badge (public/images/brand/mufasa-logo.png)
// -- white square background removed, everything else untouched. Distinct
// from BrandMark.tsx: BrandMark is a generic currentColor placeholder mark,
// still used by PartnersMarquee for a partner with no supplied logo of its
// own -- reusing this real badge there would misrepresent those partners as
// us, so the two components are kept separate on purpose.
export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/images/brand/mufasa-logo.png"
      alt="Mufasa Safaris & Tours"
      width={800}
      height={800}
      className={className}
    />
  );
}
