import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { itineraryService } from '@modules/itinerary';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { deleteSiteAction, updateSiteAction } from './actions';

interface Props {
  params: Promise<{ siteId: string }>;
}

export default async function SiteDetailPage({ params }: Props) {
  const { siteId } = await params;
  const ctx = await requireStaffContext('itinerary.write');

  let site;
  try {
    site = await itineraryService.getSite(ctx, siteId);
  } catch {
    notFound();
  }

  return (
    <div className="max-w-md space-y-8">
      <PageHeader eyebrow="Site" title={site.name} />
      <form action={updateSiteAction.bind(null, siteId)} className="space-y-4">
        <FormField label="Name" htmlFor="name">
          <input name="name" defaultValue={site.name} required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Country" htmlFor="country">
          <Select name="country" defaultValue={site.country} required>
            {COUNTRY_CODES.map((c) => (
              <option key={c.alpha2} value={c.alpha2}>
                {flagEmoji(c.alpha2)} {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <SubmitButton>Save changes</SubmitButton>
      </form>
      <form action={deleteSiteAction.bind(null, siteId)}>
        <SubmitButton variant="secondary" pendingLabel="Removing…">
          Delete site
        </SubmitButton>
      </form>
    </div>
  );
}
