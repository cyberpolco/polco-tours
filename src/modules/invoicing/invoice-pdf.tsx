// invoicing module — invoice/receipt PDF (guest + staff download, once an
// invoice has at least one succeeded payment). Mirrors finance/
// package-summary-pdf.tsx's shape: @react-pdf/renderer, EN/FR via a
// self-contained LABELS dict rather than next-intl (same precedent --
// src/i18n/request.ts's getRequestConfig ignores an explicit locale
// override), and the same company letterhead/footer, since this document
// -- unlike itinerary/itinerary-summary-pdf.tsx's internal operational
// doc -- is handed to the paying guest.
//
// Deliberately ASCII-only money formatting (formatMoneyForPdf), same
// reasoning as package-summary-pdf.tsx: react-pdf's built-in font can't
// render the French locale's narrow-no-break-space thousands separator.
import type { Currency, InvoiceStatus, PaymentKind } from '@prisma/client';
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
  en: 'Operating in Namibia, DRC, Zambia & Zimbabwe',
  fr: "Opérant en Namibie, RDC, Zambie et au Zimbabwe",
};

const LABELS: Record<PdfLocale, Record<string, string>> = {
  en: {
    invoiceHeading: 'Invoice',
    receiptHeading: 'Receipt — Paid in Full',
    bookingReference: 'Booking reference',
    companyRegistration: 'Reg.',
    tourLead: 'Tour Lead',
    phone: 'Phone',
    email: 'Email',
    billingSummary: 'Billing Summary',
    subtotal: 'Subtotal',
    discount: 'Discount',
    couponApplied: 'Coupon applied',
    tax: 'Tax',
    platformFee: 'Platform fee',
    total: 'Total',
    balanceOutstanding: 'Balance outstanding',
    paidInFull: 'This invoice has been paid in full — nothing further is owed.',
    paymentsReceived: 'Payments Received',
    paymentColumn: 'Payment',
    date: 'Date',
    amount: 'Amount',
    kindDEPOSIT: 'Deposit',
    kindBALANCE: 'Balance',
    kindFULL: 'Full payment',
  },
  fr: {
    invoiceHeading: 'Facture',
    receiptHeading: 'Reçu — Payé intégralement',
    bookingReference: 'Référence de réservation',
    companyRegistration: 'Enr.',
    tourLead: 'Chef de groupe',
    phone: 'Téléphone',
    email: 'E-mail',
    billingSummary: 'Résumé de facturation',
    subtotal: 'Sous-total',
    discount: 'Remise',
    couponApplied: 'Coupon appliqué',
    tax: 'Taxe',
    platformFee: 'Frais de plateforme',
    total: 'Total',
    balanceOutstanding: 'Solde restant à payer',
    paidInFull: "Cette facture a été payée intégralement — aucun solde n'est dû.",
    paymentsReceived: 'Paiements reçus',
    paymentColumn: 'Paiement',
    date: 'Date',
    amount: 'Montant',
    kindDEPOSIT: 'Acompte',
    kindBALANCE: 'Solde',
    kindFULL: 'Paiement intégral',
  },
};

export interface InvoicePdfPayment {
  kind: PaymentKind;
  amountMinor: number;
  createdAt: Date;
}

/** DR-176 (explicit user request): the traveler manifest's isTourLead row --
 * same fields already shown for the tour lead on the guest booking page and
 * find-booking result page (name/phone/email), never the full manifest or
 * anything more sensitive (passport number, allergies, emergency contact). */
export interface InvoicePdfTourLead {
  name: string;
  phone: string | null;
  email: string | null;
}

export interface InvoicePdfInput {
  locale: PdfLocale;
  status: Extract<InvoiceStatus, 'PARTIALLY_PAID' | 'PAID'>;
  currency: Currency;
  bookingReference: string;
  subtotalMinor: number;
  discountMinor: number;
  couponCode: string | null;
  taxMinor: number;
  platformFeeMinor: number | null;
  totalMinor: number;
  balanceMinor: number;
  payments: InvoicePdfPayment[];
  // DR-176: null only for a TAILOR_MADE inquiry that never reached a real
  // traveler manifest -- shouldn't happen in practice, since this document
  // is only reachable once an invoice has a succeeded payment, but the
  // section is simply omitted rather than rendering blank fields if so.
  tourLead: InvoicePdfTourLead | null;
}

