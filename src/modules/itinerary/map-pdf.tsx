// itinerary module — Map tab PDF layout (DR-089, replaced by the
// whole-circuit version in DR-150). @react-pdf/renderer's components are
// its own React reconciler (Document/Page/View/Text/Image host nodes, not
// DOM) -- this runs server-side only, never rendered by Next's own React
// tree. Mirrors itinerary-summary-pdf.tsx's single-Document/day-block/
// wrap={false} shape -- one PDF for the whole tour, not one per day.
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { PDF_FONT_BODY, PDF_FONT_CODE, registerPdfFonts } from '@lib/pdf-fonts';
import { BRAND_LOGO_DATA_URI } from '@lib/brand-logo';
import type { MapStopView } from './domain';

const styles = StyleSheet.create({
  page: { paddingTop: 28, paddingHorizontal: 28, paddingBottom: 48, fontSize: 11, fontFamily: PDF_FONT_BODY },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 16 },
  subtitle: { fontSize: 10, color: '#8C7D78', marginBottom: 12, fontFamily: PDF_FONT_CODE },
  image: { width: '100%', marginBottom: 16 },
  dayBlock: { marginBottom: 10 },
  dayHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  colorSwatch: { width: 8, height: 8, marginRight: 6 },
  dayTitle: { fontSize: 12, fontWeight: 700, color: '#2F6E4F' },
  stopRow: { flexDirection: 'row', marginBottom: 2, paddingBottom: 2, borderBottom: '0.5pt solid #E3D6C8' },
  stopKind: { width: 90, fontWeight: 700, color: '#2F6E4F' },
  stopLabel: { flex: 1 },
  noCoords: { fontSize: 9, color: '#8C7D78', marginLeft: 8 },
  footer: { position: 'absolute', bottom: 20, left: 28, right: 28, borderTop: '0.5pt solid #E3D6C8', paddingTop: 6, alignItems: 'center' },
  footerText: { fontSize: 7, color: '#8C7D78' },
});

export interface ItineraryMapPdfDay {
  dayNumber: number;
  date: Date;
  /** CSS hex, e.g. '#D65B2E' -- matches this day's color in the map image
   * above, via src/lib/circuit-colors.ts. */
  color: string;
  stops: MapStopView[];
}

export interface ItineraryMapPdfInput {
  bookingReference: string;
  days: ItineraryMapPdfDay[];
}

export async function renderItineraryMapPdf(input: ItineraryMapPdfInput, mapImage: Buffer): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.titleRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- see the map-image Image below */}
          <Image src={BRAND_LOGO_DATA_URI} style={{ width: 32, height: 32 }} />
          <Text style={styles.title}>Tour Circuit Map</Text>
        </View>
        <Text style={styles.subtitle}>Booking reference: {input.bookingReference}</Text>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's
            Image is a PDF layout node, not an HTML <img>; it has no alt prop
            at all (checked its type defs), so the DOM a11y rule is a false
            positive here. */}
        <Image style={styles.image} src={mapImage} />
        {input.days.map((day) => (
          <View key={day.dayNumber} style={styles.dayBlock} wrap={false}>
            <View style={styles.dayHeading}>
              <View style={[styles.colorSwatch, { backgroundColor: day.color }]} />
              <Text style={styles.dayTitle}>
                Day {day.dayNumber} — {day.date.toISOString().slice(0, 10)}
              </Text>
            </View>
            {day.stops.map((stop, i) => (
              <View key={i} style={styles.stopRow}>
                <Text style={styles.stopKind}>{stop.kind}</Text>
                <Text style={styles.stopLabel}>{stop.label}</Text>
                {(stop.latitude == null || stop.longitude == null) && <Text style={styles.noCoords}>not geocoded</Text>}
              </View>
            ))}
          </View>
        ))}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Powered by Cyber PolCo</Text>
        </View>
      </Page>
    </Document>,
  );
}
