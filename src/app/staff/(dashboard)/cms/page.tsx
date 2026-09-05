import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import {
  cmsService,
  CMS_SOCIAL_PLATFORM_LABELS,
  CMS_SOCIAL_PLATFORMS,
  GALLERY_COUNTRY_CODES,
  type CmsLocale,
  type CmsTextBlockView,
} from '@modules/cms';
import { EMAIL_TEMPLATE_DEFAULTS, EMAIL_TEMPLATE_GROUPS, EMAIL_TEMPLATE_TOKENS } from '@modules/notifications';
import { AFRICA_COUNTRIES } from '@lib/africa-country-ids';
import { ABOUT_TEXT_DEFAULTS, type AboutTextKey } from '@/app/(guest)/about/defaults';
import {
  FALLBACK_FOOTER_LEGAL_LABEL,
  FALLBACK_FOOTER_LEGAL_TEMPLATE,
  FALLBACK_FOOTER_LEGAL_URL,
} from '@/app/(guest)/footer';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal, RevealGroup } from '@/components/ui/Reveal';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SETTINGS_ITEMS } from '../settings-items';
import { SidebarShell } from '../sidebar-shell';
import { AboutListEditor } from './about-list-editor';
import {
  createAboutMdPhotoSlotAction,
  createFaqEntryAction,
  createGallerySiteAction,
  createHeroSlideAction,
  createOperatingCountryAction,
  createPartnerAction,
  createSocialLinkAction,
  deleteAboutMdPhotoAction,
  deleteFaqEntryAction,
  deleteGallerySiteAction,
  deleteHeroSlideAction,
  deleteOperatingCountryAction,
  deletePartnerAction,
  deleteSocialLinkAction,
  updateFaqEntryAction,
  updateFooterLegalAction,
  updateGallerySiteAction,
  updateHeroSlideMetaAction,
  updateHeroSlideTextAction,
  updateOperatingCountryAction,
  updatePartnerAction,
  updateSocialLinkAction,
} from './actions';
import { MediaPicker } from './media-picker';
import { PageTextEditor } from './page-text-editor';

interface Props {
  searchParams: Promise<{ locale?: string; tab?: string }>;
}

// Nav+footer order (DR-164), with `partners` (DR-185) and `social-links`
// (DR-200) placed right after `home-hero` since both are a second section
// of the same homepage/footer rather than their own guest route -- most
// tabs' label keys already exist (section headings), except `faq` (its
// heading is a dynamic "FAQ ({count})", not a plain label). DR-243 removed
// the trailing `media` tab (a generic "upload and copy the URL" utility,
// DR-071) -- it had no consumer anywhere in the app; every real image slot
// (hero, gallery, partners, package images) already gets its own
// MediaPicker-backed upload wired directly to a field.
const CMS_TABS = [
  { key: 'home-hero', labelKey: 'heroSectionTitle' },
  { key: 'home-map', labelKey: 'mapSectionTitle' },
  { key: 'partners', labelKey: 'partnersSectionTitle' },
  { key: 'social-links', labelKey: 'socialLinksSectionTitle' },
  { key: 'footer-legal', labelKey: 'footerLegalSectionTitle' },
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
  { key: 'emails', labelKey: 'emailsSectionTitle' },
] as const;
type CmsTabKey = (typeof CMS_TABS)[number]['key'];
const CMS_TAB_KEYS: readonly string[] = CMS_TABS.map((tabDef) => tabDef.key);

// Terms' 4 sections (DR-207) each ship a coded EN/FR default in
// messages/*.json -- (guest)/terms/page.tsx renders `cms?.title ?? t(...)`
// so the *effective* text a visitor sees is often that coded default, not a
// blank string. Before this, the staff editor's `current` prop was `null`
// until a section had a saved override, so PageTextEditor's `defaultValue`
// prefilled empty and any edit meant retyping the whole section from
// scratch. Fall back to the same coded default the guest page uses, so the
// textarea always starts from what's actually live.
function withTermsFallback(
  current: CmsTextBlockView | null,
  key: string,
  locale: CmsLocale,
  title: string,
  body: string,
): CmsTextBlockView {
  return (
    current ?? {
      id: '',
      key,
      locale,
      title,
      body,
      eyebrow: null,
      updatedAt: new Date(0),
      updatedByUserId: null,
    }
  );
}

