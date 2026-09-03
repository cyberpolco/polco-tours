// invoicing module — cancellation & refund note PDF (DR-207). Handed to the
// guest right after they cancel via /find-booking, and downloadable again
// by staff from the booking detail page. Mirrors invoice-pdf.tsx's own
// shape exactly (same duplication convention that file's header documents
// against finance/package-summary-pdf.tsx: @react-pdf/renderer, EN/FR via a
// self-contained LABELS dict, same company letterhead/footer) rather than
// sharing constants across the two files.
//
// Deliberately ASCII-only money formatting (formatMoneyForPdf), same
// reasoning as invoice-pdf.tsx: react-pdf's built-in font can't render the
// French locale's narrow-no-break-space thousands separator.
import type { CancellationRefundTier } from '@modules/booking';
import type { Currency } from '@prisma/client';
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { PDF_FONT_BODY, PDF_FONT_CODE, registerPdfFonts } from '@lib/pdf-fonts';
import { BRAND_LOGO_DATA_URI } from '@lib/brand-logo';

export type PdfLocale = 'en' | 'fr';

function formatMoneyForPdf(minor: number, currency: Currency): string {
  const parts = (minor / 100).toFixed(2).split('.');
  const whole = parts[0] ?? '0';
  const decimals = parts[1] ?? '00';
  const withThousands = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency} ${withThousands}.${decimals}`;
}

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

const OPERATING_COUNTRIES: Record<PdfLocale, string> = {
  en: 'Operating in Namibia, DRC, Zambia, Zimbabwe & Botswana',
  fr: "Opérant en Namibie, RDC, Zambie, au Zimbabwe et au Botswana",
};

const TIER_LABELS: Record<PdfLocale, Record<CancellationRefundTier, string>> = {
  en: {
    FULL_MINUS_DEPOSIT: 'Full refund of amount paid, minus the deposit',
    FIFTY_PERCENT: '50% of amount paid',
    TWENTY_FIVE_PERCENT: '25% of amount paid',
    NONE: 'No refund',
  },
  fr: {
    FULL_MINUS_DEPOSIT: 'Remboursement intégral du montant payé, moins l’acompte',
    FIFTY_PERCENT: '50 % du montant payé',
    TWENTY_FIVE_PERCENT: '25 % du montant payé',
    NONE: 'Aucun remboursement',
  },
};

const LABELS: Record<PdfLocale, Record<string, string>> = {
  en: {
    heading: 'Cancellation & Refund Note',
    bookingReference: 'Booking reference',
    companyRegistration: 'Reg.',
    cancelledOn: 'Cancelled on',
    reason: 'Reason given',
    summary: 'Refund Summary',
    amountPaid: 'Amount paid to date',
    tier: 'Applicable policy tier',
    refundAmount: 'Refund amount',
    policyNote: 'This refund is calculated per our Cancellation & Refund Policy (see mufasasafaris.com/terms). It will be issued to your original payment method by our staff; visa assistance fees and any government visa fee are never refundable.',
  },
  fr: {
    heading: 'Avis d’annulation et de remboursement',
    bookingReference: 'Référence de réservation',
    companyRegistration: 'Enr.',
    cancelledOn: 'Annulée le',
    reason: 'Motif indiqué',
    summary: 'Résumé du remboursement',
    amountPaid: 'Montant payé à ce jour',
    tier: 'Palier de politique applicable',
    refundAmount: 'Montant du remboursement',
    policyNote: "Ce remboursement est calculé selon notre politique d'annulation et de remboursement (voir mufasasafaris.com/terms). Il sera versé sur votre moyen de paiement d'origine par notre personnel ; les frais d'assistance visa et tout frais gouvernemental de visa ne sont jamais remboursables.",
  },
};

export interface RefundNotePdfInput {
  locale: PdfLocale;
  bookingReference: string;
  cancelledAt: Date;
  reason: string;
  currency: Currency;
  paidMinor: number;
  tier: CancellationRefundTier;
  refundAmountMinor: number;
}

const COLORS = { navy: '#3B1F3A', forest: '#2F6E4F', mist: '#8C7D78', ink: '#211A1D', rule: '#E3D6C8' };

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingHorizontal: 32, paddingBottom: 72, fontSize: 9, color: COLORS.ink, fontFamily: PDF_FONT_BODY },
  headerRow: { flexDirection: 'row', marginBottom: 20 },
  companyBlock: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, width: 220 },
  companyText: { fontSize: 8, color: COLORS.mist, lineHeight: 1.4 },
  companyName: { fontSize: 10, fontWeight: 700, color: COLORS.navy, marginBottom: 2 },
  titleBlock: { alignItems: 'center', flex: 1, paddingTop: 2 },
  heading: { fontSize: 15, fontWeight: 700, color: COLORS.navy, marginBottom: 4, textAlign: 'center' },
  bookingRef: { fontSize: 11, fontWeight: 700, color: COLORS.ink, textAlign: 'center', fontFamily: PDF_FONT_CODE },
  sectionHeading: { fontSize: 12, fontWeight: 700, color: COLORS.forest, marginTop: 16, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottom: `0.5pt solid ${COLORS.rule}` },
  rowLabel: {},
  rowValue: { fontWeight: 700 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 4, borderTop: `1.5pt solid ${COLORS.navy}` },
  totalLabel: { fontSize: 11, fontWeight: 700, color: COLORS.navy },
  totalValue: { fontSize: 13, fontWeight: 700, color: COLORS.navy },
  metaBlock: { marginTop: 4, marginBottom: 8 },
  metaLine: { fontSize: 9, color: COLORS.mist, marginTop: 2 },
  reasonText: { fontSize: 9, color: COLORS.ink, marginTop: 2 },
  noteBox: { marginTop: 10, padding: 8, backgroundColor: '#F6EFE4' },
  noteText: { fontSize: 8, color: COLORS.ink, lineHeight: 1.4 },
  footer: { position: 'absolute', bottom: 24, left: 32, right: 32, borderTop: `0.5pt solid ${COLORS.rule}`, paddingTop: 6, alignItems: 'center' },
  footerText: { fontSize: 7, color: COLORS.mist, textAlign: 'center', marginTop: 1 },
});

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

export async function renderRefundNotePdf(input: RefundNotePdfInput): Promise<Buffer> {
  registerPdfFonts();
  const t = LABELS[input.locale];
  const fmt = (minor: number) => formatMoneyForPdf(minor, input.currency);

  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
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
            <Text style={styles.heading}>{t.heading}</Text>
            <Text style={styles.bookingRef}>
              {t.bookingReference}: {input.bookingReference}
            </Text>
          </View>
        </View>

        <View style={styles.metaBlock}>
          <Text style={styles.metaLine}>
            {t.cancelledOn}: {input.cancelledAt.toISOString().slice(0, 10)}
          </Text>
          <Text style={styles.metaLine}>{t.reason}:</Text>
          <Text style={styles.reasonText}>{input.reason}</Text>
        </View>

        <Text style={styles.sectionHeading}>{t.summary}</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t.amountPaid}</Text>
          <Text style={styles.rowValue}>{fmt(input.paidMinor)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t.tier}</Text>
          <Text style={styles.rowValue}>{TIER_LABELS[input.locale][input.tier]}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t.refundAmount}</Text>
          <Text style={styles.totalValue}>{fmt(input.refundAmountMinor)}</Text>
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>{t.policyNote}</Text>
        </View>

        <DocumentFooter locale={input.locale} />
      </Page>
    </Document>,
  );
}
