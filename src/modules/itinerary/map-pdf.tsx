// itinerary module — Map tab PDF layout (DR-089). @react-pdf/renderer's
// components are its own React reconciler (Document/Page/View/Text/Image
// host nodes, not DOM) -- this runs server-side only, never rendered by
// Next's own React tree.
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { ItineraryDayView, MapStopView } from './domain';

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 11 },
  title: { fontSize: 16, marginBottom: 12 },
  image: { width: '100%', marginBottom: 16 },
  stopRow: { flexDirection: 'row', marginBottom: 4, paddingBottom: 4, borderBottom: '1pt solid #E3D6C8' },
  stopKind: { width: 90, fontWeight: 700, color: '#2F6E4F' },
  stopLabel: { flex: 1 },
  noCoords: { fontSize: 9, color: '#8C7D78', marginLeft: 8 },
});

export async function renderDayMapPdf(day: ItineraryDayView, stops: MapStopView[], mapImage: Buffer): Promise<Buffer> {
  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          Day {day.dayNumber} — {day.date.toISOString().slice(0, 10)}
        </Text>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's
            Image is a PDF layout node, not an HTML <img>; it has no alt prop
            at all (checked its type defs), so the DOM a11y rule is a false
            positive here. */}
        <Image style={styles.image} src={mapImage} />
        {stops.map((stop, i) => (
          <View key={i} style={styles.stopRow}>
            <Text style={styles.stopKind}>{stop.kind}</Text>
            <Text style={styles.stopLabel}>{stop.label}</Text>
            {(stop.latitude == null || stop.longitude == null) && <Text style={styles.noCoords}>not geocoded</Text>}
          </View>
        ))}
      </Page>
    </Document>,
  );
}
