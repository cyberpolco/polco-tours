import { getTranslations } from 'next-intl/server';
import type { CmsAboutEntryView, CmsAboutSection, CmsLocale } from '@modules/cms';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createAboutEntryAction, deleteAboutEntryAction, updateAboutEntryAction } from './actions';

// DR-256: one editor for all three of the /about page's repeating lists,
// since add/edit/remove/reorder is identical across them -- only which
// fields are shown differs, and that follows from the section itself
// (see CmsAboutEntry's own schema comment for which columns each uses).
// Unlike PageTextEditor this reads its own labels rather than taking ~15
// label props, because they vary per section rather than per instance.
interface AboutListEditorProps {
  section: CmsAboutSection;
  entries: CmsAboutEntryView[];
  locale: CmsLocale;
  canWrite: boolean;
}

const INPUT = 'w-full rounded-survey border border-rule px-2 py-1.5 text-sm';

// Literal keys, not a template string -- next-intl resolves message keys at
// type level, and a computed one silently degrades to an untyped lookup.
const SECTION_TITLE_KEY = {
  stat: 'aboutStatsSectionTitle',
  timeline: 'aboutTimelineSectionTitle',
  value: 'aboutValuesSectionTitle',
} as const;

export async function AboutListEditor({ section, entries, locale, canWrite }: AboutListEditorProps) {
  const t = await getTranslations('StaffCms');
  const showMarker = section === 'timeline';
  const showNumber = section === 'stat';
  const showBody = section !== 'stat';

  const headingLabel = showNumber ? t('aboutStatLabelLabel') : t('aboutEntryHeadingLabel');
  const bodyLabel = showMarker ? t('aboutTimelineBodyLabel') : t('aboutValueBodyLabel');

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-navy">{t(SECTION_TITLE_KEY[section])}</h2>
      <p className="text-xs text-mist">{t('aboutListIntro')}</p>

      {entries.length === 0 && <p className="text-xs text-mist">{t('aboutListEmpty')}</p>}

      <div className="space-y-3">
        {entries.map((entry) => (
          <Card key={entry.slotKey}>
            {canWrite ? (
              <div className="space-y-3">
                <form action={updateAboutEntryAction.bind(null, section, entry.slotKey)} className="space-y-2">
                  <input type="hidden" name="locale" value={locale} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {showMarker && (
                      <FormField label={t('aboutTimelineMarkerLabel')} htmlFor={`marker-${entry.slotKey}`}>
                        <input name="marker" defaultValue={entry.marker ?? ''} className={INPUT} />
                      </FormField>
                    )}
                    <FormField label={headingLabel} htmlFor={`heading-${entry.slotKey}`}>
                      <input name="heading" required defaultValue={entry.heading} className={INPUT} />
                    </FormField>
                  </div>

                  {showBody && (
                    <FormField label={bodyLabel} htmlFor={`body-${entry.slotKey}`}>
                      <textarea name="body" rows={2} defaultValue={entry.body ?? ''} className={INPUT} />
                    </FormField>
                  )}

                  {showNumber && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <FormField label={t('aboutStatValueLabel')} htmlFor={`numericValue-${entry.slotKey}`}>
                        <input
                          name="numericValue"
                          type="number"
                          min={0}
                          defaultValue={entry.numericValue ?? ''}
                          className={INPUT}
                        />
                      </FormField>
                      <FormField label={t('aboutStatPrefixLabel')} htmlFor={`prefix-${entry.slotKey}`}>
                        <input name="prefix" maxLength={4} defaultValue={entry.prefix ?? ''} className={INPUT} />
                      </FormField>
                      <FormField label={t('aboutStatSuffixLabel')} htmlFor={`suffix-${entry.slotKey}`}>
                        <input name="suffix" maxLength={4} defaultValue={entry.suffix ?? ''} className={INPUT} />
                      </FormField>
                    </div>
                  )}

                  <div className="flex flex-wrap items-end gap-4">
                    <FormField label={t('order')} htmlFor={`sortOrder-${entry.slotKey}`}>
                      <input name="sortOrder" type="number" defaultValue={entry.sortOrder} className="w-20 rounded-survey border border-rule px-2 py-1 text-sm" />
                    </FormField>
                    {showNumber && (
                      <label className="flex items-center gap-2 pb-1.5 text-sm text-ink">
                        <input type="checkbox" name="animate" defaultChecked={entry.animate} className="h-4 w-4" />
                        {t('aboutStatAnimateLabel')}
                      </label>
                    )}
                    <SubmitButton variant="secondary" size="compact" pendingLabel={t('saving')}>
                      {t('save')}
                    </SubmitButton>
                  </div>
                </form>

                <form action={deleteAboutEntryAction.bind(null, section, entry.slotKey)}>
                  <SubmitButton
                    variant="secondary"
                    size="compact"
                    pendingLabel={t('removing')}
                    confirmMessage={t('aboutEntryRemoveConfirm')}
                  >
                    {t('aboutEntryRemove')}
                  </SubmitButton>
                </form>
              </div>
            ) : (
              <>
                <p className="font-semibold text-navy">
                  {entry.marker ? `${entry.marker} · ` : ''}
                  {entry.numericValue !== null ? `${entry.prefix ?? ''}${entry.numericValue}${entry.suffix ?? ''} · ` : ''}
                  {entry.heading}
                </p>
                {entry.body && <p className="mt-1 text-sm text-mist">{entry.body}</p>}
              </>
            )}
          </Card>
        ))}
      </div>

      {canWrite && (
        <Card>
          {/* Creating writes one row per locale under a single slotKey, so
              this only asks for the minimum to identify the entry -- the
              rest, and the other language, are filled in above. */}
          <form action={createAboutEntryAction.bind(null, section)} className="space-y-2">
            <input type="hidden" name="locale" value={locale} />
            <div className="grid gap-2 sm:grid-cols-2">
              {showMarker && (
                <FormField label={t('aboutTimelineMarkerLabel')} htmlFor={`new-marker-${section}`}>
                  <input name="marker" className={INPUT} />
                </FormField>
              )}
              <FormField label={headingLabel} htmlFor={`new-heading-${section}`}>
                <input name="heading" required className={INPUT} />
              </FormField>
              {showNumber && (
                <FormField label={t('aboutStatValueLabel')} htmlFor={`new-numericValue-${section}`}>
                  <input name="numericValue" type="number" min={0} className={INPUT} />
                </FormField>
              )}
            </div>
            <SubmitButton size="compact" pendingLabel={t('adding')}>
              {t('aboutEntryAdd')}
            </SubmitButton>
          </form>
        </Card>
      )}
    </section>
  );
}