// DR-256: same prefill reasoning as withTermsFallback above, sourced from
// the guest page's own coded defaults so an unconfigured install shows the
// staff editor exactly what the guest is currently being served.
const ABOUT_MD_PAGE = 'about-md';

function withAboutFallback(
  rows: Map<string, CmsTextBlockView>,
  key: AboutTextKey,
  locale: CmsLocale,
): CmsTextBlockView {
  const fallback = ABOUT_TEXT_DEFAULTS[locale][key];
  return (
    rows.get(key) ?? {
      id: '',
      key,
      locale,
      title: fallback.title,
      body: fallback.body,
      eyebrow: fallback.eyebrow,
      updatedAt: new Date(0),
      updatedByUserId: null,
    }
  );
}

// DR-217: same prefill reasoning as withTermsFallback above, sourced from
// notifications' EMAIL_TEMPLATE_DEFAULTS instead of a messages/*.json coded
// default -- notify()/notifyEmail() fall back to that exact same table when
// no CmsTextBlock override exists, so the editor always starts from what a
// guest/staff recipient would actually receive today.
function withEmailFallback(current: CmsTextBlockView | null, key: string, locale: CmsLocale, templateKey: string): CmsTextBlockView {
  const defaults = EMAIL_TEMPLATE_DEFAULTS[templateKey]?.[locale === 'fr' ? 'FR' : 'EN'];
  return (
    current ?? {
      id: '',
      key,
      locale,
      title: defaults?.heading ?? '',
      body: defaults?.bodyTemplate ?? '',
      eyebrow: defaults?.eyebrow ?? null,
      updatedAt: new Date(0),
      updatedByUserId: null,
    }
  );
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
  const { locale: localeParam, tab: tabParam } = await searchParams;
  const locale: CmsLocale = localeParam === 'fr' ? 'fr' : 'en';
  const activeTab: CmsTabKey = (tabParam && CMS_TAB_KEYS.includes(tabParam) ? tabParam : 'home-hero') as CmsTabKey;
  const ctx = await requireStaffContext('cms.read');
  const canWrite = ctx.roles.includes('SUPERADMIN');

  const [
    aboutTextRows,
    aboutStats,
    aboutTimeline,
    aboutValues,
    aboutMdMedia,
    faqs,
    heroItems,
    packagesText,
    planMyTripText,
    findBookingText,
    contactText,
    officeNamibiaText,
    officeDrcText,
    generalContactText,
    rateText,
    weatherText,
    termsTosText,
    termsPrivacyText,
    termsCookiesText,
    termsCancellationText,
    galleryText,
    galleryItems,
    partnerItems,
    socialLinkItems,
    mapText,
    operatingCountries,
    footerLegalText,
    emailOverrideRows,
  ] = await Promise.all([
    // DR-256: /about is nine section blocks + three repeating lists, so one
    // prefix read here rather than nine getTextBlock calls -- same reasoning
    // as the Emails tab's own `email.` prefix read below.
    cmsService.listTextBlocksByKeyPrefix(ctx, 'about', locale),
    cmsService.listAboutEntries(ctx, 'stat', locale),
    cmsService.listAboutEntries(ctx, 'timeline', locale),
    cmsService.listAboutEntries(ctx, 'value', locale),
    cmsService.listMediaItems(ctx, ABOUT_MD_PAGE),
    cmsService.listFaqEntries(ctx, locale),
    cmsService.listMediaItems(ctx, 'home-hero'),
    cmsService.getTextBlock(ctx, 'packages', locale),
    cmsService.getTextBlock(ctx, 'plan-my-trip', locale),
    cmsService.getTextBlock(ctx, 'find-booking', locale),
    cmsService.getTextBlock(ctx, 'contact', locale),
    cmsService.getTextBlock(ctx, 'contact.office.namibia', locale),
    cmsService.getTextBlock(ctx, 'contact.office.drc', locale),
    cmsService.getTextBlock(ctx, 'contact.general', locale),
    cmsService.getTextBlock(ctx, 'rate', locale),
    cmsService.getTextBlock(ctx, 'weather', locale),
    // DR-207: /terms is now a 4-section tabbed page (ToS/Privacy/Cookies/
    // Cancellation), replacing the old single flat 'terms' key -- each
    // section is its own CmsTextBlock, same PageTextEditor pattern as
    // Contact's two office blocks.
    cmsService.getTextBlock(ctx, 'terms.tos', locale),
    cmsService.getTextBlock(ctx, 'terms.privacy', locale),
    cmsService.getTextBlock(ctx, 'terms.cookies', locale),
    cmsService.getTextBlock(ctx, 'terms.cancellation', locale),
    cmsService.getTextBlock(ctx, 'gallery', locale),
    cmsService.listMediaItems(ctx, 'gallery'),
    cmsService.listMediaItems(ctx, 'partners'),
    cmsService.listMediaItems(ctx, 'social-links'),
    cmsService.getTextBlock(ctx, 'home-map', locale),
    cmsService.listOperatingCountries(ctx),
    cmsService.getTextBlock(ctx, 'footer.legal', locale),
    cmsService.listTextBlocksByKeyPrefix(ctx, 'email.', locale),
  ]);
  const emailOverridesByKey = new Map(emailOverrideRows.map((row) => [row.key, row]));
  const aboutBlocks = new Map(aboutTextRows.map((row) => [row.key, row]));
  const aboutMdPhotoUrl = aboutMdMedia.find((item) => item.mediaType === 'image' && item.url)?.url ?? null;
  const aboutMdSlotKey = aboutMdMedia[0]?.slotKey ?? null;
  const availableCountriesToAdd = AFRICA_COUNTRIES.filter(
    (country) => !operatingCountries.some((c) => c.countryCode === country.alpha2),
  );
  const heroTexts = await Promise.all(heroItems.map((item) => cmsService.getTextBlock(ctx, `home-hero.${item.slotKey}`, locale)));
  const t = await getTranslations('StaffCms');
  const tCountries = await getTranslations('Countries');
  const tSidebar = await getTranslations('StaffSettingsSidebar');
  const tTerms = await getTranslations('Terms');
  const tEmails = await getTranslations('StaffCmsEmail');
  const termsTosView = withTermsFallback(termsTosText, 'terms.tos', locale, tTerms('sections.tos.title'), tTerms('sections.tos.body'));
  const termsPrivacyView = withTermsFallback(
    termsPrivacyText,
    'terms.privacy',
    locale,
    tTerms('sections.privacy.title'),
    tTerms('sections.privacy.body'),
  );
  const termsCookiesView = withTermsFallback(
    termsCookiesText,
    'terms.cookies',
    locale,
    tTerms('sections.cookies.title'),
    tTerms('sections.cookies.body'),
  );
  const termsCancellationView = withTermsFallback(
    termsCancellationText,
    'terms.cancellation',
    locale,
    tTerms('sections.cancellation.title'),
    tTerms('sections.cancellation.body'),
  );
  // Same "prefill from the coded default" convention as the Terms sections
  // above -- until staff configures a real row, the editor should show the
  // template/label/URL footer.tsx actually falls back to, not blank fields.
  const footerLegalView: CmsTextBlockView = footerLegalText ?? {
    id: '',
    key: 'footer.legal',
    locale,
    title: FALLBACK_FOOTER_LEGAL_LABEL,
    body: FALLBACK_FOOTER_LEGAL_URL,
    eyebrow: FALLBACK_FOOTER_LEGAL_TEMPLATE,
    updatedAt: new Date(0),
    updatedByUserId: null,
  };

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

        {activeTab === 'home-map' && (
        <section className="space-y-6">
          <PageTextEditor
            cmsKey="home-map"
            locale={locale}
            current={mapText}
            canWrite={canWrite}
            sectionTitle={t('mapSectionTitle')}
            eyebrowLabel={t('eyebrowLabel')}
            titleLabel={t('pageTitleLabel')}
            bodyLabel={t('pageBodyLabel')}
            savingLabel={t('saving')}
            saveLabel={t('save')}
          />

          <div className="space-y-3">
            <h3 className="font-semibold text-navy">{t('mapCountriesSectionTitle')}</h3>
            <p className="text-xs text-mist">{t('mapCountriesIntro')}</p>
            <RevealGroup as="div" itemAs="div" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {operatingCountries.map((item) => {
                const countryName = AFRICA_COUNTRIES.find((c) => c.alpha2 === item.countryCode)?.name ?? item.countryCode;
                return (
                  <Card key={item.id}>
                    <p className="font-semibold text-navy">{countryName}</p>
                    {canWrite ? (
                      <div className="mt-2 space-y-3">
                        <form action={updateOperatingCountryAction.bind(null, item.id)} className="space-y-2">
                          <FormField label={t('capitalLabel')} htmlFor={`capital-${item.id}`}>
                            <input
                              name="capital"
                              defaultValue={item.capital}
                              className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm"
                            />
                          </FormField>
                          <FormField label={t('languagesLabel')} htmlFor={`languages-${item.id}`}>
                            <input
                              name="languages"
                              defaultValue={item.languages}
                              className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm"
                            />
                          </FormField>
                          <FormField label={t('currencyLabel')} htmlFor={`currency-${item.id}`}>
                            <input
                              name="currency"
                              defaultValue={item.currency}
                              className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm"
                            />
                          </FormField>
                          <FormField label={t('populationLabel')} htmlFor={`population-${item.id}`}>
                            <input
                              name="population"
                              defaultValue={item.population}
                              className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm"
                            />
                          </FormField>
                          <FormField label={t('areaLabel')} htmlFor={`areaKm2-${item.id}`}>
                            <input
                              name="areaKm2"
                              defaultValue={item.areaKm2}
                              className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm"
                            />
                          </FormField>
                          <div className="flex items-end gap-3">
                            <FormField label={t('order')} htmlFor={`sortOrder-${item.id}`}>
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
                          </div>
                        </form>
                        <DeleteButton
                          action={deleteOperatingCountryAction.bind(null, item.id)}
                          removingLabel={t('removing')}
                          removeConfirm={t('removeCountryConfirm')}
                          removeLabel={t('removeCountry')}
                        />
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-mist">{item.capital}</p>
                    )}
                  </Card>
                );
              })}
            </RevealGroup>
            {canWrite && availableCountriesToAdd.length > 0 && (
              <form action={createOperatingCountryAction} className="flex items-end gap-3">
                <FormField label={t('addCountryLabel')} htmlFor="new-operating-country">
                  <Select name="countryCode" required defaultValue="" id="new-operating-country">
                    <option value="" disabled>
                      {t('addCountryLabel')}
                    </option>
                    {availableCountriesToAdd.map((country) => (
                      <option key={country.alpha2} value={country.alpha2}>
                        {country.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <SubmitButton size="compact" pendingLabel={t('adding')}>
                  {t('addCountry')}
                </SubmitButton>
              </form>
            )}
          </div>
        </section>
        )}

        {activeTab === 'partners' && (
        <section className="space-y-3">
          <h2 className="font-semibold text-navy">{t('partnersSectionTitle')}</h2>
          <p className="text-xs text-mist">{t('partnersIntro')}</p>
          <RevealGroup as="div" itemAs="div" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {partnerItems.map((item) => (
              <Card key={item.slotKey}>
                {canWrite ? (
                  <div className="space-y-3">
                    <form action={updatePartnerAction.bind(null, item.slotKey)} className="space-y-2">
                      <FormField label={t('partnerNameLabel')} htmlFor={`name-${item.slotKey}`}>
                        <input
                          name="name"
                          required
                          defaultValue={item.name ?? ''}
                          className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm font-semibold"
                        />
                      </FormField>
                      <div className="flex items-end gap-3">
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
                      </div>
                    </form>

                    <div className="flex flex-wrap items-start gap-4">
                      <div className="space-y-1">
                        <p className="text-xs text-mist">{t('mediaLabel')}</p>
                        {item.mediaType === 'image' && item.url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- staff preview only, arbitrary Blob URL
                          <img src={item.url} alt="" className="h-16 w-32 rounded-survey object-contain" />
                        ) : (
                          <p className="text-xs text-mist">{t('noMediaYet')}</p>
                        )}
                      </div>
                      <MediaPicker
                        page="partners"
                        slotKey={item.slotKey}
                        uploadingLabel={t('uploadingMedia')}
                        chooseFileLabel={t('choosePartnerLogoFile')}
                        errorLabel={t('mediaUploadError')}
                      />
                    </div>

                    <DeleteButton
                      action={deletePartnerAction.bind(null, item.slotKey)}
                      removingLabel={t('removing')}
                      removeConfirm={t('removePartnerConfirm')}
                      removeLabel={t('removePartner')}
                    />
                  </div>
                ) : (
                  <p className="font-semibold text-navy">{item.name}</p>
                )}
              </Card>
            ))}
          </RevealGroup>
          {canWrite && (
            <form action={createPartnerAction}>
              <SubmitButton size="compact" pendingLabel={t('adding')}>
                {t('addPartner')}
              </SubmitButton>
            </form>
          )}
        </section>
        )}

        {activeTab === 'social-links' && (
        <section className="space-y-3">
          <h2 className="font-semibold text-navy">{t('socialLinksSectionTitle')}</h2>
          <p className="text-xs text-mist">{t('socialLinksIntro')}</p>
          <RevealGroup as="div" itemAs="div" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {socialLinkItems.map((item) => (
              <Card key={item.slotKey}>
                {canWrite ? (
                  <div className="space-y-3">
                    <form action={updateSocialLinkAction.bind(null, item.slotKey)} className="space-y-2">
                      <FormField label={t('platformLabel')} htmlFor={`platform-${item.slotKey}`}>
                        <Select name="platform" required defaultValue={item.platform ?? ''}>
                          <option value="" disabled>
                            {t('platformLabel')}
                          </option>
                          {CMS_SOCIAL_PLATFORMS.map((platform) => (
                            <option key={platform} value={platform}>
                              {CMS_SOCIAL_PLATFORM_LABELS[platform]}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                      <FormField label={t('urlLabel')} htmlFor={`url-${item.slotKey}`}>
                        <input
                          name="url"
                          type="url"
                          placeholder="https://…"
                          defaultValue={item.url ?? ''}
                          className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm"
                        />
                      </FormField>
                      <div className="flex items-end gap-3">
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
                      </div>
                    </form>

                    <DeleteButton
                      action={deleteSocialLinkAction.bind(null, item.slotKey)}
                      removingLabel={t('removing')}
                      removeConfirm={t('removeSocialLinkConfirm')}
                      removeLabel={t('removeSocialLink')}
                    />
                  </div>
                ) : (
                  <p className="font-semibold text-navy">
                    {item.platform ? CMS_SOCIAL_PLATFORM_LABELS[item.platform] : t('platformLabel')}
                  </p>
                )}
              </Card>
            ))}
          </RevealGroup>
          {canWrite && (
            <form action={createSocialLinkAction}>
              <SubmitButton size="compact" pendingLabel={t('adding')}>
                {t('addSocialLink')}
              </SubmitButton>
            </form>
          )}
        </section>
        )}

        {activeTab === 'footer-legal' && (
        <section className="space-y-3">
          <PageTextEditor
            cmsKey="footer.legal"
            locale={locale}
            current={footerLegalView}
            canWrite={canWrite}
            sectionTitle={t('footerLegalSectionTitle')}
            eyebrowLabel={t('footerLineTemplateLabel')}
            titleLabel={t('footerLinkTextLabel')}
            bodyLabel={t('footerLinkUrlLabel')}
            bodyType="url"
            formAction={updateFooterLegalAction}
            savingLabel={t('saving')}
            saveLabel={t('save')}
          />
          <p className="text-xs text-mist">{t('footerLegalIntro')}</p>
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
        <>
        <PageTextEditor
          cmsKey="gallery"
          locale={locale}
          current={galleryText}
          canWrite={canWrite}
          sectionTitle={t('gallerySectionTitle')}
          eyebrowLabel={t('eyebrowLabel')}
          titleLabel={t('pageTitleLabel')}
          bodyLabel={t('pageBodyLabel')}
          savingLabel={t('saving')}
          saveLabel={t('save')}
        />

        <section className="space-y-3">
          <h2 className="font-semibold text-navy">{t('gallerySitesSectionTitle')}</h2>
          <p className="text-xs text-mist">{t('galleryIntro')}</p>
          <RevealGroup as="div" itemAs="div" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {galleryItems.map((item) => (
              <Card key={item.slotKey}>
                {canWrite ? (
                  <div className="space-y-3">
                    <form action={updateGallerySiteAction.bind(null, item.slotKey)} className="space-y-2">
                      <FormField label={t('siteNameLabel')} htmlFor={`name-${item.slotKey}`}>
                        <input
                          name="name"
                          required
                          defaultValue={item.name ?? ''}
                          className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm font-semibold"
                        />
                      </FormField>
                      <FormField label={t('countryLabel')} htmlFor={`country-${item.slotKey}`}>
                        <Select name="country" required defaultValue={item.country ?? ''}>
                          <option value="" disabled>
                            {t('countryLabel')}
                          </option>
                          {GALLERY_COUNTRY_CODES.map((code) => (
                            <option key={code} value={code}>
                              {tCountries(code)}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                      <FormField label={t('descriptionLabel')} htmlFor={`description-${item.slotKey}`}>
                        <textarea
                          name="description"
                          rows={2}
                          defaultValue={item.description ?? ''}
                          className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm"
                        />
                      </FormField>
                      <FormField label={t('slugLabel')} htmlFor={`slug-${item.slotKey}`}>
                        <input
                          name="slug"
                          defaultValue={item.slug ?? ''}
                          placeholder="masai-mara"
                          pattern="[a-z0-9]+(-[a-z0-9]+)*"
                          className="w-full rounded-survey border border-rule px-2 py-1.5 text-sm lowercase"
                        />
                      </FormField>
                      <p className="-mt-1 text-xs text-mist">{t('slugHint')}</p>
                      <div className="flex items-end gap-3">
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
                      </div>
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
                        page="gallery"
                        slotKey={item.slotKey}
                        uploadingLabel={t('uploadingMedia')}
                        chooseFileLabel={t('chooseMediaFile')}
                        errorLabel={t('mediaUploadError')}
                      />
                    </div>

                    <DeleteButton
                      action={deleteGallerySiteAction.bind(null, item.slotKey)}
                      removingLabel={t('removing')}
                      removeConfirm={t('removeSiteConfirm')}
                      removeLabel={t('removeSite')}
                    />
                  </div>
                ) : (
                  <>
                    <p className="font-semibold text-navy">{item.name}</p>
                    {item.description && <p className="mt-1 text-sm text-mist">{item.description}</p>}
                  </>
                )}
              </Card>
            ))}
          </RevealGroup>
          {canWrite && (
            <form action={createGallerySiteAction}>
              <SubmitButton size="compact" pendingLabel={t('adding')}>
                {t('addSite')}
              </SubmitButton>
            </form>
          )}
        </section>
        </>
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
        <div className="space-y-8">
          <PageTextEditor
            cmsKey="about"
            locale={locale}
            current={withAboutFallback(aboutBlocks, 'about', locale)}
            canWrite={canWrite}
            sectionTitle={t('aboutIntroSectionTitle')}
            eyebrowLabel={t('eyebrowLabel')}
            titleLabel={t('pageTitleLabel')}
            bodyLabel={t('aboutIntroBodyLabel')}
            savingLabel={t('saving')}
            saveLabel={t('save')}
            bodyRows={8}
          />

          <PageTextEditor
            cmsKey="about.stats"
            locale={locale}
            current={withAboutFallback(aboutBlocks, 'about.stats', locale)}
            canWrite={canWrite}
            sectionTitle={t('aboutStatsHeadingSectionTitle')}
            eyebrowLabel={t('eyebrowLabel')}
            titleLabel={t('aboutScreenReaderTitleLabel')}
            bodyLabel={t('aboutBadgeLabel')}
            savingLabel={t('saving')}
            saveLabel={t('save')}
            bodyRows={2}
          />
          <AboutListEditor section="stat" entries={aboutStats} locale={locale} canWrite={canWrite} />

          <PageTextEditor
            cmsKey="about.story"
            locale={locale}
            current={withAboutFallback(aboutBlocks, 'about.story', locale)}
            canWrite={canWrite}
            sectionTitle={t('aboutStoryHeadingSectionTitle')}
            eyebrowLabel={t('eyebrowLabel')}
            titleLabel={t('pageTitleLabel')}
            bodyLabel={t('pageBodyLabel')}
            savingLabel={t('saving')}
            saveLabel={t('save')}
            bodyRows={2}
          />
          <AboutListEditor section="timeline" entries={aboutTimeline} locale={locale} canWrite={canWrite} />

          <PageTextEditor
            cmsKey="about.md"
            locale={locale}
            current={withAboutFallback(aboutBlocks, 'about.md', locale)}
            canWrite={canWrite}
            sectionTitle={t('aboutMdHeadingSectionTitle')}
            eyebrowLabel={t('eyebrowLabel')}
            titleLabel={t('pageTitleLabel')}
            bodyLabel={t('aboutMdBioLabel')}
            savingLabel={t('saving')}
            saveLabel={t('save')}
            bodyRows={6}
          />
          <PageTextEditor
            cmsKey="about.md.person"
            locale={locale}
            current={withAboutFallback(aboutBlocks, 'about.md.person', locale)}
            canWrite={canWrite}
            sectionTitle={t('aboutMdPersonSectionTitle')}
            eyebrowLabel={t('aboutMdRoleLabel')}
            titleLabel={t('aboutMdNameLabel')}
            savingLabel={t('saving')}
            saveLabel={t('save')}
            showBody={false}
          />

          <section className="space-y-3">
            <h2 className="font-semibold text-navy">{t('aboutMdPhotoSectionTitle')}</h2>
            <div className="flex flex-wrap items-start gap-4">
              <div className="space-y-1">
                <p className="text-xs text-mist">{t('mediaLabel')}</p>
                {aboutMdPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- staff preview only, arbitrary Blob URL
                  <img src={aboutMdPhotoUrl} alt="" className="h-24 w-24 rounded-full object-cover" />
                ) : (
                  <p className="text-xs text-mist">{t('noMediaYet')}</p>
                )}
              </div>
              {canWrite &&
                (aboutMdSlotKey ? (
                  <div className="space-y-2">
                    <MediaPicker
                      page={ABOUT_MD_PAGE}
                      slotKey={aboutMdSlotKey}
                      uploadingLabel={t('uploadingMedia')}
                      chooseFileLabel={t('chooseMdPhotoFile')}
                      errorLabel={t('mediaUploadError')}
                    />
                    <DeleteButton
                      action={deleteAboutMdPhotoAction.bind(null, aboutMdSlotKey)}
                      removingLabel={t('removing')}
                      removeConfirm={t('removeMdPhotoConfirm')}
                      removeLabel={t('removeMdPhoto')}
                    />
                  </div>
                ) : (
                  <form action={createAboutMdPhotoSlotAction}>
                    <SubmitButton size="compact" pendingLabel={t('adding')}>
                      {t('addMdPhotoSlot')}
                    </SubmitButton>
                  </form>
                ))}
            </div>
          </section>

          <PageTextEditor
            cmsKey="about.vm"
            locale={locale}
            current={withAboutFallback(aboutBlocks, 'about.vm', locale)}
            canWrite={canWrite}
            sectionTitle={t('aboutVmHeadingSectionTitle')}
            eyebrowLabel={t('eyebrowLabel')}
            titleLabel={t('pageTitleLabel')}
            bodyLabel={t('pageBodyLabel')}
            savingLabel={t('saving')}
            saveLabel={t('save')}
            bodyRows={2}
          />
          <PageTextEditor
            cmsKey="about.vision"
            locale={locale}
            current={withAboutFallback(aboutBlocks, 'about.vision', locale)}
            canWrite={canWrite}
            sectionTitle={t('aboutVisionSectionTitle')}
            eyebrowLabel={t('eyebrowLabel')}
            titleLabel={t('aboutCardTitleLabel')}
            bodyLabel={t('aboutCardBodyLabel')}
            savingLabel={t('saving')}
            saveLabel={t('save')}
            showEyebrow={false}
            bodyRows={3}
          />
          <PageTextEditor
            cmsKey="about.mission"
            locale={locale}
            current={withAboutFallback(aboutBlocks, 'about.mission', locale)}
            canWrite={canWrite}
            sectionTitle={t('aboutMissionSectionTitle')}
            eyebrowLabel={t('eyebrowLabel')}
            titleLabel={t('aboutCardTitleLabel')}
            bodyLabel={t('aboutCardBodyLabel')}
            savingLabel={t('saving')}
            saveLabel={t('save')}
            showEyebrow={false}
            bodyRows={3}
          />

          <PageTextEditor
            cmsKey="about.values"
            locale={locale}
            current={withAboutFallback(aboutBlocks, 'about.values', locale)}
            canWrite={canWrite}
            sectionTitle={t('aboutValuesHeadingSectionTitle')}
            eyebrowLabel={t('eyebrowLabel')}
            titleLabel={t('pageTitleLabel')}
            bodyLabel={t('pageBodyLabel')}
            savingLabel={t('saving')}
            saveLabel={t('save')}
            bodyRows={2}
          />
          <AboutListEditor section="value" entries={aboutValues} locale={locale} canWrite={canWrite} />
        </div>
        )}

        {activeTab === 'faq' && (
        <section className="space-y-3">
          <h2 className="font-semibold text-navy">{t('faqCount', { count: faqs.length })}</h2>
          <RevealGroup as="div" itemAs="div" className="space-y-3">
            {faqs.map((f) => (
              <Card key={f.id}>
                {canWrite ? (
                  <>
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
                      </div>
                    </form>
                    <DeleteButton
                      action={deleteFaqEntryAction.bind(null, f.id)}
                      removingLabel={t('removing')}
                      removeConfirm={t('removeFaqConfirm')}
                      removeLabel={t('remove')}
                    />
                  </>
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

        <PageTextEditor
          cmsKey="contact.general"
          locale={locale}
          current={generalContactText}
          canWrite={canWrite}
          sectionTitle={t('contactGeneralSectionTitle')}
          eyebrowLabel=""
          showEyebrow={false}
          titleLabel={t('contactGeneralHeadingLabel')}
          bodyLabel={t('contactGeneralDetailsLabel')}
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
        <div className="space-y-8">
          <PageTextEditor
            cmsKey="terms.tos"
            locale={locale}
            current={termsTosView}
            canWrite={canWrite}
            sectionTitle={t('termsTosSectionTitle')}
            eyebrowLabel={t('eyebrowLabel')}
            titleLabel={t('pageTitleLabel')}
            bodyLabel={t('pageBodyLabel')}
            savingLabel={t('saving')}
            saveLabel={t('save')}
            bodyRows={12}
          />
          <PageTextEditor
            cmsKey="terms.privacy"
            locale={locale}
            current={termsPrivacyView}
            canWrite={canWrite}
            sectionTitle={t('termsPrivacySectionTitle')}
            eyebrowLabel={t('eyebrowLabel')}
            titleLabel={t('pageTitleLabel')}
            bodyLabel={t('pageBodyLabel')}
            savingLabel={t('saving')}
            saveLabel={t('save')}
            bodyRows={12}
          />
          <PageTextEditor
            cmsKey="terms.cookies"
            locale={locale}
            current={termsCookiesView}
            canWrite={canWrite}
            sectionTitle={t('termsCookiesSectionTitle')}
            eyebrowLabel={t('eyebrowLabel')}
            titleLabel={t('pageTitleLabel')}
            bodyLabel={t('pageBodyLabel')}
            savingLabel={t('saving')}
            saveLabel={t('save')}
            bodyRows={8}
          />
          <PageTextEditor
            cmsKey="terms.cancellation"
            locale={locale}
            current={termsCancellationView}
            canWrite={canWrite}
            sectionTitle={t('termsCancellationSectionTitle')}
            eyebrowLabel={t('eyebrowLabel')}
            titleLabel={t('pageTitleLabel')}
            bodyLabel={t('pageBodyLabel')}
            savingLabel={t('saving')}
            saveLabel={t('save')}
            bodyRows={12}
          />
        </div>
        )}

        {activeTab === 'emails' && (
        <div className="space-y-8">
          <p className="text-sm text-mist">{tEmails('intro')}</p>
          {EMAIL_TEMPLATE_GROUPS.map((group) => (
            <section key={group.groupKey} className="space-y-3">
              <h2 className="font-semibold text-navy">{tEmails(`groups.${group.groupKey}`)}</h2>
              <div className="space-y-2">
                {group.keys.map((templateKey) => {
                  const cmsKey = `email.${templateKey}`;
                  const view = withEmailFallback(emailOverridesByKey.get(cmsKey) ?? null, cmsKey, locale, templateKey);
                  const tokens = EMAIL_TEMPLATE_TOKENS[templateKey] ?? [];
                  // Real bug fixed here: this always read the EN default
                  // regardless of the page's own locale toggle, so a staff
                  // member viewing ?locale=fr still saw every accordion
                  // label ("Booking confirmed", etc.) in English -- only the
                  // editable fields inside (via withEmailFallback above)
                  // were actually locale-aware.
                  const label = EMAIL_TEMPLATE_DEFAULTS[templateKey]?.[locale === 'fr' ? 'FR' : 'EN'].eyebrow ?? templateKey;
                  return (
                    <details key={templateKey} className="rounded-card border border-rule p-4">
                      <summary className="cursor-pointer font-semibold text-navy">{label}</summary>
                      <div className="mt-3 space-y-2">
                        {tokens.length > 0 && (
                          <p className="text-xs text-mist">
                            {tEmails('placeholdersLabel')} {tokens.map((token) => `{{${token}}}`).join(', ')}
                          </p>
                        )}
                        <PageTextEditor
                          cmsKey={cmsKey}
                          locale={locale}
                          current={view}
                          canWrite={canWrite}
                          sectionTitle={label}
                          eyebrowLabel={t('eyebrowLabel')}
                          titleLabel={t('pageTitleLabel')}
                          bodyLabel={t('pageBodyLabel')}
                          savingLabel={t('saving')}
                          saveLabel={t('save')}
                          bodyRows={6}
                        />
                      </div>
                    </details>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        )}

        </Reveal>
      </div>
    </SidebarShell>
  );
}
