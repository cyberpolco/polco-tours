// itinerary module — detailed, whole-itinerary PDF (staff/guide/driver
// download once an itinerary is APPROVED). Mirrors map-pdf.tsx's shape
// (plain @react-pdf/renderer Document/Page/View/Text) -- this is an
// internal operational document, not a client-facing proposal like
// finance/package-summary-pdf.tsx, so it skips that file's full
// company-letterhead treatment (address/registration block), keeping just
// a small logo badge next to the heading. There is no price/money field
// anywhere on Itinerary/ItineraryDay, so "without the prices" needs no
// stripping logic -- this data is inherently price-free.
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { PDF_FONT_BODY, PDF_FONT_CODE, registerPdfFonts } from '@lib/pdf-fonts';
import { BRAND_LOGO_DATA_URI } from '@lib/brand-logo';

const COLORS = { navy: '#3B1F3A', forest: '#2F6E4F', mist: '#8C7D78', ink: '#211A1D', rule: '#E3D6C8' };

// Same letterhead footer as invoicing/invoice-pdf.tsx's DocumentFooter --
// this file has no locale/LABELS dict of its own (English-only, per the
// header note above), so the footer's "operating in" line is hardcoded to
// its English form rather than threading a locale param through just for
// this.
const FOOTER = {
  ntb: 'NTB: TFA01163',
  emails: 'info@mufasasafaris.com / faustin@mufasasafaris.com',
  operatingCountries: 'Operating in Namibia, DRC, Zambia, Zimbabwe & Botswana',
  poweredBy: 'Powered by Cyber PolCo',
};

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingHorizontal: 32, paddingBottom: 72, fontSize: 10, color: COLORS.ink, fontFamily: PDF_FONT_BODY },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  heading: { fontSize: 16, fontWeight: 700, color: COLORS.navy },
  subheading: { fontSize: 10, color: COLORS.mist, marginBottom: 2 },
  bookingRef: { fontSize: 10, color: COLORS.mist, marginBottom: 2, fontFamily: PDF_FONT_CODE },
  headerRule: { borderBottom: `1pt solid ${COLORS.rule}`, marginTop: 8, marginBottom: 14 },
  dayBlock: { marginBottom: 14 },
  dayTitle: { fontSize: 12, fontWeight: 700, color: COLORS.forest, marginBottom: 4 },
  dayTimes: { fontSize: 9, color: COLORS.mist, marginBottom: 4 },
  row: { flexDirection: 'row', marginBottom: 2 },
  rowLabel: { width: 100, fontWeight: 700 },
  rowValue: { flex: 1 },
  dayRule: { borderBottom: `0.5pt solid ${COLORS.rule}`, marginTop: 8 },
  footer: { position: 'absolute', bottom: 24, left: 32, right: 32, borderTop: `0.5pt solid ${COLORS.rule}`, paddingTop: 6, alignItems: 'center' },
  footerText: { fontSize: 7, color: COLORS.mist, textAlign: 'center', marginTop: 1 },
});

function DocumentFooter() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>{FOOTER.ntb}</Text>
      <Text style={styles.footerText}>{FOOTER.emails}</Text>
      <Text style={styles.footerText}>{FOOTER.operatingCountries}</Text>
      <Text style={styles.footerText}>{FOOTER.poweredBy}</Text>
    </View>
  );
}

export interface ItinerarySummaryPdfDay {
  dayNumber: number;
  date: Date;
  departureTime: string | null;
  arrivalTime: string | null;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  hotelName: string | null;
  restaurantName: string | null;
  siteNames: string[];
  activityNames: string[];
  activitiesNote: string | null;
  estimatedTravelMinutes: number | null;
  notes: string | null;
}

export interface ItinerarySummaryPdfInput {
  bookingReference: string;
  travelDates: string;
  emergencyContact: string | null;
  notes: string | null;
  days: ItinerarySummaryPdfDay[];
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export async function renderItinerarySummaryPdf(input: ItinerarySummaryPdfInput): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.titleRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's
              Image is a PDF layout node, not an HTML <img>; it has no alt prop
              at all, so the DOM a11y rule is a false positive here. */}
          <Image src={BRAND_LOGO_DATA_URI} style={{ width: 48, height: 48 }} />
          <Text style={styles.heading}>Detailed Itinerary</Text>
        </View>
        <Text style={styles.bookingRef}>Booking reference: {input.bookingReference}</Text>
        <Text style={styles.subheading}>Travel dates (estimated): {input.travelDates}</Text>
        {input.emergencyContact && <Text style={styles.subheading}>Emergency contact: {input.emergencyContact}</Text>}
        {input.notes && <Text style={styles.subheading}>Notes: {input.notes}</Text>}
        <View style={styles.headerRule} />

        {input.days.map((day) => (
          <View key={day.dayNumber} style={styles.dayBlock} wrap={false}>
            <Text style={styles.dayTitle}>
              Day {day.dayNumber} — {day.date.toISOString().slice(0, 10)}
            </Text>
            {(day.departureTime || day.arrivalTime) && (
              <Text style={styles.dayTimes}>
                {day.departureTime ? `Depart ${day.departureTime}` : ''}
                {day.departureTime && day.arrivalTime ? '  ·  ' : ''}
                {day.arrivalTime ? `Arrive ${day.arrivalTime}` : ''}
              </Text>
            )}
            {day.pickupLocation && <Field label="Pickup" value={day.pickupLocation} />}
            {day.dropoffLocation && <Field label="Drop-off" value={day.dropoffLocation} />}
            {day.hotelName && <Field label="Hotel" value={day.hotelName} />}
            {day.restaurantName && <Field label="Restaurant" value={day.restaurantName} />}
            {day.siteNames.length > 0 && <Field label="Planned sites" value={day.siteNames.join(' → ')} />}
            {day.activityNames.length > 0 && <Field label="Activities" value={day.activityNames.join(', ')} />}
            {day.activitiesNote && <Field label="Activity notes" value={day.activitiesNote} />}
            {day.estimatedTravelMinutes != null && (
              <Field label="Est. travel" value={`${day.estimatedTravelMinutes} min`} />
            )}
            {day.notes && <Field label="Notes" value={day.notes} />}
            <View style={styles.dayRule} />
          </View>
        ))}

        <DocumentFooter />
      </Page>
    </Document>,
  );
}
