import type { CmsTextBlockView } from '@modules/cms';
import { FormField } from '@/components/ui/FormField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { updatePageTextAction } from './actions';

interface PageTextEditorProps {
  cmsKey: string;
  locale: string;
  current: CmsTextBlockView | null;
  canWrite: boolean;
  sectionTitle: string;
  eyebrowLabel: string;
  titleLabel: string;
  /** Required unless `showBody` is false. */
  bodyLabel?: string;
  savingLabel: string;
  saveLabel: string;
  /** Contact's two office blocks have no natural "eyebrow" -- hidden there. */
  showEyebrow?: boolean;
  /** The Managing Director person block (about.md.person) dropped its own
   * quote -- name/role still need editing, but there's nothing left for
   * body to hold. Submits the existing/empty value via a hidden input
   * instead (UpdateCmsTextBlockInput.body still requires a non-empty
   * string), rather than reworking that shared schema for one caller. */
  showBody?: boolean;
  /** Body is a multi-line textarea by default; Contact's offices use it
   * for free-text address/email/phone, same control either way. */
  bodyRows?: number;
  /** 'url' renders body as a single-line `<input type="url">` (native
   * browser validation) instead of the default free-text textarea --
   * footer.legal's link href, the one body value that must actually be a
   * URL rather than arbitrary prose. */
  bodyType?: 'text' | 'url';
  /** Overrides the default updatePageTextAction.bind(null, cmsKey) --
   * footer.legal uses its own action for stricter server-side URL
   * validation on body (charter rule 1: never trust client-side
   * `type="url"` alone). */
  formAction?: (formData: FormData) => Promise<void>;
}

// Generic eyebrow/title/body editor reused across every "thin" guest page
// (Packages, Plan my trip, Find booking, Contact + its two office blocks,
// Rate, Weather, Terms) -- one component, one Server Action
// (updatePageTextAction.bind(null, cmsKey)), instead of 9 near-identical
// hand-written forms. Read-only fallback (canWrite=false) mirrors the
// About section's own convention.
export function PageTextEditor({
  cmsKey,
  locale,
  current,
  canWrite,
  sectionTitle,
  eyebrowLabel,
  titleLabel,
  bodyLabel,
  savingLabel,
  saveLabel,
  showEyebrow = true,
  showBody = true,
  bodyRows = 3,
  bodyType = 'text',
  formAction,
}: PageTextEditorProps) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-navy">{sectionTitle}</h2>
      {canWrite ? (
        <form action={formAction ?? updatePageTextAction.bind(null, cmsKey)} className="space-y-3">
          <input type="hidden" name="locale" value={locale} />
          {showEyebrow && (
            <FormField label={eyebrowLabel} htmlFor={`eyebrow-${cmsKey}`}>
              <input
                name="eyebrow"
                defaultValue={current?.eyebrow ?? ''}
                className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
              />
            </FormField>
          )}
          <FormField label={titleLabel} htmlFor={`title-${cmsKey}`}>
            <input
              name="title"
              required
              defaultValue={current?.title ?? ''}
              className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
            />
          </FormField>
          {showBody ? (
            <FormField label={bodyLabel ?? ''} htmlFor={`body-${cmsKey}`}>
              {bodyType === 'url' ? (
                <input
                  type="url"
                  name="body"
                  required
                  defaultValue={current?.body ?? ''}
                  className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
                />
              ) : (
                <textarea
                  name="body"
                  required
                  rows={bodyRows}
                  defaultValue={current?.body ?? ''}
                  className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
                />
              )}
            </FormField>
          ) : (
            <input type="hidden" name="body" value={current?.body || '—'} />
          )}
          <SubmitButton size="compact" pendingLabel={savingLabel}>
            {saveLabel}
          </SubmitButton>
        </form>
      ) : (
        <>
          <p className="font-semibold text-navy">{current?.title ?? ''}</p>
          {showBody && <p className="mt-1 text-sm text-mist">{current?.body ?? ''}</p>}
        </>
      )}
    </section>
  );
}
