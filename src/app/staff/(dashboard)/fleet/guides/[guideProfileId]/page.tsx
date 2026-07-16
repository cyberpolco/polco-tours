import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { complianceStatus, fleetService } from '@modules/fleet';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { COMPLIANCE_STATUS_TONE } from '@lib/status-tones';
import { updateGuideProfileAction, uploadGuideDocumentAction } from './actions';

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

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <PageHeader eyebrow="Guide" title={user?.name ?? user?.email ?? guide.userId} />
        <p className="mt-1 text-mist">{user?.email}</p>
      </div>

      <form action={updateGuideProfileAction.bind(null, guideProfileId)} className="space-y-4">
        <div className="survey-rule mb-2" />
        <FormField label="Status" htmlFor="status">
          <select name="status" defaultValue={guide.status} className="w-full rounded-survey border border-rule px-3 py-2">
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </select>
        </FormField>
        <FormField label="Languages (ISO-639-1 codes, comma-separated, e.g. en, fr)" htmlFor="languages" optional>
          <input
            name="languages"
            defaultValue={guide.languages.join(', ')}
            placeholder="en, fr"
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label="Specialties (comma-separated, e.g. wildlife, cultural)" htmlFor="specialties" optional>
          <input
            name="specialties"
            defaultValue={guide.specialties.join(', ')}
            placeholder="wildlife, gorilla trekking"
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <SubmitButton>Save changes</SubmitButton>
      </form>

      <div>
        <div className="survey-rule mb-6" />
        <div className="flex items-center justify-between">
          <p className="eyebrow text-mist">Guide certification document</p>
          <Badge tone={COMPLIANCE_STATUS_TONE[status]}>{status}</Badge>
        </div>
        {error === 'missing_file' && (
          <div className="mt-2">
            <Alert tone="error">Choose a file to upload.</Alert>
          </div>
        )}
        {latestCertification && (
          <p className="mt-2 text-sm text-mist">
            <a
              href={`/api/v1/fleet/guides/${guideProfileId}/documents/${latestCertification.id}`}
              className="text-forest hover:underline"
            >
              Download current file
            </a>
            {latestCertification.expiresAt && ` · expires ${latestCertification.expiresAt.toLocaleDateString()}`}
          </p>
        )}
        <form
          action={uploadGuideDocumentAction.bind(null, guideProfileId)}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <input type="file" name="file" required className="text-sm" />
          <div>
            <label className="mb-1 block text-xs text-mist">Expires on</label>
            <input type="date" name="expiresAt" className="rounded-survey border border-rule px-2 py-1 text-sm" />
          </div>
          <SubmitButton variant="secondary" size="compact" pendingLabel="Uploading…">
            Upload
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
