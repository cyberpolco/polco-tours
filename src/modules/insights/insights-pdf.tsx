// insights module — dashboard export PDF (DR-193, explicit user request).
// Mirrors finance/package-summary-pdf.tsx's shape exactly: @react-pdf/
// renderer components are its own React reconciler (Document/Page/View/
// Text/Image host nodes, not DOM), server-side only, Node runtime.
//
// Deliberately does NOT use next-intl (same precedent as every other PDF in
// this app) -- src/i18n/request.ts's getRequestConfig ignores an explicit
// locale override and always reads the cookie, so a `getTranslations`
// call here would silently resolve the wrong language. This file's own
// LABELS dict reuses the exact EN/FR wording already shown on the live
// dashboard (src/messages/{en,fr}.json's StaffInsights namespace) so the
// PDF never reads as a re-translation of the same numbers.
//
// No charts -- the live dashboard's rings/donuts/funnels are DOM/SVG
// components with no server-renderable equivalent in this app (unlike
// itinerary/map-pdf.tsx, which reuses a real Static Maps *image*). Every
// figure the dashboard shows is still here, as a table/stat row instead of
// a chart -- an honest complete rendering, not a simplified one.
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { Currency } from '@prisma/client';
import { PDF_FONT_BODY, PDF_FONT_CODE, registerPdfFonts } from '@lib/pdf-fonts';
import { BRAND_LOGO_DATA_URI } from '@lib/brand-logo';
import { GUEST_GEOGRAPHY_NOT_COLLECTED } from './domain';
import type { DashboardSectionKey, DashboardSummary, MoneyByCurrency } from './domain';

export type PdfLocale = 'en' | 'fr';

