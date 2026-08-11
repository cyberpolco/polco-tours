import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { BackLink } from '@/components/ui/BackLink';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createPackageAction } from './actions';

const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

export default async function NewPackagePage() {
  await requireStaffContext('catalog.write');
  const t = await getTranslations('StaffPackages');
  const tTags = await getTranslations('TripTags');
  const tCountries = await getTranslations('Countries');

  return (
    <div className="max-w-md">
      {/* New packages start DRAFT (see createPackageAction) -- always
          Customized until explicitly published. */}
      <BackLink href="/staff/packages/customized">{t('backToCustomized')}</BackLink>
      <PageHeader eyebrow={t('newEyebrow')} title={t('newTitle')} />
      <form action={createPackageAction} className="mt-6 space-y-4">
        <FormField label={t('packageTitle')} htmlFor="title">
          <input name="title" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('description')} htmlFor="description">
          <textarea name="description" required rows={4} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('country')} htmlFor="country">
          <Select name="country" required>
            <option value="NA">🇳🇦 {tCountries('NA')}</option>
            <option value="CD">🇨🇩 {tCountries('CD')}</option>
            <option value="ZM">🇿🇲 {tCountries('ZM')}</option>
            <option value="ZW">🇿🇼 {tCountries('ZW')}</option>
          </Select>
        </FormField>
        <FormField label={t('currency')} htmlFor="currency">
          <Select name="currency" required>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="NAD">NAD</option>
            <option value="CDF">CDF</option>
          </Select>
        </FormField>
        <p className="text-xs text-mist">{t('noPriceYetNotice')}</p>
        <FormField label={t('durationDays')} htmlFor="durationDays" optional>
          <input name="durationDays" type="number" min={1} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        {/* DR-068: local asset path only (e.g. /images/packages/etosha.jpg) --
            no photography is sourced yet, so this stays empty for every
            existing package until staff add one; the guest UI falls back to
            an illustrated placeholder in the meantime. */}
        <FormField label={t('imageUrl')} htmlFor="imageUrl" optional>
          <input
            name="imageUrl"
            type="text"
            placeholder="/images/packages/example.jpg"
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <p className="text-xs text-mist">{t('durationNotice')}</p>
        <div>
          <p className="mb-1 text-sm text-mist">{t('tags')}</p>
          <div className="flex flex-wrap gap-2">
            {PACKAGE_TAGS.map((tag) => (
              <SelectableCard key={tag} type="checkbox" name="tags" value={tag}>
                {tTags(tag)}
              </SelectableCard>
            ))}
          </div>
        </div>
        <SubmitButton>{t('createPackage')}</SubmitButton>
      </form>
    </div>
  );
}
