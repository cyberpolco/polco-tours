// One-off CLI: enters the real business-hours/support-availability text the
// operator supplied into the 'contact.general' CmsTextBlock -- the third,
// optional card on the guest /contact page (see (guest)/contact/page.tsx),
// hidden until both a title and body exist for it. Same bypass-ctx
// precedent as scripts/seed-contact-offices.ts/backfill-package-addons.ts:
// no AuthContext exists for an operator-run maintenance script, so this
// calls cmsRepository.upsertTextBlock directly rather than going through
// cmsService.updateTextBlock's ctx-gated permission check. CmsTextBlock has
// no organizationId (platform-wide content, not tenant-scoped), so no
// withOrg wrapping is needed.
//
// Idempotent: upsertTextBlock is a real upsert keyed on (key, locale), safe
// to re-run with updated values.
//
// Usage: npx tsx scripts/seed-contact-general.ts
import { prisma } from '@lib/db';
import { cmsRepository } from '@modules/cms/repository';
import { UpdateCmsTextBlockInput } from '@modules/cms/domain';

const GENERAL = {
  key: 'contact.general',
  titleByLocale: { en: 'Hours & support', fr: 'Horaires et assistance' },
  bodyByLocale: {
    en: [
      'Monday-Friday: 8am-5pm',
      'Saturday-Sunday: 9am-1pm',
      'Our phone lines and email remain available for booking-related issues or urgent matters.',
    ].join('\n'),
    fr: [
      'Lundi-vendredi : 8h-17h',
      'Samedi-dimanche : 9h-13h',
      "Nos lignes téléphoniques et notre e-mail restent disponibles pour les questions liées aux réservations ou les urgences.",
    ].join('\n'),
  },
} as const;

async function main() {
  const lam = await prisma.user.findFirst({ where: { email: 'lam@polcotours.com' }, select: { id: true } });
  if (!lam) throw new Error('Seeded Lam superadmin user not found -- run npm run db:setup first.');

  for (const locale of ['en', 'fr'] as const) {
    const input = UpdateCmsTextBlockInput.parse({
      key: GENERAL.key,
      locale,
      title: GENERAL.titleByLocale[locale],
      body: GENERAL.bodyByLocale[locale],
      eyebrow: null,
    });
    await cmsRepository.upsertTextBlock(input, lam.id);
    console.log(`Upserted ${GENERAL.key} [${locale}]`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
