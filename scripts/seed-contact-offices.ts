// One-off CLI: enters the real Namibia + DRC office address/email/phone
// into the two CmsTextBlock rows the guest /contact page already reads
// (keys 'contact.office.namibia'/'contact.office.drc', DR-164/staff-editable
// at /staff/cms) -- this was operator-supplied data pasted directly by the
// user, run once rather than typed by hand into the staff form. No
// AuthContext exists for an operator-run maintenance script, so this
// bypasses cmsService.updateTextBlock's ctx-gated permission check and
// calls cmsRepository.upsertTextBlock directly with the same input shape
// (same precedent as scripts/backfill-package-addons.ts). CmsTextBlock has
// no organizationId (platform-wide content, not tenant-scoped), so no
// withOrg wrapping is needed.
//
// Body text (address/email/phone) isn't language-specific, so the same
// string is written for both locale rows -- only the office label (title)
// differs, matching (guest)/contact/page.tsx's existing EN/FR fallback
// labels. Idempotent: upsertTextBlock is a real upsert keyed on
// (key, locale), safe to re-run with updated values.
//
// Usage: npx tsx scripts/seed-contact-offices.ts
import { prisma } from '@lib/db';
import { cmsRepository } from '@modules/cms/repository';
import { UpdateCmsTextBlockInput } from '@modules/cms/domain';

const OFFICES = [
  {
    key: 'contact.office.namibia',
    titleByLocale: { en: 'Namibia office', fr: 'Bureau de Namibie' },
    body: ['233 Virgin Island', 'info@mufasasafaris.com', '+264 81 27 23 921'].join('\n'),
  },
  {
    key: 'contact.office.drc',
    titleByLocale: { en: 'DR Congo office', fr: 'Bureau de RDC' },
    body: ['17 Avenue Belgique, Commune de Diulu, Mbujimayi', 'info@cyberpolco.com', '+243 82 811 77 10'].join('\n'),
  },
] as const;

async function main() {
  const lam = await prisma.user.findFirst({ where: { email: 'lam@polcotours.com' }, select: { id: true } });
  if (!lam) throw new Error('Seeded Lam superadmin user not found -- run npm run db:setup first.');

  for (const office of OFFICES) {
    for (const locale of ['en', 'fr'] as const) {
      const input = UpdateCmsTextBlockInput.parse({
        key: office.key,
        locale,
        title: office.titleByLocale[locale],
        body: office.body,
        eyebrow: null,
      });
      await cmsRepository.upsertTextBlock(input, lam.id);
      console.log(`Upserted ${office.key} [${locale}]`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