const COLORS = { navy: '#3B1F3A', forest: '#2F6E4F', mist: '#8C7D78', ink: '#211A1D', rule: '#E3D6C8' };

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingHorizontal: 32, paddingBottom: 72, fontSize: 9, color: COLORS.ink, fontFamily: PDF_FONT_BODY },
  headerRow: { flexDirection: 'row', marginBottom: 20 },
  companyBlock: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, width: 190 },
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
  tourLeadBlock: { marginTop: 4, marginBottom: 8 },
  tourLeadName: { fontSize: 10, fontWeight: 700, color: COLORS.ink },
  tourLeadLine: { fontSize: 9, color: COLORS.mist, marginTop: 1 },
  noteBox: { marginTop: 10, padding: 8, backgroundColor: '#F6EFE4' },
  noteText: { fontSize: 9, color: COLORS.ink },
  tableHeaderRow: { flexDirection: 'row', borderBottom: `1pt solid ${COLORS.rule}`, paddingBottom: 4, marginBottom: 2 },
  tableRow: { flexDirection: 'row', borderBottom: `0.5pt solid ${COLORS.rule}`, paddingVertical: 4 },
  colKind: { flex: 1 },
  colDate: { width: 90 },
  colAmount: { width: 90, textAlign: 'right' },
  headerCell: { fontSize: 8, fontWeight: 700, color: COLORS.mist, textTransform: 'uppercase' },
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

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  registerPdfFonts();
  const t = LABELS[input.locale];
  const fmt = (minor: number) => formatMoneyForPdf(minor, input.currency);
  const isPaid = input.status === 'PAID';

  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.companyBlock}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's
                Image is a PDF layout node, not an HTML <img>; it has no alt prop
                at all, so the DOM a11y rule is a false positive here. */}
            <Image src={BRAND_LOGO_DATA_URI} style={{ width: 20, height: 20 }} />
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
            <Text style={styles.heading}>{isPaid ? t.receiptHeading : t.invoiceHeading}</Text>
            <Text style={styles.bookingRef}>
              {t.bookingReference}: {input.bookingReference}
            </Text>
          </View>
        </View>

        {input.tourLead && (
          <View style={styles.tourLeadBlock}>
            <Text style={styles.tourLeadName}>
              {t.tourLead}: {input.tourLead.name}
            </Text>
            {input.tourLead.phone && (
              <Text style={styles.tourLeadLine}>
                {t.phone}: {input.tourLead.phone}
              </Text>
            )}
            {input.tourLead.email && (
              <Text style={styles.tourLeadLine}>
                {t.email}: {input.tourLead.email}
              </Text>
            )}
          </View>
        )}

        <Text style={styles.sectionHeading}>{t.billingSummary}</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t.subtotal}</Text>
          <Text style={styles.rowValue}>{fmt(input.subtotalMinor)}</Text>
        </View>
        {input.discountMinor > 0 && (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>
              {t.discount}
              {input.couponCode ? ` (${input.couponCode})` : ''}
            </Text>
            <Text style={styles.rowValue}>−{fmt(input.discountMinor)}</Text>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t.tax}</Text>
          <Text style={styles.rowValue}>{fmt(input.taxMinor)}</Text>
        </View>
        {input.platformFeeMinor != null && (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t.platformFee}</Text>
            <Text style={styles.rowValue}>{fmt(input.platformFeeMinor)}</Text>
          </View>
        )}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t.total}</Text>
          <Text style={styles.totalValue}>{fmt(input.totalMinor)}</Text>
        </View>

        <View style={styles.noteBox}>
          {isPaid ? (
            <Text style={styles.noteText}>{t.paidInFull}</Text>
          ) : (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[styles.noteText, { fontWeight: 700 }]}>{t.balanceOutstanding}</Text>
              <Text style={[styles.noteText, { fontWeight: 700 }]}>{fmt(input.balanceMinor)}</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionHeading}>{t.paymentsReceived}</Text>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.headerCell, styles.colKind]}>{t.paymentColumn}</Text>
          <Text style={[styles.headerCell, styles.colDate]}>{t.date}</Text>
          <Text style={[styles.headerCell, styles.colAmount]}>{t.amount}</Text>
        </View>
        {input.payments.map((p, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={styles.colKind}>{t[`kind${p.kind}`]}</Text>
            <Text style={styles.colDate}>{p.createdAt.toISOString().slice(0, 10)}</Text>
            <Text style={styles.colAmount}>{fmt(p.amountMinor)}</Text>
          </View>
        ))}

        <DocumentFooter locale={input.locale} />
      </Page>
    </Document>,
  );
}
