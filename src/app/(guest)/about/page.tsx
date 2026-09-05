import { Fragment } from 'react';
import { cookies } from 'next/headers';
import Image from 'next/image';
import { cmsService, type CmsAboutEntryView, type CmsLocale, type CmsTextBlockView } from '@modules/cms';
import { Reveal, RevealGroup } from '@/components/ui/Reveal';
import {
  ABOUT_STAT_DEFAULTS,
  ABOUT_TEXT_DEFAULTS,
  ABOUT_TIMELINE_DEFAULTS,
  ABOUT_VALUE_DEFAULTS,
  type AboutTextDefault,
  type AboutTextKey,
} from './defaults';
import { StatCounter } from './stat-counter';

// DR-071: content is DB-backed (CmsTextBlock, key="about") instead of
// hardcoded JSX -- edited at /staff/cms (renamed from /staff/content,
// DR-162). Reads the same `locale` cookie src/i18n/request.ts does
// directly, rather than pulling in next-intl's machinery for content that
// isn't a next-intl namespace.
async function resolveLocale(): Promise<CmsLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

// DR-256 rebuilt this from a single eyebrow/title/body block into six
// sections. Every one of them is staff-editable -- the prose through
// CmsTextBlock (one row per `about.*` key, all fetched in a single
// prefix query, same trick DR-217 added for the Emails tab) and the three
// repeating lists through CmsAboutEntry. Each falls back to the coded
// EN/FR defaults in ./defaults.ts, so the page is complete before staff
// has configured anything.
//
// The MD portrait is the one piece with no coded default: it's a staff
// upload (CmsMediaItem, page='about-md'), and until one exists the block
// renders the placeholder monogram instead. Note OI-15 -- that upload
// works on Production/Preview but not local `npm run dev`.
const MD_PHOTO_PAGE = 'about-md';

function resolveText(
  blocks: Map<string, CmsTextBlockView>,
  locale: CmsLocale,
  key: AboutTextKey,
): AboutTextDefault {
  const fallback = ABOUT_TEXT_DEFAULTS[locale][key];
  const row = blocks.get(key);
  if (!row) return fallback;
  return { eyebrow: row.eyebrow ?? fallback.eyebrow, title: row.title, body: row.body };
}

/** Staff rows win as a whole list, never merged item-by-item with the
 * defaults -- a half-configured section showing three real values plus two
 * leftover samples would be worse than either on its own. */
function resolveList<T>(rows: CmsAboutEntryView[], fallback: T[], map: (row: CmsAboutEntryView) => T): T[] {
  return rows.length > 0 ? rows.map(map) : fallback;
}

// Breaks a section out of the guest layout's max-w-7xl container so a
// colored band spans the viewport, then re-applies the container inside --
// same trick /find-booking's hero photo uses (DR: un-blur commit).
const FULL_BLEED = 'relative left-1/2 right-1/2 -mx-[50vw] w-screen';
const BAND_INNER = 'mx-auto max-w-7xl px-4 py-16 sm:px-8 sm:py-20';

