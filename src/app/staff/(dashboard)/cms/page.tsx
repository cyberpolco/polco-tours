import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { cmsService, type CmsLocale } from '@modules/cms';
import { DESTINATION_SITES } from '@lib/destination-sites';
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
import { MediaPicker } from './media-picker';
import { PageTextEditor } from './page-text-editor';

interface Props {
  searchParams: Promise<{ locale?: string; uploadedUrl?: string; error?: string; tab?: string }>;
}

// Nav+footer order (DR-164) -- each tab's label key already exists (section
// headings), except `faq` (its heading is a dynamic "FAQ ({count})", not a
// plain label) and `media` (the generic image-upload utility, reusing its
// existing section heading key).
const CMS_TABS = [
  { key: 'home-hero', labelKey: 'heroSectionTitle' },
  { key: 'packages', labelKey: 'packagesSectionTitle' },
  { key: 'plan-my-trip', labelKey: 'planMyTripSectionTitle' },
  { key: 'gallery', labelKey: 'gallerySectionTitle' },
  { key: 'find-booking', labelKey: 'findBookingSectionTitle' },
  { key: 'about', labelKey: 'aboutPage' },
  { key: 'faq', labelKey: 'faqSectionTitle' },
  { key: 'contact', labelKey: 'contactSectionTitle' },
  { key: 'rate', labelKey: 'rateSectionTitle' },
  { key: 'weather', labelKey: 'weatherSectionTitle' },
  { key: 'terms', labelKey: 'termsSectionTitle' },
  { key: 'media', labelKey: 'imageUpload' },
] as const;
type CmsTabKey = (typeof CMS_TABS)[number]['key'];
const CMS_TAB_KEYS: readonly string[] = CMS_TABS.map((tabDef) => tabDef.key);

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
  const { locale: localeParam, uploadedUrl, error, tab: tabParam } = await searchParams;
  const locale: CmsLocale = localeParam === 'fr' ? 'fr' : 'en';
  const activeTab: CmsTabKey = (tabParam && CMS_TAB_KEYS.includes(tabParam) ? tabParam : 'home-hero') as CmsTabKey;
  const ctx = await requireStaffContext('cms.read');
  const canWrite = ctx.roles.includes('SUPERADMIN');

  const [
    about,
    faqs,
    heroItems,
    packagesText,
    planMyTripText,
    findBookingText,
    contactText,
    officeNamibiaText,
    officeDrcText,
    rateText,
    weatherText,
    termsText,
    galleryItems,
  ] = await Promise.all([
    cmsService.getTextBlock(ctx, 'about', locale),
    cmsService.listFaqEntries(ctx, locale),
    cmsService.listMediaItems(ctx, 'home-hero'),
    cmsService.getTextBlock(ctx, 'packages', locale),
    cmsService.getTextBlock(ctx, 'plan-my-trip', locale),
    cmsService.getTextBlock(ctx, 'find-booking', locale),
    cmsService.getTextBlock(ctx, 'contact', locale),
    cmsService.getTextBlock(ctx, 'contact.office.namibia', locale),
    cmsService.getTextBlock(ctx, 'contact.office.drc', locale),
    cmsService.getTextBlock(ctx, 'rate', locale),
    cmsService.getTextBlock(ctx, 'weather', locale),
    cmsService.getTextBlock(ctx, 'terms', locale),
    cmsService.listMediaItems(ctx, 'gallery'),
  ]);
  const heroTexts = await Promise.all(heroItems.map((item) => cmsService.getTextBlock(ctx, `home-hero.${item.slotKey}`, locale)));
  const galleryBySite = new Map(galleryItems.map((item) => [item.slotKey, item]));
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
            href={`/staff/cms?locale=en&tab=${activeTab}`}
            className={`rounded-pill border px-3 py-1 ${locale === 'en' ? 'border-amber bg-amber text-navy font-semibold' : 'border-rule text-ink hover:border-navy'}`}
          >
            {t('english')}
          </Link>
          <Link
            href={`/staff/cms?locale=fr&tab=${activeTab}`}
            className={`rounded-pill border px-3 py-1 ${locale === 'fr' ? 'border-amber bg-amber text-navy font-semibold' : 'border-rule text-ink hover:border-navy'}`}
          >
            {t('french')}
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-rule pb-4 text-sm">
          {CMS_TABS.map((tabDef) => (
            <Link
              key={tabDef.key}
              href={`/staff/cms?locale=${locale}&tab=${tabDef.key}`}
              className={`rounded-pill border px-3 py-1 ${activeTab === tabDef.key ? 'border-amber bg-amber text-navy font-semibold' : 'border-rule text-ink hover:border-navy'}`}
            >
              {t(tabDef.labelKey)}
            </Link>
          ))}
        </div>

        {activeTab === 'home-hero' && (
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
                        <MediaPicker
                          page="home-hero"
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
        )}

        {activeTab === 'packages' && (
        <PageTextEditor
          cmsKey="packages"
          locale={locale}
          current={packagesText}
          canWrite={canWrite}
          sectionTitle={t('packagesSectionTitle')}
          eyebrowLabel={t('eyebrowLabel')}
          titleLabel={t('pageTitleLabel')}
          bodyLabel={t('pageBodyLabel')}
          savingLabel={t('saving')}
          saveLabel={t('save')}
        />
        )}

        {activeTab === 'plan-my-trip' && (
        <PageTextEditor
          cmsKey="plan-my-trip"
          locale={locale}
          current={planMyTripText}
          canWrite={canWrite}
          sectionTitle={t('planMyTripSectionTitle')}
          eyebrowLabel={t('eyebrowLabel')}
          titleLabel={t('pageTitleLabel')}
          bodyLabel={t('pageBodyLabel')}
          savingLabel={t('saving')}
          saveLabel={t('save')}
        />
        )}

        {activeTab === 'gallery' && (
        <section className="space-y-3">
          <h2 className="font-semibold text-navy">{t('gallerySectionTitle')}</h2>
          <p className="text-xs text-mist">{t('galleryIntro')}</p>
          <RevealGroup as="div" itemAs="div" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DESTINATION_SITES.map((site) => {
              const media = galleryBySite.get(site.name);
              return (
                <Card key={site.name}>
                  <p className="font-semibold text-navy">{site.name}</p>
                  <div className="mt-2 flex flex-wrap items-start gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-mist">{t('mediaLabel')}</p>
                      {media?.mediaType === 'image' && media.url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- staff preview only, arbitrary Blob URL
                        <img src={media.url} alt="" className="h-20 w-32 rounded-survey object-cover" />
                      ) : media?.mediaType === 'video' && media.url ? (
                        <video src={media.url} muted className="h-20 w-32 rounded-survey object-cover" />
                      ) : (
                        <p className="text-xs text-mist">{t('noMediaYet')}</p>
                      )}
                    </div>
                    {canWrite && (
                      <MediaPicker
                        page="gallery"
                        slotKey={site.name}
                        uploadingLabel={t('uploadingMedia')}
                        chooseFileLabel={t('chooseMediaFile')}
                        errorLabel={t('mediaUploadError')}
                      />
                    )}
                  </div>
                </Card>
              );
            })}
          </RevealGroup>
        </section>
        )}

        {activeTab === 'find-booking' && (
        <PageTextEditor
          cmsKey="find-booking"
          locale={locale}
          current={findBookingText}
          canWrite={canWrite}
          sectionTitle={t('findBookingSectionTitle')}
          eyebrowLabel={t('eyebrowLabel')}
          titleLabel={t('pageTitleLabel')}
          bodyLabel={t('pageBodyLabel')}
          savingLabel={t('saving')}
          saveLabel={t('save')}
        />
        )}

        {activeTab === 'about' && (
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
        )}

        {activeTab === 'faq' && (
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
        )}

        {activeTab === 'contact' && (
        <>
        <PageTextEditor
          cmsKey="contact"
          locale={locale}
          current={contactText}
          canWrite={canWrite}
          sectionTitle={t('contactSectionTitle')}
          eyebrowLabel={t('eyebrowLabel')}
          titleLabel={t('pageTitleLabel')}
          bodyLabel={t('pageBodyLabel')}
          savingLabel={t('saving')}
          saveLabel={t('save')}
        />

        <PageTextEditor
          cmsKey="contact.office.namibia"
          locale={locale}
          current={officeNamibiaText}
          canWrite={canWrite}
          sectionTitle={t('officeNamibiaLabel')}
          eyebrowLabel=""
          showEyebrow={false}
          titleLabel={t('officeLabelFieldLabel')}
          bodyLabel={t('officeDetailsFieldLabel')}
          savingLabel={t('saving')}
          saveLabel={t('save')}
        />

        <PageTextEditor
          cmsKey="contact.office.drc"
          locale={locale}
          current={officeDrcText}
          canWrite={canWrite}
          sectionTitle={t('officeDrcLabel')}
          eyebrowLabel=""
          showEyebrow={false}
          titleLabel={t('officeLabelFieldLabel')}
          bodyLabel={t('officeDetailsFieldLabel')}
          savingLabel={t('saving')}
          saveLabel={t('save')}
        />
        </>
        )}

        {activeTab === 'rate' && (
        <PageTextEditor
          cmsKey="rate"
          locale={locale}
          current={rateText}
          canWrite={canWrite}
          sectionTitle={t('rateSectionTitle')}
          eyebrowLabel={t('eyebrowLabel')}
          titleLabel={t('pageTitleLabel')}
          bodyLabel={t('pageBodyLabel')}
          savingLabel={t('saving')}
          saveLabel={t('save')}
        />
        )}

        {activeTab === 'weather' && (
        <PageTextEditor
          cmsKey="weather"
          locale={locale}
          current={weatherText}
          canWrite={canWrite}
          sectionTitle={t('weatherSectionTitle')}
          eyebrowLabel={t('eyebrowLabel')}
          titleLabel={t('pageTitleLabel')}
          bodyLabel={t('pageBodyLabel')}
          savingLabel={t('saving')}
          saveLabel={t('save')}
        />
        )}

        {activeTab === 'terms' && (
        <PageTextEditor
          cmsKey="terms"
          locale={locale}
          current={termsText}
          canWrite={canWrite}
          sectionTitle={t('termsSectionTitle')}
          eyebrowLabel={t('eyebrowLabel')}
          titleLabel={t('pageTitleLabel')}
          bodyLabel={t('pageBodyLabel')}
          savingLabel={t('saving')}
          saveLabel={t('save')}
          bodyRows={6}
        />
        )}

        {activeTab === 'media' && canWrite && (
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