// Same ASCII-only reasoning as package-summary-pdf.tsx's formatMoneyForPdf:
// react-pdf's font can't render every locale's thousands-grouping glyph.
function formatMoneyForPdf(minor: number, currency: Currency): string {
  const parts = (minor / 100).toFixed(2).split('.');
  const whole = parts[0] ?? '0';
  const decimals = parts[1] ?? '00';
  const withThousands = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency} ${withThousands}.${decimals}`;
}

// Never sums across currencies (BR-02) -- same "+"-joined convention as
// InsightsDashboardClient.tsx's own formatMoneyByCurrency.
function formatBucketForPdf(bucket: MoneyByCurrency): string {
  const entries = Object.entries(bucket) as [Currency, number][];
  if (entries.length === 0) return '—';
  return entries.map(([currency, minor]) => formatMoneyForPdf(minor, currency)).join(' + ');
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

const WIZARD_STEP_LABELS: Record<PdfLocale, Record<string, string>> = {
  en: {
    destination: 'Destination',
    dates: 'Dates',
    travelers: 'Travelers',
    preferences: 'Preferences',
    sites: 'Sites',
    yourTrip: 'Your trip',
    addOns: 'Add-ons',
    specialRequests: 'Special requests',
    contact: 'Contact',
  },
  fr: {
    destination: 'Destination',
    dates: 'Dates',
    travelers: 'Voyageurs',
    preferences: 'Préférences',
    sites: 'Sites',
    yourTrip: 'Votre voyage',
    addOns: 'Options',
    specialRequests: 'Demandes spéciales',
    contact: 'Contact',
  },
};

const FUNNEL_STAGE_LABELS: Record<PdfLocale, Record<string, string>> = {
  en: { AWAITING_QUOTATION: 'Awaiting quotation', QUOTATION_SENT: 'Quotation sent', CONFIRMED_OR_LATER: 'Confirmed or later' },
  fr: { AWAITING_QUOTATION: 'En attente de devis', QUOTATION_SENT: 'Devis envoyé', CONFIRMED_OR_LATER: 'Confirmé ou au-delà' },
};

// Wording lifted verbatim from src/messages/{en,fr}.json's StaffInsights
// namespace (the live dashboard) so the export never reads as a
// re-translation of the same figures -- plus a handful of PDF-only keys
// (reportTitle/dateRange/generatedAt/allTime/noData) that have no on-screen
// equivalent.
// A plain `Record<string, string>` value type loses its literal keys, so
// `t.reportTitle` etc. below would type as `string | undefined` under this
// tsconfig's `noUncheckedIndexedAccess` (real, hit while wiring the export
// route -- `t.foo` reads as an index-signature access, not a known
// property, unless the value type is the actual finite key union instead
// of `string`). Deriving `LabelKey` from EN_LABELS's own keys, then typing
// both locales against it, keeps every key access a plain (non-optional)
// `string` while still enforcing en/fr have exactly the same key set.
const EN_LABELS = {
  reportTitle: 'Insights Report',
    dateRange: 'Date range',
    generatedAt: 'Generated',
    allTime: 'All time',
    noData: '—',
    bookings: 'Bookings',
    totalBookings: 'Total bookings',
    activeTours: 'Active tours',
    pendingQuotations: 'Pending quotations',
    conversionRate: 'Conversion rate',
    bookingsTrend: 'Bookings over time',
    revenue: 'Revenue',
    revenueLabel: 'Revenue',
    outstanding: 'Outstanding',
    averageBookingValue: 'Average booking value',
    totalDiscountGiven: 'Total discount given',
    taxCollected: 'Tax collected',
    platformFeeCollected: 'Platform fee collected',
    couponRedemptionCount: 'Coupon redemptions',
    depositVsFullPaid: 'Payment plan',
    depositPath: 'Deposit + balance',
    fullPath: 'Paid in full',
    byCountry: 'By country',
    byPackage: 'By package',
    noRevenueYet: 'No revenue yet.',
    revenueTrend: 'Revenue over time',
    operations: 'Operations',
    fleetUtilization: 'Fleet utilization',
    driverUtilization: 'Driver utilization',
    guideUtilization: 'Guide utilization',
    mostBookedDestinations: 'Most booked destinations',
    noBookingsYet: 'No bookings yet.',
    staffStats: 'Staff Stats',
    activeStaff: 'Active',
    deactivatedStaff: 'Deactivated',
    inactiveStaff: 'Dormant',
    headcountByRole: 'Headcount by role',
    fleetAvailability: 'Fleet availability',
    vehicles: 'Vehicles',
    drivers: 'Drivers',
    guides: 'Guides',
    guestStats: 'Guest Stats',
    newGuests: 'New guests',
    returningGuests: 'Returning guests',
    originSplit: 'Booking origin',
    predefinedPackage: 'Predefined package',
    tailorMade: 'Tailor-made',
    geography: 'Guest geography',
    notCollected: 'Not collected',
    bookingStageFunnel: 'Tailor-made booking pipeline',
    cancellationRate: 'Cancellation rate',
    wizardFunnel: 'Plan-my-trip wizard funnel',
    newGuestsTrend: 'New guests over time',
    customerExperience: 'Customer Experience',
    averageRating: 'Average rating',
    noRatingsYet: 'No ratings yet.',
    repeatCustomers: 'Repeat customers',
    topGuides: 'Top-performing guides',
    noRatedGuidesYet: 'No rated guides yet.',
    topDrivers: 'Top-performing drivers',
    noRatedDriversYet: 'No rated drivers yet.',
    immigration: 'Immigration',
    pendingVisas: 'Pending visas',
    approvedVisas: 'Approved visas',
    rejectedVisas: 'Rejected visas',
    missingDocuments: 'Missing documents',
    visaTrend: 'Visa applications over time',
    period: 'Period',
    count: 'Count',
    amount: 'Amount',
    name: 'Name',
    rating: 'Rating',
    status: 'Status',
} as const;

type LabelKey = keyof typeof EN_LABELS;

const LABELS: Record<PdfLocale, Record<LabelKey, string>> = {
  en: EN_LABELS,
  fr: {
    reportTitle: "Rapport d'analyses",
    dateRange: 'Période',
    generatedAt: 'Généré le',
    allTime: 'Depuis toujours',
    noData: '—',
    bookings: 'Réservations',
    totalBookings: 'Total des réservations',
    activeTours: 'Voyages actifs',
    pendingQuotations: 'Devis en attente',
    conversionRate: 'Taux de conversion',
    bookingsTrend: 'Réservations dans le temps',
    revenue: 'Revenus',
    revenueLabel: 'Revenus',
    outstanding: 'En attente',
    averageBookingValue: 'Valeur moyenne des réservations',
    totalDiscountGiven: 'Remises totales accordées',
    taxCollected: 'Taxes perçues',
    platformFeeCollected: 'Frais de plateforme perçus',
    couponRedemptionCount: 'Coupons utilisés',
    depositVsFullPaid: 'Mode de paiement',
    depositPath: 'Acompte + solde',
    fullPath: 'Payé intégralement',
    byCountry: 'Par pays',
    byPackage: 'Par circuit',
    noRevenueYet: "Aucun revenu pour l'instant.",
    revenueTrend: 'Revenus dans le temps',
    operations: 'Opérations',
    fleetUtilization: 'Utilisation de la flotte',
    driverUtilization: 'Utilisation des chauffeurs',
    guideUtilization: 'Utilisation des guides',
    mostBookedDestinations: 'Destinations les plus réservées',
    noBookingsYet: 'Aucune réservation pour l’instant.',
    staffStats: 'Statistiques du personnel',
    activeStaff: 'Actifs',
    deactivatedStaff: 'Désactivés',
    inactiveStaff: 'Dormants',
    headcountByRole: 'Effectifs par rôle',
    fleetAvailability: 'Disponibilité de la flotte',
    vehicles: 'Véhicules',
    drivers: 'Chauffeurs',
    guides: 'Guides',
    guestStats: 'Statistiques clients',
    newGuests: 'Nouveaux clients',
    returningGuests: 'Clients de retour',
    originSplit: 'Origine des réservations',
    predefinedPackage: 'Circuit prédéfini',
    tailorMade: 'Sur mesure',
    geography: 'Origine géographique des clients',
    notCollected: 'Non collecté',
    bookingStageFunnel: 'Pipeline des réservations sur mesure',
    cancellationRate: "Taux d'annulation",
    wizardFunnel: "Entonnoir de l'assistant Créer mon voyage",
    newGuestsTrend: 'Nouveaux clients dans le temps',
    customerExperience: 'Expérience client',
    averageRating: 'Note moyenne',
    noRatingsYet: "Aucune évaluation pour l'instant.",
    repeatCustomers: 'Clients fidèles',
    topGuides: 'Guides les plus performants',
    noRatedGuidesYet: "Aucun guide évalué pour l'instant.",
    topDrivers: 'Chauffeurs les plus performants',
    noRatedDriversYet: "Aucun chauffeur évalué pour l'instant.",
    immigration: 'Immigration',
    pendingVisas: 'Visas en attente',
    approvedVisas: 'Visas approuvés',
    rejectedVisas: 'Visas rejetés',
    missingDocuments: 'Documents manquants',
    visaTrend: 'Demandes de visa dans le temps',
    period: 'Période',
    count: 'Nombre',
    amount: 'Montant',
    name: 'Nom',
    rating: 'Note',
    status: 'Statut',
  },
};

// Extended past package-summary-pdf.tsx's own FOOTER -- explicit user
// request for this document specifically to also carry the company
// website, not just the "Powered by" credit line.
const FOOTER = {
  poweredBy: 'Powered by Cyber PolCo | www.cyberpolco.com',
};

const WEBSITE_NAME = 'Mufasa Safaris & Tours';

const COLORS = { navy: '#3B1F3A', amber: '#D65B2E', forest: '#2F6E4F', mist: '#8C7D78', ink: '#211A1D', rule: '#E3D6C8', bone: '#F6EFE4' };

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingHorizontal: 32, paddingBottom: 56, fontSize: 9, color: COLORS.ink, fontFamily: PDF_FONT_BODY },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  websiteName: { fontSize: 16, fontWeight: 700, color: COLORS.navy },
  reportTitle: { fontSize: 11, color: COLORS.mist, marginTop: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, marginBottom: 16, paddingBottom: 8, borderBottom: `1pt solid ${COLORS.rule}` },
  metaText: { fontSize: 8, color: COLORS.mist },
  sectionHeading: { fontSize: 13, fontWeight: 700, color: COLORS.forest, marginTop: 18, marginBottom: 6 },
  subHeading: { fontSize: 9, fontWeight: 700, color: COLORS.mist, textTransform: 'uppercase', marginTop: 10, marginBottom: 3 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 4 },
  statTile: { minWidth: 130 },
  statLabel: { fontSize: 8, color: COLORS.mist },
  statValue: { fontSize: 13, fontWeight: 700, color: COLORS.navy, marginTop: 1 },
  tableHeaderRow: { flexDirection: 'row', borderBottom: `1pt solid ${COLORS.rule}`, paddingBottom: 3, marginTop: 6, marginBottom: 2 },
  tableRow: { flexDirection: 'row', borderBottom: `0.5pt solid ${COLORS.rule}`, paddingVertical: 3 },
  headerCell: { fontSize: 7.5, fontWeight: 700, color: COLORS.mist, textTransform: 'uppercase' },
  colWide: { flex: 2 },
  colNarrow: { flex: 1, textAlign: 'right' },
  colMid: { flex: 1 },
  noDataText: { fontSize: 8, color: COLORS.mist, fontStyle: 'italic', marginTop: 2, marginBottom: 4 },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 32,
    right: 32,
    borderTop: `0.5pt solid ${COLORS.rule}`,
    paddingTop: 6,
    alignItems: 'center',
  },
  footerText: { fontSize: 7, color: COLORS.mist, textAlign: 'center', fontFamily: PDF_FONT_CODE },
});

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function SimpleTable({
  headers,
  rows,
  emptyLabel,
}: {
  headers: string[];
  rows: string[][];
  emptyLabel: string;
}) {
  if (rows.length === 0) return <Text style={styles.noDataText}>{emptyLabel}</Text>;
  return (
    <>
      <View style={styles.tableHeaderRow}>
        {headers.map((h, i) => (
          <Text key={i} style={[styles.headerCell, i === 0 ? styles.colWide : styles.colNarrow]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((cells, rowIndex) => (
        <View key={rowIndex} style={styles.tableRow}>
          {cells.map((cell, i) => (
            <Text key={i} style={i === 0 ? styles.colWide : styles.colNarrow}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </>
  );
}

function DocumentHeader({ t, rangeLabel, generatedAtLabel }: { t: Record<string, string>; rangeLabel: string; generatedAtLabel: string }) {
  return (
    <>
      <View style={styles.headerRow}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image is a PDF layout node, not an HTML <img> */}
        <Image src={BRAND_LOGO_DATA_URI} style={{ width: 48, height: 48 }} />
        <View>
          <Text style={styles.websiteName}>{WEBSITE_NAME}</Text>
          <Text style={styles.reportTitle}>{t.reportTitle}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          {t.dateRange}: {rangeLabel}
        </Text>
        <Text style={styles.metaText}>
          {t.generatedAt}: {generatedAtLabel}
        </Text>
      </View>
    </>
  );
}

function DocumentFooter() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>{FOOTER.poweredBy}</Text>
    </View>
  );
}

export interface InsightsPdfInput {
  locale: PdfLocale;
  sections: DashboardSectionKey[];
  rangeLabel: string;
  generatedAtLabel: string;
  summary: DashboardSummary;
}

export async function renderInsightsPdf(input: InsightsPdfInput): Promise<Buffer> {
  registerPdfFonts();
  const t = LABELS[input.locale];
  const wizardLabels = WIZARD_STEP_LABELS[input.locale];
  const funnelLabels = FUNNEL_STAGE_LABELS[input.locale];
  const sections = new Set(input.sections);
  const { summary } = input;

  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <DocumentHeader t={t} rangeLabel={input.rangeLabel} generatedAtLabel={input.generatedAtLabel} />

        {sections.has('bookings') && (
          <View>
            <Text style={styles.sectionHeading}>{t.bookings}</Text>
            <View style={styles.statGrid}>
              <StatTile label={t.totalBookings} value={String(summary.bookings.totalBookings)} />
              <StatTile label={t.activeTours} value={String(summary.bookings.activeTours)} />
              <StatTile label={t.pendingQuotations} value={String(summary.bookings.pendingQuotations)} />
              <StatTile label={t.conversionRate} value={formatPercent(summary.bookings.conversionRate)} />
            </View>
            <Text style={styles.subHeading}>{t.bookingsTrend}</Text>
            <SimpleTable
              headers={[t.period, t.count]}
              rows={summary.trends.bookings.map((p) => [p.periodStart, String(p.value)])}
              emptyLabel={t.noData}
            />
          </View>
        )}

        {sections.has('revenue') && (
          <View>
            <Text style={styles.sectionHeading}>{t.revenue}</Text>
            <View style={styles.statGrid}>
              <StatTile label={t.revenueLabel} value={formatBucketForPdf(summary.revenue.revenue)} />
              <StatTile label={t.outstanding} value={formatBucketForPdf(summary.revenue.outstanding)} />
              <StatTile label={t.averageBookingValue} value={formatBucketForPdf(summary.revenue.averageBookingValue)} />
              <StatTile label={t.totalDiscountGiven} value={formatBucketForPdf(summary.revenue.totalDiscountGiven)} />
              <StatTile label={t.taxCollected} value={formatBucketForPdf(summary.revenue.taxCollected)} />
              <StatTile label={t.platformFeeCollected} value={formatBucketForPdf(summary.revenue.platformFeeCollected)} />
              <StatTile label={t.couponRedemptionCount} value={String(summary.revenue.couponRedemptionCount)} />
            </View>
            <Text style={styles.subHeading}>{t.depositVsFullPaid}</Text>
            <View style={styles.statGrid}>
              <StatTile label={t.depositPath} value={String(summary.revenue.depositVsFullPaid.depositPathCount)} />
              <StatTile label={t.fullPath} value={String(summary.revenue.depositVsFullPaid.fullPathCount)} />
            </View>
            <Text style={styles.subHeading}>{t.byCountry}</Text>
            <SimpleTable
              headers={[t.byCountry, t.amount]}
              rows={Object.entries(summary.revenue.revenueByCountry).map(([country, bucket]) => [country, formatBucketForPdf(bucket)])}
              emptyLabel={t.noRevenueYet}
            />
            <Text style={styles.subHeading}>{t.byPackage}</Text>
            <SimpleTable
              headers={[t.byPackage, t.amount]}
              rows={Object.entries(summary.revenue.revenueByPackage).map(([pkg, bucket]) => [pkg, formatBucketForPdf(bucket)])}
              emptyLabel={t.noRevenueYet}
            />
            <Text style={styles.subHeading}>{t.revenueTrend}</Text>
            {summary.trends.revenue.length === 0 ? (
              <Text style={styles.noDataText}>{t.noData}</Text>
            ) : (
              summary.trends.revenue.map((series) => (
                <View key={series.currency} style={{ marginBottom: 4 }}>
                  <Text style={[styles.headerCell, { marginBottom: 1 }]}>{series.currency}</Text>
                  <SimpleTable
                    headers={[t.period, t.amount]}
                    rows={series.points.map((p) => [p.periodStart, formatMoneyForPdf(p.amountMinor, series.currency)])}
                    emptyLabel={t.noData}
                  />
                </View>
              ))
            )}
          </View>
        )}

        {sections.has('operations') && (
          <View>
            <Text style={styles.sectionHeading}>{t.operations}</Text>
            <View style={styles.statGrid}>
              <StatTile label={t.fleetUtilization} value={formatPercent(summary.operations.fleetUtilization)} />
              <StatTile label={t.driverUtilization} value={formatPercent(summary.operations.driverUtilization)} />
              <StatTile label={t.guideUtilization} value={formatPercent(summary.operations.guideUtilization)} />
            </View>
            <Text style={styles.subHeading}>{t.mostBookedDestinations}</Text>
            <SimpleTable
              headers={[t.mostBookedDestinations, t.count]}
              rows={summary.operations.mostBookedDestinations.map((d) => [d.country, String(d.count)])}
              emptyLabel={t.noBookingsYet}
            />
          </View>
        )}

        {sections.has('staff') && (
          <View>
            <Text style={styles.sectionHeading}>{t.staffStats}</Text>
            <View style={styles.statGrid}>
              <StatTile label={t.activeStaff} value={String(summary.staff.activeCount)} />
              <StatTile label={t.deactivatedStaff} value={String(summary.staff.deactivatedCount)} />
              <StatTile label={t.inactiveStaff} value={String(summary.staff.inactiveCount)} />
            </View>
            <Text style={styles.subHeading}>{t.headcountByRole}</Text>
            <SimpleTable
              headers={[t.headcountByRole, t.count]}
              rows={Object.entries(summary.staff.byRole).map(([role, count]) => [role, String(count ?? 0)])}
              emptyLabel={t.noData}
            />
            <Text style={styles.subHeading}>{t.fleetAvailability}</Text>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              {(
                [
                  ['vehicles', t.vehicles],
                  ['drivers', t.drivers],
                  ['guides', t.guides],
                ] as const
              ).map(([key, label]) => (
                <View key={key} style={{ flex: 1 }}>
                  <Text style={[styles.headerCell, { marginBottom: 2 }]}>{label}</Text>
                  {Object.entries(summary.staff.fleetAvailability[key]).map(([status, count]) => (
                    <View key={status} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text>{status}</Text>
                      <Text>{count ?? 0}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}

        {sections.has('guest') && (
          <View>
            <Text style={styles.sectionHeading}>{t.guestStats}</Text>
            <View style={styles.statGrid}>
              <StatTile label={t.newGuests} value={String(summary.guest.newGuestCount)} />
              <StatTile label={t.returningGuests} value={String(summary.guest.returningGuestCount)} />
              <StatTile label={t.predefinedPackage} value={String(summary.guest.originSplit.predefinedPackage)} />
              <StatTile label={t.tailorMade} value={String(summary.guest.originSplit.tailorMade)} />
              <StatTile label={t.cancellationRate} value={formatPercent(summary.guest.cancellationRate)} />
            </View>
            <Text style={styles.subHeading}>{t.geography}</Text>
            <SimpleTable
              headers={[t.geography, t.count]}
              rows={Object.entries(summary.guest.geography).map(([country, count]) => [
                country === GUEST_GEOGRAPHY_NOT_COLLECTED ? t.notCollected : country,
                String(count),
              ])}
              emptyLabel={t.noData}
            />
            <Text style={styles.subHeading}>{t.bookingStageFunnel}</Text>
            <SimpleTable
              headers={[t.bookingStageFunnel, t.count]}
              rows={summary.guest.bookingStageFunnel.map((s) => [funnelLabels[s.stage] ?? s.stage, String(s.count)])}
              emptyLabel={t.noData}
            />
            <Text style={styles.subHeading}>{t.wizardFunnel}</Text>
            <SimpleTable
              headers={[t.wizardFunnel, t.count]}
              rows={summary.wizardFunnel.map((s) => [wizardLabels[s.label] ?? s.label, String(s.reachedCount)])}
              emptyLabel={t.noData}
            />
            <Text style={styles.subHeading}>{t.newGuestsTrend}</Text>
            <SimpleTable
              headers={[t.period, t.count]}
              rows={summary.trends.newGuests.map((p) => [p.periodStart, String(p.value)])}
              emptyLabel={t.noData}
            />
          </View>
        )}

        {sections.has('customerExperience') && (
          <View>
            <Text style={styles.sectionHeading}>{t.customerExperience}</Text>
            <View style={styles.statGrid}>
              <StatTile
                label={t.averageRating}
                value={summary.customerExperience.averageRating != null ? `${summary.customerExperience.averageRating.toFixed(1)} (${summary.customerExperience.ratingCount})` : t.noRatingsYet}
              />
              <StatTile label={t.repeatCustomers} value={String(summary.customerExperience.repeatCustomers)} />
            </View>
            <Text style={styles.subHeading}>{t.topGuides}</Text>
            <SimpleTable
              headers={[t.name, t.rating]}
              rows={summary.customerExperience.topGuides.map((g) => [g.name, `${g.averageRating.toFixed(1)} (${g.ratingCount})`])}
              emptyLabel={t.noRatedGuidesYet}
            />
            <Text style={styles.subHeading}>{t.topDrivers}</Text>
            <SimpleTable
              headers={[t.name, t.rating]}
              rows={summary.customerExperience.topDrivers.map((d) => [d.name, `${d.averageRating.toFixed(1)} (${d.ratingCount})`])}
              emptyLabel={t.noRatedDriversYet}
            />
          </View>
        )}

        {sections.has('immigration') && (
          <View>
            <Text style={styles.sectionHeading}>{t.immigration}</Text>
            <View style={styles.statGrid}>
              <StatTile label={t.pendingVisas} value={String(summary.immigration.pendingVisas)} />
              <StatTile label={t.approvedVisas} value={String(summary.immigration.approvedVisas)} />
              <StatTile label={t.rejectedVisas} value={String(summary.immigration.rejectedVisas)} />
              <StatTile label={t.missingDocuments} value={String(summary.immigration.missingDocuments)} />
            </View>
            <Text style={styles.subHeading}>{t.visaTrend}</Text>
            <SimpleTable
              headers={[t.period, t.count]}
              rows={summary.trends.visaApplications.map((p) => [p.periodStart, String(p.value)])}
              emptyLabel={t.noData}
            />
          </View>
        )}

        <DocumentFooter />
      </Page>
    </Document>,
  );
}