export default async function AboutPage() {
  const locale = await resolveLocale();
  const [textBlocks, statRows, timelineRows, valueRows, mdMedia] = await Promise.all([
    cmsService.listPublicTextBlocksByKeyPrefix('about', locale),
    cmsService.listPublicAboutEntries('stat', locale),
    cmsService.listPublicAboutEntries('timeline', locale),
    cmsService.listPublicAboutEntries('value', locale),
    cmsService.listPublicMediaItems(MD_PHOTO_PAGE),
  ]);

  const blocks = new Map(textBlocks.map((block) => [block.key, block]));
  const intro = resolveText(blocks, locale, 'about');
  const statsText = resolveText(blocks, locale, 'about.stats');
  const storyText = resolveText(blocks, locale, 'about.story');
  const mdText = resolveText(blocks, locale, 'about.md');
  const mdPerson = resolveText(blocks, locale, 'about.md.person');
  const vmText = resolveText(blocks, locale, 'about.vm');
  const visionText = resolveText(blocks, locale, 'about.vision');
  const missionText = resolveText(blocks, locale, 'about.mission');
  const valuesText = resolveText(blocks, locale, 'about.values');

  const stats = resolveList(statRows, ABOUT_STAT_DEFAULTS[locale], (row) => ({
    heading: row.heading,
    numericValue: row.numericValue ?? 0,
    prefix: row.prefix,
    suffix: row.suffix,
    animate: row.animate,
  }));
  const timeline = resolveList(timelineRows, ABOUT_TIMELINE_DEFAULTS[locale], (row) => ({
    marker: row.marker ?? '',
    heading: row.heading,
    body: row.body ?? '',
  }));
  const values = resolveList(valueRows, ABOUT_VALUE_DEFAULTS[locale], (row) => ({
    heading: row.heading,
    body: row.body ?? '',
  }));

  const mdPhotoUrl = mdMedia.find((item) => item.mediaType === 'image' && item.url)?.url ?? null;
  const introParagraphs = intro.body.split('\n\n').filter(Boolean);

  return (
    <div className="space-y-16 sm:space-y-20">
      {/* ---------------------------------------------------- About us */}
      <Reveal>
        <section>
          {intro.eyebrow && <p className="eyebrow text-amber">{intro.eyebrow}</p>}
          <h1 className="mt-2 font-display text-3xl font-extrabold uppercase leading-none text-navy sm:text-4xl">
            {intro.title}
          </h1>
          <div className="mt-4 h-[3px] w-14 rounded-full bg-amber" />
          <div className="mt-6 grid gap-6 sm:grid-cols-2 sm:gap-10">
            {introParagraphs.map((paragraph, i) => (
              <p key={i} className={i === 0 ? 'text-lg text-ink' : 'text-ink'}>
                {paragraph}
              </p>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ------------------------------------------------- At a glance */}
      <section className={FULL_BLEED}>
        <div className="bg-bone">
          <div className={BAND_INNER}>
            {statsText.eyebrow && <p className="eyebrow text-amber">{statsText.eyebrow}</p>}
            {/* The stat figures are this band's visual heading -- an h2 as
                well would compete with them, so it stays available to
                assistive tech only rather than being dropped entirely. */}
            <h2 className="sr-only">{statsText.title}</h2>
            <RevealGroup
              as="ul"
              itemAs="li"
              className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
              itemClassName="rounded-card bg-white px-3 py-6 text-center shadow-card"
            >
              {stats.map((stat) => (
                <Fragment key={stat.heading}>
                  <StatCounter
                    value={stat.numericValue}
                    prefix={stat.prefix}
                    suffix={stat.suffix}
                    animate={stat.animate}
                  />
                  <p className="eyebrow mt-2 text-mist">{stat.heading}</p>
                </Fragment>
              ))}
            </RevealGroup>
            <p className="mt-6 text-center font-mono text-xs tracking-wide text-forest">{statsText.body}</p>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- Our story */}
      <Reveal>
        <section>
          {storyText.eyebrow && <p className="eyebrow text-amber">{storyText.eyebrow}</p>}
          <h2 className="mt-2 font-display text-2xl font-extrabold uppercase leading-none text-navy sm:text-3xl">
            {storyText.title}
          </h2>
          <div className="mt-4 h-[3px] w-14 rounded-full bg-amber" />
          <p className="mt-4 max-w-prose text-mist">{storyText.body}</p>
          <ol className="relative mt-8 space-y-8 border-l-2 border-rule pl-8">
            {timeline.map((entry, i) => (
              <li key={i} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[41px] top-1 h-5 w-5 rounded-full border-[3px] border-amber bg-bone"
                />
                <p className="font-display text-xl font-bold text-amber">{entry.marker}</p>
                <p className="mt-0.5 font-semibold text-navy">{entry.heading}</p>
                <p className="mt-1 max-w-prose text-ink">{entry.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </Reveal>

      {/* -------------------------------------------- Managing Director */}
      <section className={FULL_BLEED}>
        <div className="bg-navy text-bone">
          <div className={BAND_INNER}>
            {mdText.eyebrow && <p className="eyebrow text-gold">{mdText.eyebrow}</p>}
            <h2 className="mt-2 font-display text-2xl font-extrabold uppercase leading-none text-white sm:text-3xl">
              {mdText.title}
            </h2>
            <div className="mt-4 h-[3px] w-14 rounded-full bg-gold" />
            <div className="mt-8 grid items-center gap-8 sm:grid-cols-[200px_1fr] sm:gap-10">
              <div className="mx-auto h-48 w-48 overflow-hidden rounded-full border-[3px] border-gold bg-navy-soft sm:mx-0">
                {mdPhotoUrl ? (
                  <Image
                    src={mdPhotoUrl}
                    alt={mdPerson.title}
                    width={192}
                    height={192}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center font-display text-5xl font-extrabold text-gold/60">
                    {mdPerson.title.charAt(0)}
                  </span>
                )}
              </div>
              <div>
                <p className="font-display text-2xl font-extrabold uppercase leading-none text-white">
                  {mdPerson.title}
                </p>
                {mdPerson.eyebrow && <p className="eyebrow mt-2 text-gold">{mdPerson.eyebrow}</p>}
                <p className="mt-4 max-w-prose text-bone/90">{mdText.body}</p>
                <blockquote className="mt-5 border-l-[3px] border-amber pl-4 text-lg italic text-white">
                  {mdPerson.body}
                </blockquote>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------- Vision & Mission */}
      <Reveal>
        <section>
          {vmText.eyebrow && <p className="eyebrow text-amber">{vmText.eyebrow}</p>}
          <h2 className="mt-2 font-display text-2xl font-extrabold uppercase leading-none text-navy sm:text-3xl">
            {vmText.title}
          </h2>
          <div className="mt-4 h-[3px] w-14 rounded-full bg-amber" />
          <p className="mt-4 max-w-prose text-mist">{vmText.body}</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {[
              { text: visionText, accent: 'border-l-amber' },
              { text: missionText, accent: 'border-l-forest' },
            ].map(({ text, accent }) => (
              <div
                key={text.title}
                className={`rounded-card border border-rule border-l-4 bg-white p-6 shadow-card ${accent}`}
              >
                <p className="font-display text-xl font-extrabold uppercase text-navy">{text.title}</p>
                <p className="mt-2 text-ink">{text.body}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* -------------------------------------------------- Our values */}
      <section className={FULL_BLEED}>
        <div className="bg-forest text-bone">
          <div className={BAND_INNER}>
            {valuesText.eyebrow && <p className="eyebrow text-gold">{valuesText.eyebrow}</p>}
            <h2 className="mt-2 font-display text-2xl font-extrabold uppercase leading-none text-white sm:text-3xl">
              {valuesText.title}
            </h2>
            <div className="mt-4 h-[3px] w-14 rounded-full bg-gold" />
            <p className="mt-4 max-w-prose text-bone/80">{valuesText.body}</p>
            <RevealGroup as="ul" itemAs="li" className="mt-8 grid gap-7 sm:grid-cols-3">
              {values.map((value) => (
                <Fragment key={value.heading}>
                  <p className="border-t-2 border-white/30 pt-3 font-semibold text-white">{value.heading}</p>
                  <p className="mt-1.5 text-sm text-bone/85">{value.body}</p>
                </Fragment>
              ))}
            </RevealGroup>
          </div>
        </div>
      </section>
    </div>
  );
}
