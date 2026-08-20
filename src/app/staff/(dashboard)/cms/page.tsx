import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { cmsService, type CmsLocale } from '@modules/cms';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal, RevealGroup } from '@/components/ui/Reveal';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SETTINGS_ITEMS } from '../settings-items';
import { SidebarShell } from '../sidebar-shell';
import {
  createFaqEntryAction,
  createHeroSlideAction,
  deleteFaqEntryAction,
  deleteHeroSlideAction,
  updateFaqEntryAction,
  updateHeroSlideMetaAction,
  updateHeroSlideTextAction,
  updateTextBlockAction,
  uploadCmsImageAction,
} from './actions';
import { HeroSlideMediaPicker } from './hero-slide-media-picker';

interface Props {
  searchParams: Promise<{ locale?: string; uploadedUrl?: string; error?: string }>;
}

function DeleteButton({
  action,
  removingLabel,
  removeConfirm,
  removeLabel,
}: {
  action: () => Promise<void>;
  removingLabel: string;
  removeConfirm: string;
  removeLabel: string;
}) {
  return (
    <form action={action}>
      <SubmitButton variant="secondary" size="compact" pendingLabel={removingLabel} confirmMessage={removeConfirm}>
        {removeLabel}
      </SubmitButton>
    </form>
  );
}

