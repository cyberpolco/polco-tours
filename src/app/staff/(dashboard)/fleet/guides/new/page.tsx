import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { LANGUAGE_CODES, LANGUAGE_LABELS } from '@modules/fleet';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createGuideProfileAction } from './actions';

// DR-245: same controlled vocabulary as TourPackage.tags -- kept as a local
// literal tuple, same hand-duplicated-per-file convention the package setup
// pages (packages/new, packages/[packageId]) already use for PACKAGE_TAGS.
const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET', 'CAMPING', 'ADRENALINE', 'BIRDWATCHING', 'HONEYMOON', 'SELF_DRIVE'] as const;

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewGuidePage({ searchParams }: Props) {
  await requireStaffContext('fleet.write');
  const { error } = await searchParams;
  const t = await getTranslations('StaffGuides');
  const tTags = await getTranslations('TripTags');

  return (
    <div className="max-w-md">
      <BackLink href="/staff/fleet/guides">{t('backToFleet')}</BackLink>
      <PageHeader eyebrow={t('newEyebrow')} title={t('newTitle')} />
      {error === 'guide_not_found' && (
        <div className="mt-3">
          <Alert tone="error">{t('guideNotFound')}</Alert>
        </div>
      )}
      <Reveal>
        <form action={createGuideProfileAction} className="mt-6 space-y-4">
          <FormField label={t('accountEmail')} htmlFor="email">
            <input name="email" type="email" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <div>
            <p className="mb-1 text-sm text-mist">{t('languagesLabel')}</p>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_CODES.map((code) => (
                <SelectableCard key={code} type="checkbox" name="languages" value={code}>
                  {LANGUAGE_LABELS[code]}
                </SelectableCard>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm text-mist">{t('specialtiesLabel')}</p>
            <div className="flex flex-wrap gap-2">
              {PACKAGE_TAGS.map((tag) => (
                <SelectableCard key={tag} type="checkbox" name="specialties" value={tag}>
                  {tTags(tag)}
                </SelectableCard>
              ))}
            </div>
          </div>
          <SubmitButton>{t('addGuideSubmit')}</SubmitButton>
        </form>
      </Reveal>
    </div>
  );
}
