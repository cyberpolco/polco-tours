import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { OPERATING_COUNTRY_CODES } from '@lib/country-codes';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { Select } from '@/components/ui/Select';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createPackageAction } from './actions';

const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;
const COUNTRY_FLAGS: Record<string, string> = { NA: '🇳🇦', CD: '🇨🇩', ZM: '🇿🇲', ZW: '🇿🇼' };

interface Props {
  searchParams: Promise<{ error?: string; detail?: string }>;
}

export default async function NewPackagePage({ searchParams }: Props) {
  await requireStaffContext('catalog.write');
  const { error, detail } = await searchParams;
  const t = await getTranslations('StaffPackages');
  const tTags = await getTranslations('TripTags');
  const tCountries = await getTranslations('Countries');

  // DR-115: uploadPackageImage/createPackage can throw a real, expected
  // ApiError (bad file type/size, a Blob failure) -- surfaced here via
  // ?error=&detail= (see actions.ts) rather than crashing to Next's generic
  // error page, same convention as the edit page.
  const ERROR_MESSAGES: Record<string, string> = {
    'validation-failed': t('errorValidation'),
    internal: t('errorInternal'),
  };

  return (
    <div className="max-w-md">
      {/* New packages start DRAFT (see createPackageAction) -- always
          Customized until explicitly published. */}
      <BackLink href="/staff/packages/customized">{t('backToCustomized')}</BackLink>
      <PageHeader eyebrow={t('newEyebrow')} title={t('newTitle')} />
      {error && (
        <div className="mt-4">
          <Alert tone="error">
            {ERROR_MESSAGES[error] ?? t('errorGeneric')}
            {detail ? ` (${detail})` : ''}
          </Alert>
        </div>
      )}
      <Reveal>
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
        {/* DR-114: the primary country above still drives tax/finance-rate
            resolution unchanged -- this just adds any OTHER countries a
            combo package also visits (display/filtering only). Checking the
            same country as the primary above is harmless (the action
            de-duplicates). */}
        <div>
          <p className="mb-1 text-sm text-mist">{t('alsoVisits')}</p>
          <div className="flex flex-wrap gap-2">
            {OPERATING_COUNTRY_CODES.map((code) => (
              <SelectableCard key={code} type="checkbox" name="additionalCountries" value={code}>
                {COUNTRY_FLAGS[code]} {tCountries(code)}
              </SelectableCard>
            ))}
          </div>
        </div>
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
        {/* DR-114: staff upload a real file (catalogService.uploadPackageImage,
            Vercel Blob public) instead of pasting a URL -- optional, the
            guest UI falls back to an illustrated placeholder until one is set. */}
        <FormField label={t('image')} htmlFor="image" optional>
          <input
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="w-full rounded-survey border border-rule px-3 py-2 file:mr-3 file:rounded-pill file:border-0 file:bg-navy file:px-3 file:py-1 file:text-sm file:text-bone"
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
      </Reveal>
    </div>
  );
}
