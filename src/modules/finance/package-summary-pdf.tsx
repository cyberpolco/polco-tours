// finance module — package summary PDF (staff download, package detail
// page). Mirrors itinerary/map-pdf.tsx's shape exactly: @react-pdf/renderer
// components are its own React reconciler (Document/Page/View/Text/Image
// host nodes, not DOM), server-side only. Explicit user request: one staff-only
// document combining a plain-language cost summary with the package's
// day-by-day itinerary template, downloadable in English or French.
//
// Deliberately does NOT use next-intl (same precedent as map-pdf.tsx, which
// hardcodes English) -- src/i18n/request.ts's getRequestConfig ignores any
// explicit locale override today, so a `getTranslations({ locale })` call
// here would silently still resolve via the cookie, not the requested
// language. This file's own small LABELS dictionary is self-contained and
// unaffected by that gap.
//
// Company/footer details are fixed, explicit user-supplied values (not
// staff-editable reference data, so no Settings-module CRUD screen) --
// same "static constant, not a DB table" precedent as src/lib/weather-towns.ts.
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { Currency } from '@lib/money';
import { PDF_FONT_BODY, PDF_FONT_CODE, registerPdfFonts } from '@lib/pdf-fonts';
import { BRAND_LOGO_DATA_URI } from '@lib/brand-logo';

/** Deliberately NOT src/lib/money.ts's own `format` (Intl.NumberFormat) --
 * the French locale's thousands-grouping character (a narrow no-break
 * space) isn't in react-pdf's built-in Helvetica font, so it silently
 * falls back to a wrong/garbled glyph (confirmed: "24,915.00" rendered as
 * "24/915,00 $NA" in a real generated PDF). ASCII-only formatting sidesteps
 * the font gap entirely; scoped to this one file since every other page in
 * the app renders in a real browser with full Unicode font support. */
