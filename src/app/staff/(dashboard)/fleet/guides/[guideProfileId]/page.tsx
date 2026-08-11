import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { complianceStatus, fleetService } from '@modules/fleet';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { AVAILABILITY_STATUS_TONE, COMPLIANCE_STATUS_TONE } from '@lib/status-tones';
import { deleteGuideProfileAction, updateGuideProfileAction, uploadGuideDocumentAction } from './actions';

interface Props {
  params: Promise<{ guideProfileId: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function GuideDetailPage({ params, searchParams }: Props) {
  const { guideProfileId } = await params;
  const { error } = await searchParams;
  const ctx = await requireStaffContext('fleet.read');

  let guide;
  try {
    guide = await fleetService.getGuideProfile(ctx, guideProfileId);
  } catch {
    notFound();
  }

  const [user, documents] = await Promise.all([
    authService.getUser(guide.userId),
    fleetService.listGuideDocuments(ctx, guideProfileId),
  ]);
  const now = new Date();
  const latestCertification = documents.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const status = complianceStatus(latestCertification?.expiresAt ?? null, now);
  const t = await getTranslations('StaffGuides');
  const tAvailabilityStatus = await getTranslations('AvailabilityStatusLabel');
  const tComplianceStatus = await getTranslations('ComplianceStatusLabel');

  return (
    <div className="max-w-2xl space-y-8">
      <BackLink href="/staff/fleet/guides">{t('backToFleet')}</BackLink>
      <div>
        <PageHeader eyebrow={t('detailEyebrow')} title={user?.name ?? user?.email ?? guide.userId} />
        <p className="mt-1 text-mist">{user?.email}</p>
        <p className="mt-1 text-sm text-mist">
          {t('availabilityLabel')} <Badge tone={AVAILABILITY_STATUS_TONE[guide.availability]}>{tAvailabilityStatus(guide.availability)}</Badge>
        </p>
      </div>

      <form action={updateGuideProfileAction.bind(null, guideProfileId)} className="space-y-4">
        <div className="survey-rule mb-2" />
        <FormField label={t('status')} htmlFor="status">
          <Select name="status" defaultValue={guide.status}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </Select>
        </FormField>
        <FormField label={t('languagesLabel')} htmlFor="languages" optional>
          <input
            name="languages"
            defaultValue={guide.languages.join(', ')}
            placeholder="en, fr"
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label={t('specialtiesLabel')} htmlFor="specialties" optional>
          <input
            name="specialties"
            defaultValue={guide.specialties.join(', ')}
            placeholder="wildlife, gorilla trekking"
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <SubmitButton>{t('saveChanges')}</SubmitButton>
      </form>

      <div>
        <div className="survey-rule mb-6" />
        <div className="flex items-center justify-between">
          <p className="eyebrow text-mist">{t('guideCertificationDocument')}</p>
          <Badge tone={COMPLIANCE_STATUS_TONE[status]}>{tComplianceStatus(status)}</Badge>
        </div>
        {error === 'missing_file' && (
          <div className="mt-2">
            <Alert tone="error">{t('chooseFileToUpload')}</Alert>
          </div>
        )}
        {latestCertification && (
          <p className="mt-2 text-sm text-mist">
            <a
              href={`/api/v1/fleet/guides/${guideProfileId}/documents/${latestCertification.id}`}
              className="text-forest hover:underline"
            >
              {t('downloadCurrentFile')}
            </a>
            {latestCertification.expiresAt && ` · ${t('expiresOn', { date: latestCertification.expiresAt.toLocaleDateString() })}`}
          </p>
        )}
        <form
          action={uploadGuideDocumentAction.bind(null, guideProfileId)}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <input type="file" name="file" required className="text-sm" />
          <div>
            <label className="mb-1 block text-xs text-mist">{t('expiresOnLabel')}</label>
            <input type="date" name="expiresAt" className="rounded-survey border border-rule px-2 py-1 text-sm" />
          </div>
          <SubmitButton variant="secondary" size="compact" pendingLabel={t('uploading')}>
            {t('upload')}
          </SubmitButton>
        </form>
      </div>

      {/* DR-059: SUPERADMIN-only -- see the vehicle detail page's own
          comment for why this role check (not just the route permission)
          is the real gate for rendering the control at all. */}
      {ctx.roles.includes('SUPERADMIN') && (
        <div>
          <div className="survey-rule mb-6" />
          <form action={deleteGuideProfileAction.bind(null, guideProfileId)}>
            <SubmitButton variant="secondary" pendingLabel={t('deleting')} confirmMessage={t('deleteGuideConfirm')}>
              {t('deleteGuide')}
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
