import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { catalogService } from '@modules/catalog';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { formatOrPending } from '@lib/money';
import { PACKAGE_STATUS_TONE } from '@lib/status-tones';
import { archivePackageAction, deletePackageAction, duplicatePackageAction, updatePackageAction } from './actions';

const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

interface Props {
  params: Promise<{ packageId: string }>;
}

export default async function PackageDetailPage({ params }: Props) {
  const { packageId } = await params;
  const ctx = await requireStaffContext('catalog.read');

  let pkg;
  try {
    pkg = await catalogService.getPackage(ctx, packageId);
  } catch {
    notFound();
  }

  return (
    <div className="max-w-md">
      <div className="flex items-center gap-3">
        <PageHeader eyebrow={`Packages · ${pkg.packageReference}`} title={pkg.title} />
        <Badge tone={PACKAGE_STATUS_TONE[pkg.status]}>{pkg.status}</Badge>
      </div>

      <div className="mt-4 flex gap-3">
        <form action={duplicatePackageAction.bind(null, packageId)}>
          <SubmitButton variant="secondary" pendingLabel="Duplicating…">
            Duplicate
          </SubmitButton>
        </form>
        {pkg.status !== 'ARCHIVED' && (
          <form action={archivePackageAction.bind(null, packageId)}>
            <SubmitButton variant="secondary" pendingLabel="Archiving…">
              Archive
            </SubmitButton>
          </form>
        )}
        <form action={deletePackageAction.bind(null, packageId)}>
          <SubmitButton variant="secondary" pendingLabel="Deleting…">
            Delete
          </SubmitButton>
        </form>
      </div>

      <div className="mt-6 rounded-survey border border-rule p-4">
        <p className="text-xs text-mist">Price per seat</p>
        <p className="text-lg font-semibold text-navy">{formatOrPending(pkg.priceMinor, pkg.currency, 'Not yet priced')}</p>
        <p className="mt-1 text-xs text-mist">
          Computed by the finance module&rsquo;s cost breakdown (DR-039) -- no longer typed directly here.
        </p>
        <LinkButton href={`/staff/packages/${packageId}/cost-breakdown`} variant="secondary" size="compact" className="mt-2">
          Manage cost breakdown
        </LinkButton>
      </div>

      <form action={updatePackageAction.bind(null, packageId)} className="mt-6 space-y-4">
        <FormField label="Title" htmlFor="title">
          <input name="title" defaultValue={pkg.title} required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Description" htmlFor="description">
          <textarea
            name="description"
            defaultValue={pkg.description}
            required
            rows={4}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label="Country" htmlFor="country">
          <select name="country" defaultValue={pkg.country} required className="w-full rounded-survey border border-rule px-3 py-2">
            <option value="NA">🇳🇦 Namibia</option>
            <option value="CD">🇨🇩 DR Congo</option>
            <option value="ZM">🇿🇲 Zambia</option>
            <option value="ZW">🇿🇼 Zimbabwe</option>
          </select>
        </FormField>
        <FormField label="Currency" htmlFor="currency">
          <select name="currency" defaultValue={pkg.currency} required className="w-full rounded-survey border border-rule px-3 py-2">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="NAD">NAD</option>
            <option value="CDF">CDF</option>
          </select>
        </FormField>
        <FormField label="Duration (days)" htmlFor="durationDays" optional>
          <input
            name="durationDays"
            type="number"
            min={1}
            defaultValue={pkg.durationDays ?? ''}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <div>
          <p className="mb-1 text-sm text-mist">Tags</p>
          <div className="flex flex-wrap gap-2">
            {PACKAGE_TAGS.map((tag) => (
              <SelectableCard key={tag} type="checkbox" name="tags" value={tag} defaultChecked={pkg.tags.includes(tag)}>
                {tag}
              </SelectableCard>
            ))}
          </div>
        </div>
        <FormField label="Status" htmlFor="status">
          <select name="status" defaultValue={pkg.status} required className="w-full rounded-survey border border-rule px-3 py-2">
            <option value="DRAFT">DRAFT</option>
            <option value="PUBLISHED">PUBLISHED</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </FormField>
        <SubmitButton>Save changes</SubmitButton>
      </form>
    </div>
  );
}
