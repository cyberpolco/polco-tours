import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { contentService, type ContentLocale } from '@modules/content';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SETTINGS_ITEMS } from '../settings-items';
import { SidebarShell } from '../sidebar-shell';
import { createFaqEntryAction, deleteFaqEntryAction, updateFaqEntryAction, updateSiteContentAction, uploadContentImageAction } from './actions';

interface Props {
  searchParams: Promise<{ locale?: string; uploadedUrl?: string; error?: string }>;
}

function DeleteButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <SubmitButton variant="secondary" size="compact" pendingLabel="Removing…">
        Remove
      </SubmitButton>
    </form>
  );
}

// Content module (DR-071) -- SUPERADMIN-only editor for the guest /about
// page text and the /faq list, replacing what used to be hardcoded JSX/TS
// literals. content.read/content.write are both never seeded to any role
// (explicit user choice), so reaching this page at all already means
// SUPERADMIN -- canWrite is computed anyway, matching the tax-rates page's
// "route passes, service still rejects" layering convention.
export default async function ContentPage({ searchParams }: Props) {
  const { locale: localeParam, uploadedUrl, error } = await searchParams;
  const locale: ContentLocale = localeParam === 'fr' ? 'fr' : 'en';
  const ctx = await requireStaffContext('content.read');
  const canWrite = ctx.roles.includes('SUPERADMIN');

  const [about, faqs] = await Promise.all([
    contentService.getSiteContent(ctx, 'about', locale),
    contentService.listFaqEntries(ctx, locale),
  ]);

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle="Settings" roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="space-y-8">
        <PageHeader eyebrow="Settings" title="Site Content" />
        <p className="text-xs text-mist">
          Editable text for the guest /about page and /faq list. English and French are independent rows, not a
          translated mirror of each other -- edit each locale on its own.
        </p>

        <div className="flex gap-2 text-sm">
          <Link
            href="/staff/content?locale=en"
            className={`rounded-pill border px-3 py-1 ${locale === 'en' ? 'border-amber bg-amber text-navy font-semibold' : 'border-rule text-ink hover:border-navy'}`}
          >
            English
          </Link>
          <Link
            href="/staff/content?locale=fr"
            className={`rounded-pill border px-3 py-1 ${locale === 'fr' ? 'border-amber bg-amber text-navy font-semibold' : 'border-rule text-ink hover:border-navy'}`}
          >
            Français
          </Link>
        </div>

        <section className="space-y-3">
          <h2 className="font-semibold text-navy">About page</h2>
          {canWrite ? (
            <form action={updateSiteContentAction} className="space-y-3">
              <input type="hidden" name="locale" value={locale} />
              <FormField label="Title" htmlFor="title">
                <input
                  name="title"
                  required
                  defaultValue={about?.title ?? ''}
                  className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
                />
              </FormField>
              <FormField label="Body" htmlFor="body">
                <textarea
                  name="body"
                  required
                  rows={8}
                  defaultValue={about?.body ?? ''}
                  className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
                />
              </FormField>
              <SubmitButton size="compact" pendingLabel="Saving…">
                Save About page
              </SubmitButton>
            </form>
          ) : (
            <p className="text-mist">{about ? about.body : 'No About content set for this locale yet.'}</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold text-navy">FAQ ({faqs.length})</h2>
          <div className="space-y-3">
            {faqs.map((f) => (
              <div key={f.id} className="rounded-card border border-rule p-4">
                {canWrite ? (
                  <form action={updateFaqEntryAction.bind(null, f.id)} className="space-y-2">
                    <input
                      name="question"
                      required
                      defaultValue={f.question}
                      className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm font-semibold"
                    />
                    <textarea
                      name="answer"
                      required
                      rows={3}
                      defaultValue={f.answer}
                      className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm"
                    />
                    <div className="flex items-end gap-3">
                      <FormField label="Order" htmlFor={`sortOrder-${f.id}`}>
                        <input
                          name="sortOrder"
                          type="number"
                          defaultValue={f.sortOrder}
                          className="w-20 rounded-survey border border-rule px-2 py-1 text-sm"
                        />
                      </FormField>
                      <SubmitButton variant="secondary" size="compact" pendingLabel="Saving…">
                        Save
                      </SubmitButton>
                      <DeleteButton action={deleteFaqEntryAction.bind(null, f.id)} />
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="font-semibold text-navy">{f.question}</p>
                    <p className="mt-1 text-sm text-mist">{f.answer}</p>
                  </>
                )}
              </div>
            ))}
          </div>
          {canWrite && (
            <form action={createFaqEntryAction} className="space-y-2 rounded-card border border-dashed border-rule p-4">
              <input type="hidden" name="locale" value={locale} />
              <FormField label="New question" htmlFor="question">
                <input name="question" required className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm" />
              </FormField>
              <FormField label="Answer" htmlFor="answer">
                <textarea name="answer" required rows={3} className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm" />
              </FormField>
              <FormField label="Order" htmlFor="sortOrder" optional>
                <input name="sortOrder" type="number" defaultValue={faqs.length} className="w-20 rounded-survey border border-rule px-2 py-1 text-sm" />
              </FormField>
              <SubmitButton size="compact" pendingLabel="Adding…">
                Add FAQ entry
              </SubmitButton>
            </form>
          )}
        </section>

        {canWrite && (
          <section className="space-y-3">
            <h2 className="font-semibold text-navy">Image upload</h2>
            <p className="text-xs text-mist">
              General-purpose upload -- returns a public URL, not yet wired to any specific page (no licensed
              destination photography exists yet). Copy the URL and use it wherever needed.
            </p>
            {uploadedUrl && (
              <div className="rounded-card border border-forest/40 bg-forest/10 p-3">
                <p className="text-xs text-mist">Uploaded:</p>
                <input readOnly value={uploadedUrl} className="mt-1 w-full rounded-survey border border-rule px-2 py-1.5 text-sm" />
              </div>
            )}
            {error === 'missing_file' && <p className="text-sm text-amber">Choose a file first.</p>}
            <form action={uploadContentImageAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="locale" value={locale} />
              <input type="file" name="file" required accept="image/jpeg,image/png,image/webp" className="text-sm" />
              <SubmitButton size="compact" pendingLabel="Uploading…">
                Upload
              </SubmitButton>
            </form>
          </section>
        )}
      </div>
    </SidebarShell>
  );
}
