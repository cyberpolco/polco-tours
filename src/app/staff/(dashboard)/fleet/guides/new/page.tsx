import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createGuideProfileAction } from './actions';

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewGuidePage({ searchParams }: Props) {
  await requireStaffContext('fleet.write');
  const { error } = await searchParams;
  const t = await getTranslations('StaffGuides');

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
          <FormField label={t('languagesLabel')} htmlFor="languages" optional>
            <input name="languages" placeholder="en, fr" className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={t('specialtiesLabel')} htmlFor="specialties" optional>
            <input
              name="specialties"
              placeholder="wildlife, gorilla trekking"
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <SubmitButton>{t('addGuideSubmit')}</SubmitButton>
        </form>
      </Reveal>
    </div>
  );
}
