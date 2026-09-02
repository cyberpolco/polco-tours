import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { catalogService } from '@modules/catalog';
import { flagEmoji, OPERATING_COUNTRY_CODES } from '@lib/country-codes';
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

interface Props {
  searchParams: Promise<{ error?: string; detail?: string }>;
}

export default async function NewPackagePage({ searchParams }: Props) {
  const ctx = await requireStaffContext('catalog.write');
  const { error, detail } = await searchParams;
  const t = await getTranslations('StaffPackages');
  const tTags = await getTranslations('TripTags');
  const tCountries = await getTranslations('Countries');
  // DR-180: which add-ons this package offers on the guest site -- a
  // curated subset of the org's active add-ons, not all of them by default.
  const addons = await catalogService.listActiveAddonServices(ctx);

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
            {OPERATING_COUNTRY_CODES.map((code) => (
              <option key={code} value={code}>
                {flagEmoji(code)} {tCountries(code)}
              </option>
            ))}
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
                {flagEmoji(code)} {tCountries(code)}
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
        {/* DR-114: staff upload real files (catalogService.uploadPackageImage,
            Vercel Blob public) instead of pasting a URL -- optional, the
            guest UI falls back to an illustrated placeholder until any are
            set. DR-172: up to 3, selected together via `multiple` -- shown
            as a slideshow on the guest package card, in the order uploaded. */}
        <FormField label={t('image')} htmlFor="images" optional>
          <input
            name="images"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="w-full rounded-survey border border-rule px-3 py-2 file:mr-3 file:rounded-pill file:border-0 file:bg-navy file:px-3 file:py-1 file:text-sm file:text-bone"
          />
        </FormField>
        <p className="text-xs text-mist">{t('imagesHint')}</p>
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
        {/* DR-180: staff pick exactly which add-ons this package offers on
            the guest site -- previously every org-active add-on showed up
            for every package uniformly. Leaving all boxes unchecked means
            this package offers no add-ons at all, not "show everything." */}
        <div>
          <p className="mb-1 text-sm text-mist">{t('addons')}</p>
          {addons.length === 0 ? (
            <p className="text-xs text-mist">{t('noAddonsAvailable')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {addons.map((addon) => (
                <SelectableCard key={addon.id} type="checkbox" name="addonServiceId" value={addon.id}>
                  {addon.name}
                </SelectableCard>
              ))}
            </div>
          )}
        </div>
        <SubmitButton>{t('createPackage')}</SubmitButton>
      </form>
      </Reveal>
    </div>
  );
}