// cms module (DR-071, renamed from `content` in DR-162) -- SUPERADMIN-only
// editor for the guest /about page text and the /faq list, replacing what
// used to be hardcoded JSX/TS literals. cms.read/cms.write are both never
// seeded to any role (explicit user choice), so reaching this page at all
// already means SUPERADMIN -- canWrite is computed anyway, matching the
// tax-rates page's "route passes, service still rejects" layering convention.
export default async function CmsPage({ searchParams }: Props) {
  const { locale: localeParam, uploadedUrl, error } = await searchParams;
  const locale: CmsLocale = localeParam === 'fr' ? 'fr' : 'en';
  const ctx = await requireStaffContext('cms.read');
  const canWrite = ctx.roles.includes('SUPERADMIN');

  const [about, faqs, heroItems] = await Promise.all([
    cmsService.getTextBlock(ctx, 'about', locale),
    cmsService.listFaqEntries(ctx, locale),
    cmsService.listMediaItems(ctx, 'home-hero'),
  ]);
  const heroTexts = await Promise.all(heroItems.map((item) => cmsService.getTextBlock(ctx, `home-hero.${item.slotKey}`, locale)));
  const t = await getTranslations('StaffCms');
  const tSidebar = await getTranslations('StaffSettingsSidebar');

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle={tSidebar('sectionTitle')} roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="space-y-8">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
        <Reveal className="space-y-8">
        <p className="text-xs text-mist">{t('intro')}</p>

        <div className="flex gap-2 text-sm">
          <Link
            href="/staff/cms?locale=en"
            className={`rounded-pill border px-3 py-1 ${locale === 'en' ? 'border-amber bg-amber text-navy font-semibold' : 'border-rule text-ink hover:border-navy'}`}
          >
            {t('english')}
          </Link>
          <Link
            href="/staff/cms?locale=fr"
            className={`rounded-pill border px-3 py-1 ${locale === 'fr' ? 'border-amber bg-amber text-navy font-semibold' : 'border-rule text-ink hover:border-navy'}`}
          >
            {t('french')}
          </Link>
        </div>

        <section className="space-y-3">
          <h2 className="font-semibold text-navy">{t('aboutPage')}</h2>
          {canWrite ? (
            <form action={updateTextBlockAction} className="space-y-3">
              <input type="hidden" name="locale" value={locale} />
              <FormField label={t('aboutTitle')} htmlFor="title">
                <input
                  name="title"
                  required
                  defaultValue={about?.title ?? ''}
                  className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
                />
              </FormField>
              <FormField label={t('aboutBody')} htmlFor="body">
                <textarea
                  name="body"
                  required
                  rows={8}
                  defaultValue={about?.body ?? ''}
                  className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
                />
              </FormField>
              <SubmitButton size="compact" pendingLabel={t('saving')}>
                {t('saveAboutPage')}
              </SubmitButton>
            </form>
          ) : (
            <p className="text-mist">{about ? about.body : t('noAboutContent')}</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold text-navy">{t('faqCount', { count: faqs.length })}</h2>
          <RevealGroup as="div" itemAs="div" className="space-y-3">
            {faqs.map((f) => (
              <Card key={f.id}>
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
                      <FormField label={t('order')} htmlFor={`sortOrder-${f.id}`}>
                        <input
                          name="sortOrder"
                          type="number"
                          defaultValue={f.sortOrder}
                          className="w-20 rounded-survey border border-rule px-2 py-1 text-sm"
                        />
                      </FormField>
                      <SubmitButton variant="secondary" size="compact" pendingLabel={t('saving')}>
                        {t('save')}
                      </SubmitButton>
                      <DeleteButton
                        action={deleteFaqEntryAction.bind(null, f.id)}
                        removingLabel={t('removing')}
                        removeConfirm={t('removeFaqConfirm')}
                        removeLabel={t('remove')}
                      />
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="font-semibold text-navy">{f.question}</p>
                    <p className="mt-1 text-sm text-mist">{f.answer}</p>
                  </>
                )}
              </Card>
            ))}
          </RevealGroup>
          {canWrite && (
            <form action={createFaqEntryAction} className="space-y-2 rounded-card border border-dashed border-rule p-4">
              <input type="hidden" name="locale" value={locale} />
              <FormField label={t('newQuestion')} htmlFor="question">
                <input name="question" required className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm" />
              </FormField>
              <FormField label={t('answer')} htmlFor="answer">
                <textarea name="answer" required rows={3} className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm" />
              </FormField>
              <FormField label={t('order')} htmlFor="sortOrder" optional>
                <input name="sortOrder" type="number" defaultValue={faqs.length} className="w-20 rounded-survey border border-rule px-2 py-1 text-sm" />
              </FormField>
              <SubmitButton size="compact" pendingLabel={t('adding')}>
                {t('addFaqEntry')}
              </SubmitButton>
            </form>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold text-navy">{t('heroSectionTitle')}</h2>
          <p className="text-xs text-mist">{t('heroIntro')}</p>
          <RevealGroup as="div" itemAs="div" className="space-y-4">
            {heroItems.map((item, i) => {
              const text = heroTexts[i];
              return (
                <Card key={item.slotKey}>
                  {canWrite ? (
                    <div className="space-y-3">
                      <form action={updateHeroSlideTextAction.bind(null, item.slotKey)} className="space-y-2">
                        <input type="hidden" name="locale" value={locale} />
                        <FormField label={t('eyebrowLabel')} htmlFor={`eyebrow-${item.slotKey}`}>
                          <input
                            name="eyebrow"
                            defaultValue={text?.eyebrow ?? ''}
                            className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm"
                          />
                        </FormField>
                        <FormField label={t('headlineLabel')} htmlFor={`headline-${item.slotKey}`}>
                          <input
                            name="headline"
                            required
                            defaultValue={text?.title ?? ''}
                            className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm font-semibold"
                          />
                        </FormField>
                        <FormField label={t('ledeLabel')} htmlFor={`lede-${item.slotKey}`}>
                          <textarea
                            name="lede"
                            required
                            rows={2}
                            defaultValue={text?.body ?? ''}
                            className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm"
                          />
                        </FormField>
                        <SubmitButton variant="secondary" size="compact" pendingLabel={t('saving')}>
                          {t('save')}
                        </SubmitButton>
                      </form>

                      <form action={updateHeroSlideMetaAction.bind(null, item.slotKey)} className="flex flex-wrap items-end gap-3">
                        <FormField label={t('gradientLabel')} htmlFor={`gradient-${item.slotKey}`}>
                          <input
                            name="overlayGradient"
                            defaultValue={item.overlayGradient ?? ''}
                            className="w-72 rounded-survey border border-rule px-2 py-1.5 text-xs"
                          />
                        </FormField>
                        <FormField label={t('order')} htmlFor={`sortOrder-${item.slotKey}`}>
                          <input
                            name="sortOrder"
                            type="number"
                            defaultValue={item.sortOrder}
                            className="w-20 rounded-survey border border-rule px-2 py-1 text-sm"
                          />
                        </FormField>
                        <SubmitButton variant="secondary" size="compact" pendingLabel={t('saving')}>
                          {t('save')}
                        </SubmitButton>
                      </form>

                      <div className="flex flex-wrap items-start gap-4">
                        <div className="space-y-1">
                          <p className="text-xs text-mist">{t('mediaLabel')}</p>
                          {item.mediaType === 'image' && item.url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- staff preview only, arbitrary Blob URL
                            <img src={item.url} alt="" className="h-20 w-32 rounded-survey object-cover" />
                          ) : item.mediaType === 'video' && item.url ? (
                            <video src={item.url} muted className="h-20 w-32 rounded-survey object-cover" />
                          ) : (
                            <p className="text-xs text-mist">{t('noMediaYet')}</p>
                          )}
                        </div>
                        <HeroSlideMediaPicker
                          slotKey={item.slotKey}
                          uploadingLabel={t('uploadingMedia')}
                          chooseFileLabel={t('chooseMediaFile')}
                          errorLabel={t('mediaUploadError')}
                        />
                      </div>

                      <DeleteButton
                        action={deleteHeroSlideAction.bind(null, item.slotKey)}
                        removingLabel={t('removing')}
                        removeConfirm={t('removeSlideConfirm')}
                        removeLabel={t('removeSlide')}
                      />
                    </div>
                  ) : (
                    <>
                      <p className="font-semibold text-navy">{text?.title ?? ''}</p>
                      <p className="mt-1 text-sm text-mist">{text?.body ?? ''}</p>
                    </>
                  )}
                </Card>
              );
            })}
          </RevealGroup>
          {canWrite && (
            <form action={createHeroSlideAction}>
              <SubmitButton size="compact" pendingLabel={t('adding')}>
                {t('addSlide')}
              </SubmitButton>
            </form>
          )}
        </section>

        {canWrite && (
          <section className="space-y-3">
            <h2 className="font-semibold text-navy">{t('imageUpload')}</h2>
            <p className="text-xs text-mist">{t('imageUploadNotice')}</p>
            {uploadedUrl && (
              <div className="rounded-card border border-forest/40 bg-forest/10 p-3">
                <p className="text-xs text-mist">{t('uploaded')}</p>
                <input readOnly value={uploadedUrl} className="mt-1 w-full rounded-survey border border-rule px-2 py-1.5 text-sm" />
              </div>
            )}
            {error === 'missing_file' && <p className="text-sm text-amber">{t('chooseFileFirst')}</p>}
            <form action={uploadCmsImageAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="locale" value={locale} />
              <input type="file" name="file" required accept="image/jpeg,image/png,image/webp" className="text-sm" />
              <SubmitButton size="compact" pendingLabel={t('uploading')}>
                {t('upload')}
              </SubmitButton>
            </form>
          </section>
        )}
        </Reveal>
      </div>
    </SidebarShell>
  );
}