function formatMoneyForPdf(minor: number, currency: Currency): string {
  const parts = (minor / 100).toFixed(2).split('.');
  const whole = parts[0] ?? '0';
  const decimals = parts[1] ?? '00';
  const withThousands = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency} ${withThousands}.${decimals}`;
}

export type PdfLocale = 'en' | 'fr';

const COMPANY = {
  name: 'Mufasa Safaris & Tours CC',
  addressLine1: '233 Virgin Island, Rocky Crest, Windhoek',
  addressLine2: 'P.O. Box 22891 Windhoek',
  email: 'mfaustin844@gmail.com',
  phone: '+264 812 723 921',
  registrationId: 'CC/2019/01378',
};

const FOOTER = {
  ntb: 'NTB: TFA01163',
  emails: 'info@mufasasafaris.com / faustin@mufasasafaris.com',
  poweredBy: 'Powered by Cyber PolCo',
};

// Display order matches CLAUDE.md's own operating-country list; the
// country names themselves are hardcoded (not COUNTRY_CODES-driven) since
// this footer line is fixed regardless of which countries a given package
// happens to touch.
const OPERATING_COUNTRIES: Record<PdfLocale, string> = {
  en: 'Operating in Namibia, DRC, Zambia & Zimbabwe',
  fr: "Opérant en Namibie, RDC, Zambie et au Zimbabwe",
};

const LABELS: Record<PdfLocale, Record<string, string>> = {
  en: {
    proposedItinerary: 'Proposed Itinerary',
    packageReference: 'Package reference',
    companyRegistration: 'Reg.',
    itinerarySummary: 'Itinerary Summary',
    day: 'Day',
    hotel: 'Hotel',
    restaurant: 'Restaurant',
    activities: 'Activities',
    none: '—',
    costSummary: 'Cost Summary',
    participants: 'Number of participants',
    accommodationHeading: 'Accommodation (per person, per night)',
    rateNotConfigured: 'rate not currently configured',
    activitiesTotal: 'Activities (total)',
    adminTotal: 'Admin cost (total)',
    transportPerPerson: 'Transportation (per person)',
    platformFeePerPerson: 'Platform fee (per person)',
    grandTotalPerPerson: 'Grand total (per person)',
    // DR-152: client-facing variant -- no internal cost buckets, just the
    // participant count and the one price that's actually charged.
    pricingHeading: 'Pricing',
    totalPerPerson: 'Total price (per person)',
  },
  fr: {
    proposedItinerary: 'Itinéraire proposé',
    packageReference: 'Référence du forfait',
    companyRegistration: 'Enr.',
    itinerarySummary: "Résumé de l'itinéraire",
    day: 'Jour',
    hotel: 'Hôtel',
    restaurant: 'Restaurant',
    activities: 'Activités',
    none: '—',
    costSummary: 'Résumé des coûts',
    participants: 'Nombre de participants',
    accommodationHeading: 'Hébergement (par personne, par nuit)',
    rateNotConfigured: 'tarif non configuré actuellement',
    activitiesTotal: 'Activités (total)',
    adminTotal: 'Frais administratifs (total)',
    transportPerPerson: 'Transport (par personne)',
    platformFeePerPerson: 'Frais de plateforme (par personne)',
    grandTotalPerPerson: 'Total général (par personne)',
    pricingHeading: 'Tarification',
    totalPerPerson: 'Prix total (par personne)',
  },
};

export interface PackageSummaryPdfDay {
  dayNumber: number;
  hotelName: string | null;
  restaurantName: string | null;
  activitiesLabel: string | null;
}

export interface PackageSummaryPdfAccommodationRow {
  dayNumber: number;
  hotelName: string;
  nightlyRateMinor: number | null; // null = rate no longer resolvable
}

export interface PackageSummaryPdfInput {
  locale: PdfLocale;
  currency: Currency;
  title: string;
  packageReference: string;
  referenceGroupSize: number;
  priceMinor: number; // TourPackage.priceMinor -- the authoritative per-seat total
  computedActivitiesMinor: number;
  computedAdminMinor: number;
  computedTransportMinor: number;
  computedPlatformFeeMinor: number;
  days: PackageSummaryPdfDay[];
  accommodationRows: PackageSummaryPdfAccommodationRow[];
}

// DR-152 (explicit user request): the client-facing counterpart to
// PackageSummaryPdfInput above -- same itinerary content, but deliberately
// carries none of the internal cost-bucket fields (activities/admin/
// transport/platform-fee totals, per-night accommodation rates). Only what
// a guest is actually charged (priceMinor, the per-seat total) and the
// headcount it's based on.
export interface ClientPackageSummaryPdfInput {
  locale: PdfLocale;
  currency: Currency;
  title: string;
  packageReference: string;
  referenceGroupSize: number;
  priceMinor: number;
  days: PackageSummaryPdfDay[];
}

const COLORS = { navy: '#3B1F3A', amber: '#D65B2E', forest: '#2F6E4F', mist: '#8C7D78', ink: '#211A1D', rule: '#E3D6C8', bone: '#F6EFE4' };

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingHorizontal: 32, paddingBottom: 72, fontSize: 9, color: COLORS.ink, fontFamily: PDF_FONT_BODY },
  headerRow: { flexDirection: 'row', marginBottom: 20 },
  companyBlock: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, width: 220 },
  companyText: { fontSize: 8, color: COLORS.mist, lineHeight: 1.4 },
  companyName: { fontSize: 10, fontWeight: 700, color: COLORS.navy, marginBottom: 2 },
  titleBlock: { alignItems: 'center', flex: 1, paddingTop: 2 },
  heading: { fontSize: 15, fontWeight: 700, color: COLORS.navy, marginBottom: 4, textAlign: 'center' },
  packageTitle: { fontSize: 12, fontWeight: 700, color: COLORS.ink, textAlign: 'center' },
  packageRef: { fontSize: 9, color: COLORS.mist, marginTop: 2, textAlign: 'center', fontFamily: PDF_FONT_CODE },
  sectionHeading: { fontSize: 12, fontWeight: 700, color: COLORS.forest, marginTop: 16, marginBottom: 6 },
  tableHeaderRow: { flexDirection: 'row', borderBottom: `1pt solid ${COLORS.rule}`, paddingBottom: 4, marginBottom: 2 },
  tableRow: { flexDirection: 'row', borderBottom: `0.5pt solid ${COLORS.rule}`, paddingVertical: 4 },
  colDay: { width: 40, fontWeight: 700 },
  colHotel: { flex: 1 },
  colRestaurant: { flex: 1 },
  colActivities: { flex: 1.4 },
  colRate: { width: 90, textAlign: 'right' },
  headerCell: { fontSize: 8, fontWeight: 700, color: COLORS.mist, textTransform: 'uppercase' },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottom: `0.5pt solid ${COLORS.rule}` },
  costLabel: {},
  costValue: { fontWeight: 700 },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 4, borderTop: `1.5pt solid ${COLORS.navy}` },
  grandTotalLabel: { fontSize: 11, fontWeight: 700, color: COLORS.navy },
  grandTotalValue: { fontSize: 13, fontWeight: 700, color: COLORS.navy },
  footer: { position: 'absolute', bottom: 24, left: 32, right: 32, borderTop: `0.5pt solid ${COLORS.rule}`, paddingTop: 6, alignItems: 'center' },
  footerText: { fontSize: 7, color: COLORS.mist, textAlign: 'center', marginTop: 1 },
});

// DR-152: shared between the staff and client render functions, so the
// company block/title/itinerary table/footer chrome can never drift
// between the two documents -- only the pricing section differs.
function DocumentHeader({ t, title, packageReference }: { t: Record<string, string>; title: string; packageReference: string }) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.companyBlock}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's
            Image is a PDF layout node, not an HTML <img>; it has no alt prop
            at all, so the DOM a11y rule is a false positive here. */}
        <Image src={BRAND_LOGO_DATA_URI} style={{ width: 48, height: 48 }} />
        <View>
          <Text style={styles.companyName}>{COMPANY.name}</Text>
          <Text style={styles.companyText}>{COMPANY.addressLine1}</Text>
          <Text style={styles.companyText}>{COMPANY.addressLine2}</Text>
          <Text style={styles.companyText}>{COMPANY.email}</Text>
          <Text style={styles.companyText}>{COMPANY.phone}</Text>
          <Text style={styles.companyText}>
            {t.companyRegistration}: {COMPANY.registrationId}
          </Text>
        </View>
      </View>
      <View style={styles.titleBlock}>
        <Text style={styles.heading}>{t.proposedItinerary}</Text>
        <Text style={styles.packageTitle}>{title}</Text>
        <Text style={styles.packageRef}>
          {t.packageReference}: {packageReference}
        </Text>
      </View>
    </View>
  );
}

function ItineraryTable({ t, days }: { t: Record<string, string>; days: PackageSummaryPdfDay[] }) {
  return (
    <>
      <Text style={styles.sectionHeading}>{t.itinerarySummary}</Text>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.headerCell, styles.colDay]}>{t.day}</Text>
        <Text style={[styles.headerCell, styles.colHotel]}>{t.hotel}</Text>
        <Text style={[styles.headerCell, styles.colRestaurant]}>{t.restaurant}</Text>
        <Text style={[styles.headerCell, styles.colActivities]}>{t.activities}</Text>
      </View>
      {days.map((d) => (
        <View key={d.dayNumber} style={styles.tableRow}>
          <Text style={styles.colDay}>{d.dayNumber}</Text>
          <Text style={styles.colHotel}>{d.hotelName ?? t.none}</Text>
          <Text style={styles.colRestaurant}>{d.restaurantName ?? t.none}</Text>
          <Text style={styles.colActivities}>{d.activitiesLabel ?? t.none}</Text>
        </View>
      ))}
    </>
  );
}

function DocumentFooter({ locale }: { locale: PdfLocale }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>{FOOTER.ntb}</Text>
      <Text style={styles.footerText}>{FOOTER.emails}</Text>
      <Text style={styles.footerText}>{OPERATING_COUNTRIES[locale]}</Text>
      <Text style={styles.footerText}>{FOOTER.poweredBy}</Text>
    </View>
  );
}

/** Staff-only: full cost breakdown, including per-day accommodation rates
 * and every internal cost bucket. Never handed to a guest -- see
 * renderClientPackageSummaryPdf below for the version that is. */
export async function renderPackageSummaryPdf(input: PackageSummaryPdfInput): Promise<Buffer> {
  registerPdfFonts();
  const t = LABELS[input.locale];
  const fmt = (minor: number) => formatMoneyForPdf(minor, input.currency);
  const transportPerPerson = Math.round(input.computedTransportMinor / input.referenceGroupSize);
  const platformFeePerPerson = Math.round(input.computedPlatformFeeMinor / input.referenceGroupSize);

  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <DocumentHeader t={t} title={input.title} packageReference={input.packageReference} />
        <ItineraryTable t={t} days={input.days} />

        <Text style={styles.sectionHeading}>{t.costSummary}</Text>
        <View style={styles.costRow}>
          <Text style={styles.costLabel}>{t.participants}</Text>
          <Text style={styles.costValue}>{input.referenceGroupSize}</Text>
        </View>

        <Text style={[styles.headerCell, { marginTop: 8, marginBottom: 2 }]}>{t.accommodationHeading}</Text>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.headerCell, styles.colDay]}>{t.day}</Text>
          <Text style={[styles.headerCell, styles.colHotel]}>{t.hotel}</Text>
          <Text style={[styles.headerCell, styles.colRate]}>{}</Text>
        </View>
        {input.accommodationRows.map((r) => (
          <View key={r.dayNumber} style={styles.tableRow}>
            <Text style={styles.colDay}>{r.dayNumber}</Text>
            <Text style={styles.colHotel}>{r.hotelName}</Text>
            <Text style={styles.colRate}>{r.nightlyRateMinor != null ? fmt(r.nightlyRateMinor) : t.rateNotConfigured}</Text>
          </View>
        ))}

        <View wrap={false}>
          <View style={[styles.costRow, { marginTop: 8 }]}>
            <Text style={styles.costLabel}>{t.activitiesTotal}</Text>
            <Text style={styles.costValue}>{fmt(input.computedActivitiesMinor)}</Text>
          </View>
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>{t.adminTotal}</Text>
            <Text style={styles.costValue}>{fmt(input.computedAdminMinor)}</Text>
          </View>
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>{t.transportPerPerson}</Text>
            <Text style={styles.costValue}>{fmt(transportPerPerson)}</Text>
          </View>
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>{t.platformFeePerPerson}</Text>
            <Text style={styles.costValue}>{fmt(platformFeePerPerson)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>{t.grandTotalPerPerson}</Text>
            <Text style={styles.grandTotalValue}>{fmt(input.priceMinor)}</Text>
          </View>
        </View>

        <DocumentFooter locale={input.locale} />
      </Page>
    </Document>,
  );
}

/** DR-152 (explicit user request): client-facing counterpart -- same
 * itinerary content, but no internal cost buckets/per-night rates at all,
 * only the participant count and the one total a guest is actually
 * charged (TourPackage.priceMinor, already tax + platform-fee inclusive
 * per DR-134). Meant to be forwarded to a guest as-is. */
export async function renderClientPackageSummaryPdf(input: ClientPackageSummaryPdfInput): Promise<Buffer> {
  registerPdfFonts();
  const t = LABELS[input.locale];
  const fmt = (minor: number) => formatMoneyForPdf(minor, input.currency);

  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <DocumentHeader t={t} title={input.title} packageReference={input.packageReference} />
        <ItineraryTable t={t} days={input.days} />

        <Text style={styles.sectionHeading}>{t.pricingHeading}</Text>
        <View style={styles.costRow}>
          <Text style={styles.costLabel}>{t.participants}</Text>
          <Text style={styles.costValue}>{input.referenceGroupSize}</Text>
        </View>
        <View style={[styles.grandTotalRow, { marginTop: 8 }]}>
          <Text style={styles.grandTotalLabel}>{t.totalPerPerson}</Text>
          <Text style={styles.grandTotalValue}>{fmt(input.priceMinor)}</Text>
        </View>

        <DocumentFooter locale={input.locale} />
      </Page>
    </Document>,
  );
}
