// Invoices (Rechnungen) and the yearly § 35a EStG statement.
//
// An invoice is issued exactly once per booking – when the payment becomes
// "paid" (Stripe webhook, PayPal capture, cash recorded, gift card covered).
// Numbers are sequential per year (FX-YYYY-000001, Counter "invoice-YYYY").
// The PDF is rendered with pdfkit and stored on the booking (invoice.pdf,
// select: false). Invoices are accounting records: they stay for 10 years
// (§ 147 AO) even when the customer deletes the account.
//
// Legal model: the code treats Fiduxa as the seller of the cleaning service
// (VAT contained in the customer price). Issuer data, the VAT display and
// the VAT note come from the admin settings (INVOICING) so the owner can
// adapt them after talking to the tax adviser – without code changes.
//
// § 35a EStG (haushaltsnahe Dienstleistungen): Fiduxa charges working time,
// so the WHOLE invoice amount (incl. VAT) counts as labour costs. Cash
// payments do not qualify (§ 35a Abs. 5 S. 3 EStG requires a bank transfer).
import PDFDocument from "pdfkit";

import Booking from "../models/booking.model.js";
import Counter from "../models/counter.model.js";
import { INVOICING, PRICING } from "../config/pricing.js";
import { findService } from "../data/catalogue.js";
import { httpError, slotLabel } from "../utils/helpers.js";

const LOCALE_TAGS = { de: "de-DE", en: "en-GB", pl: "pl-PL" };
const lang = (locale) => (LOCALE_TAGS[locale] ? locale : "de");

const money = (cents, locale) =>
  new Intl.NumberFormat(LOCALE_TAGS[lang(locale)], { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);
const day = (date, locale) => new Date(date).toLocaleDateString(LOCALE_TAGS[lang(locale)], { timeZone: "UTC" });
const pct = (rate, locale) => new Intl.NumberFormat(LOCALE_TAGS[lang(locale)], { maximumFractionDigits: 2 }).format((rate ?? 0) * 100);

const vatContained = (grossCents, rate) => (rate > 0 ? Math.round(grossCents - grossCents / (1 + rate)) : 0);

const SERVICE_NAMES = {
  de: { "home-cleaning": "Wohnungsreinigung", "deep-cleaning": "Grundreinigung", "end-of-tenancy": "Umzugsreinigung", "business-cleaning": "Büro- und Gewerbereinigung" },
  en: { "home-cleaning": "Home cleaning", "deep-cleaning": "Deep cleaning", "end-of-tenancy": "End-of-tenancy cleaning", "business-cleaning": "Office & commercial cleaning" },
  pl: { "home-cleaning": "Sprzątanie mieszkania", "deep-cleaning": "Gruntowne sprzątanie", "end-of-tenancy": "Sprzątanie po przeprowadzce", "business-cleaning": "Sprzątanie biur i lokali" },
};

const T = {
  de: {
    invoice: "Rechnung",
    invoiceNo: "Rechnungsnummer",
    invoiceDate: "Rechnungsdatum",
    serviceDate: "Leistungsdatum",
    bookingRef: "Buchungsnummer",
    customer: "Rechnungsempfänger",
    issuer: "Rechnungssteller",
    taxId: "Steuernummer / USt-IdNr.",
    email: "E-Mail",
    position: "Position",
    amount: "Betrag",
    labour: (hours, rate) => `Reinigungsleistung – ${hours} Std. × ${rate}/Std.`,
    service: "Leistung",
    duration: "Dauer",
    hours: (h) => `${h} Std.`,
    appointment: "Termin",
    address: "Einsatzort",
    extra: (label) => `Zusatzleistung: ${label}`,
    extras: "Zusatzleistungen",
    recurringDiscount: "Rabatt für regelmäßige Reinigung",
    promotion: (code) => (code ? `Aktionsrabatt (${code})` : "Aktionsrabatt"),
    subtotal: "Zwischensumme",
    net: "Nettobetrag",
    vat: (p) => `zzgl. ${p} % USt.`,
    vatIncluded: (p) => `enthaltene USt. (${p} %)`,
    total: "Rechnungsbetrag (brutto)",
    giftCard: "Bezahlt mit Gutschein",
    paid: "Bezahlt",
    paidVia: (m) => `Bezahlt per ${m}`,
    open: "Offener Betrag",
    methods: { stripe: "Online-Zahlung (Karte)", paypal: "PayPal", cash: "Barzahlung", invoice: "Überweisung", gift_card: "Gutschein" },
    taxTitle: "Hinweis zu § 35a EStG (haushaltsnahe Dienstleistungen)",
    taxLabour: (amount) => `§ 35a EStG: Arbeitskosten ${amount}`,
    taxLabourNote:
      "Fiduxa berechnet ausschließlich Arbeitszeit. Der gesamte Rechnungsbetrag (inkl. USt.) sind Arbeitskosten im Sinne des § 35a EStG; Material- oder Fahrtkosten sind nicht enthalten.",
    taxCashNote:
      "Barzahlungen werden vom Finanzamt NICHT anerkannt (§ 35a Abs. 5 EStG). Diese Rechnung wurde bar bezahlt und ist daher nicht nach § 35a EStG absetzbar.",
    taxOkNote: "Bitte bewahren Sie diese Rechnung und den Zahlungsnachweis (Kontoauszug) für Ihre Steuererklärung auf.",
    thanks: "Vielen Dank für Ihr Vertrauen.",
    page: (n) => `Seite ${n}`,
    statementTitle: "Bescheinigung haushaltsnaher Dienstleistungen (§ 35a EStG)",
    statementFor: (year) => `Kalenderjahr ${year}`,
    statementIntro: (name, year) =>
      `Hiermit bestätigen wir, dass ${name} im Kalenderjahr ${year} die nachfolgend aufgeführten haushaltsnahen Dienstleistungen in Anspruch genommen und unbar bezahlt hat.`,
    statementNone: "Für dieses Jahr liegen keine unbar bezahlten Rechnungen vor.",
    statementCash: (n) => `${n} bar bezahlte Rechnung(en) wurden nicht berücksichtigt (§ 35a Abs. 5 EStG).`,
    colInvoice: "Rechnung",
    colDate: "Datum",
    colService: "Leistung",
    colLabour: "Arbeitskosten",
    colVat: "davon USt.",
    sumLabour: "Summe Arbeitskosten (brutto)",
    sumVat: "darin enthaltene USt.",
    sumNet: "Netto",
    issued: "Ausgestellt am",
    statementNote: "Diese Bescheinigung ersetzt nicht die Einzelrechnungen; bitte bewahren Sie Rechnungen und Zahlungsnachweise auf.",
  },
  en: {
    invoice: "Invoice",
    invoiceNo: "Invoice number",
    invoiceDate: "Invoice date",
    serviceDate: "Date of service",
    bookingRef: "Booking number",
    customer: "Bill to",
    issuer: "Issuer",
    taxId: "Tax number / VAT ID",
    email: "Email",
    position: "Item",
    amount: "Amount",
    labour: (hours, rate) => `Cleaning service – ${hours} h × ${rate}/h`,
    service: "Service",
    duration: "Duration",
    hours: (h) => `${h} h`,
    appointment: "Appointment",
    address: "Location",
    extra: (label) => `Extra: ${label}`,
    extras: "Extras",
    recurringDiscount: "Recurring cleaning discount",
    promotion: (code) => (code ? `Promotion (${code})` : "Promotion"),
    subtotal: "Subtotal",
    net: "Net amount",
    vat: (p) => `plus ${p}% VAT`,
    vatIncluded: (p) => `VAT included (${p}%)`,
    total: "Invoice total (gross)",
    giftCard: "Paid with gift card",
    paid: "Paid",
    paidVia: (m) => `Paid via ${m}`,
    open: "Open amount",
    methods: { stripe: "Online payment (card)", paypal: "PayPal", cash: "Cash", invoice: "Bank transfer", gift_card: "Gift card" },
    taxTitle: "Note on § 35a EStG (German household-related services tax credit)",
    taxLabour: (amount) => `§ 35a EStG: labour costs ${amount}`,
    taxLabourNote:
      "Fiduxa charges working time only. The whole invoice amount (incl. VAT) is labour cost within the meaning of § 35a EStG; no material or travel costs are included.",
    taxCashNote:
      "Cash payments are NOT accepted by the tax office (§ 35a (5) EStG). This invoice was paid in cash and therefore does not qualify under § 35a EStG.",
    taxOkNote: "Please keep this invoice and the proof of payment (bank statement) for your tax return.",
    thanks: "Thank you for choosing Fiduxa.",
    page: (n) => `Page ${n}`,
    statementTitle: "Statement of household-related services (§ 35a EStG)",
    statementFor: (year) => `Calendar year ${year}`,
    statementIntro: (name, year) =>
      `We confirm that ${name} used the household-related services listed below in the calendar year ${year} and paid them by non-cash means.`,
    statementNone: "There are no non-cash paid invoices for this year.",
    statementCash: (n) => `${n} invoice(s) paid in cash were not included (§ 35a (5) EStG).`,
    colInvoice: "Invoice",
    colDate: "Date",
    colService: "Service",
    colLabour: "Labour costs",
    colVat: "incl. VAT",
    sumLabour: "Total labour costs (gross)",
    sumVat: "VAT included",
    sumNet: "Net",
    issued: "Issued on",
    statementNote: "This statement does not replace the individual invoices; please keep invoices and proofs of payment.",
  },
  pl: {
    invoice: "Faktura",
    invoiceNo: "Numer faktury",
    invoiceDate: "Data wystawienia",
    serviceDate: "Data wykonania usługi",
    bookingRef: "Numer rezerwacji",
    customer: "Nabywca",
    issuer: "Wystawca",
    taxId: "Numer podatkowy / NIP UE",
    email: "E-mail",
    position: "Pozycja",
    amount: "Kwota",
    labour: (hours, rate) => `Usługa sprzątania – ${hours} godz. × ${rate}/godz.`,
    service: "Usługa",
    duration: "Czas trwania",
    hours: (h) => `${h} godz.`,
    appointment: "Termin",
    address: "Miejsce",
    extra: (label) => `Usługa dodatkowa: ${label}`,
    extras: "Usługi dodatkowe",
    recurringDiscount: "Rabat za regularne sprzątanie",
    promotion: (code) => (code ? `Rabat promocyjny (${code})` : "Rabat promocyjny"),
    subtotal: "Suma częściowa",
    net: "Kwota netto",
    vat: (p) => `plus ${p}% VAT`,
    vatIncluded: (p) => `zawarty VAT (${p}%)`,
    total: "Kwota faktury (brutto)",
    giftCard: "Zapłacono kartą podarunkową",
    paid: "Zapłacono",
    paidVia: (m) => `Zapłacono: ${m}`,
    open: "Do zapłaty",
    methods: { stripe: "Płatność online (karta)", paypal: "PayPal", cash: "Gotówka", invoice: "Przelew", gift_card: "Karta podarunkowa" },
    taxTitle: "Informacja dot. § 35a EStG (niemiecka ulga na usługi domowe)",
    taxLabour: (amount) => `§ 35a EStG: koszty pracy ${amount}`,
    taxLabourNote:
      "Fiduxa rozlicza wyłącznie czas pracy. Cała kwota faktury (z VAT) stanowi koszty pracy w rozumieniu § 35a EStG; nie zawiera kosztów materiałów ani dojazdu.",
    taxCashNote:
      "Płatności gotówkowe NIE są uznawane przez urząd skarbowy (§ 35a ust. 5 EStG). Ta faktura została opłacona gotówką i nie podlega odliczeniu zgodnie z § 35a EStG.",
    taxOkNote: "Prosimy zachować fakturę oraz potwierdzenie płatności (wyciąg bankowy) do rozliczenia podatkowego.",
    thanks: "Dziękujemy za zaufanie.",
    page: (n) => `Strona ${n}`,
    statementTitle: "Zaświadczenie o usługach domowych (§ 35a EStG)",
    statementFor: (year) => `Rok kalendarzowy ${year}`,
    statementIntro: (name, year) =>
      `Potwierdzamy, że ${name} skorzystał(a) w roku kalendarzowym ${year} z wymienionych poniżej usług domowych i opłacił(a) je bezgotówkowo.`,
    statementNone: "Brak faktur opłaconych bezgotówkowo w tym roku.",
    statementCash: (n) => `${n} faktur(y) opłaconych gotówką nie uwzględniono (§ 35a ust. 5 EStG).`,
    colInvoice: "Faktura",
    colDate: "Data",
    colService: "Usługa",
    colLabour: "Koszty pracy",
    colVat: "w tym VAT",
    sumLabour: "Suma kosztów pracy (brutto)",
    sumVat: "zawarty VAT",
    sumNet: "Netto",
    issued: "Wystawiono",
    statementNote: "Zaświadczenie nie zastępuje pojedynczych faktur; prosimy zachować faktury i potwierdzenia płatności.",
  },
};

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/** Next sequential invoice number for the year, e.g. FX-2026-000001 */
export const nextInvoiceNumber = async (date = new Date()) => {
  const year = date.getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `invoice-${year}` },
    { $inc: { sequence: 1 } },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
  );
  return `FX-${year}-${String(counter.sequence).padStart(6, "0")}`;
};

// ---------------------------------------------------------------------------
// Figures (from the booking's pricing snapshot)
// ---------------------------------------------------------------------------

/** Amounts shown on the invoice – all integer cents */
export const invoiceFigures = (booking) => {
  const p = booking.pricing ?? {};
  const e = booking.estimate ?? {};
  const totalCents = p.totalCents ?? e.totalCents ?? booking.payment?.amountCents ?? 0;
  const vatRate = INVOICING.showVat ? (p.vatRate ?? PRICING.vatRate ?? 0) : 0;
  const vatCents = INVOICING.showVat ? (p.vatCents ?? vatContained(totalCents, vatRate)) : 0;
  const giftCardCents = p.giftCardCents ?? 0;
  const method = booking.payment?.method ?? "invoice";
  return {
    labourCents: e.labourCents ?? Math.max(0, (p.subtotalCents ?? totalCents) - (e.extraFeesCents ?? 0)),
    extraFeesCents: e.extraFeesCents ?? 0,
    recurringDiscountCents: p.recurringDiscountCents ?? e.discountCents ?? 0,
    promotionDiscountCents: p.promotionDiscountCents ?? 0,
    totalCents,
    vatRate,
    vatCents,
    netCents: totalCents - vatCents,
    giftCardCents,
    paidCents: Math.max(0, totalCents - giftCardCents),
    paymentMethod: method,
    // § 35a EStG: only non-cash payments qualify
    taxDeductible: method !== "cash",
  };
};

// ---------------------------------------------------------------------------
// PDF helpers
// ---------------------------------------------------------------------------

const toBuffer = (doc) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
// Callers must draw everything first and call doc.end() before awaiting the
// buffer – ending early produced blank PDFs.

const PAGE = { left: 50, right: 545, width: 495 };
const GREEN = "#174D3A";
const GREY = "#65736B";

const issuerLines = () => [INVOICING.companyName, ...(INVOICING.addressLines ?? [])].filter(Boolean);

const header = (doc, title, subtitle) => {
  doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(20).text("Fiduxa", PAGE.left, 50);
  doc.fillColor(GREY).font("Helvetica").fontSize(9).text(issuerLines().join(" · "), PAGE.left, 74, { width: 320 });
  doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(16).text(title, PAGE.left, 50, { width: PAGE.width, align: "right" });
  if (subtitle) doc.fillColor(GREY).font("Helvetica").fontSize(10).text(subtitle, PAGE.left, 72, { width: PAGE.width, align: "right" });
  doc.moveTo(PAGE.left, 100).lineTo(PAGE.right, 100).strokeColor("#D9E2DC").lineWidth(1).stroke();
  doc.fillColor("#24312B");
};

const block = (doc, x, y, title, lines, width = 230) => {
  doc.font("Helvetica-Bold").fontSize(9).fillColor(GREY).text(title.toUpperCase(), x, y, { width });
  doc.font("Helvetica").fontSize(10).fillColor("#24312B");
  let cy = y + 14;
  for (const line of lines.filter(Boolean)) {
    doc.text(line, x, cy, { width });
    cy = doc.y + 2;
  }
  return cy;
};

const row = (doc, y, label, value, { bold = false, color = "#24312B", size = 10 } = {}) => {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color);
  doc.text(label, PAGE.left, y, { width: PAGE.width - 110 });
  const labelBottom = doc.y;
  doc.text(value, PAGE.right - 110, y, { width: 110, align: "right" });
  return Math.max(labelBottom, doc.y) + 4;
};

const rule = (doc, y, color = "#D9E2DC") => {
  doc.moveTo(PAGE.left, y).lineTo(PAGE.right, y).strokeColor(color).lineWidth(0.8).stroke();
  return y + 6;
};

const footer = (doc, t) => {
  const lines = [issuerLines().join(" · "), [INVOICING.taxId && `${t.taxId}: ${INVOICING.taxId}`, INVOICING.phone && `Tel. ${INVOICING.phone}`, INVOICING.email && `${t.email}: ${INVOICING.email}`].filter(Boolean).join(" · "), INVOICING.managingDirector && `Geschäftsführer: ${INVOICING.managingDirector}`].filter(Boolean);
  // Footer sits inside the bottom margin – lift the margin so pdfkit does not
  // push it onto a second page.
  const bottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.font("Helvetica").fontSize(8).fillColor(GREY).text(lines.join("\n"), PAGE.left, 790, { width: PAGE.width, align: "center", lineBreak: true });
  doc.page.margins.bottom = bottom;
};

const hoursLabel = (minutes) => {
  const h = Math.round(((minutes ?? 0) / 60) * 100) / 100;
  return String(h).replace(".", ",");
};

// ---------------------------------------------------------------------------
// Invoice PDF
// ---------------------------------------------------------------------------

export const renderInvoicePdf = async ({ booking, number, issuedAt, figures }) => {
  const l = lang(booking.locale);
  const t = T[l];
  const f = figures;
  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `${t.invoice} ${number}`, Author: INVOICING.companyName } });
  const out = toBuffer(doc);

  header(doc, t.invoice, number);

  // Address blocks
  const cd = booking.customerDetails ?? {};
  block(doc, PAGE.left, 120, t.customer, [cd.name, cd.address, `${cd.postcode ?? ""} Berlin`.trim(), cd.email]);
  block(doc, 330, 120, t.issuer, [
    ...issuerLines(),
    INVOICING.taxId ? `${t.taxId}: ${INVOICING.taxId}` : "",
    INVOICING.email ? `${t.email}: ${INVOICING.email}` : "",
  ], 215);

  // Meta
  let y = 215;
  doc.font("Helvetica").fontSize(10).fillColor("#24312B");
  const meta = [
    [t.invoiceNo, number],
    [t.invoiceDate, day(issuedAt, l)],
    [t.serviceDate, `${day(booking.preferredDate, l)}, ${slotLabel(booking.slot, booking.slotEnd)}`],
    [t.bookingRef, booking.reference],
    [t.address, `${cd.address ?? ""}, ${cd.postcode ?? ""} Berlin`],
  ];
  for (const [k, v] of meta) {
    doc.font("Helvetica").fillColor(GREY).text(k, PAGE.left, y, { width: 140 });
    doc.fillColor("#24312B").text(v, PAGE.left + 140, y, { width: PAGE.width - 140 });
    y = doc.y + 3;
  }

  // Line items – table: service | booking | service date | hours | rate | amount
  const COLS = {
    de: ["Leistung", "Buchung", "Leistungsdatum", "Std.", "Preis/Std.", "Betrag", "Rechnungsbetrag"],
    en: ["Service", "Booking", "Service date", "Hours", "Rate/h", "Amount", "Invoice total"],
    pl: ["Usługa", "Rezerwacja", "Data usługi", "Godz.", "Cena/godz.", "Kwota", "Kwota faktury"],
  }[l];
  const X = [
    { x: PAGE.left, w: 120 }, { x: PAGE.left + 122, w: 86 }, { x: PAGE.left + 210, w: 82 },
    { x: PAGE.left + 294, w: 40, align: "right" }, { x: PAGE.left + 336, w: 64, align: "right" }, { x: PAGE.right - 93, w: 93, align: "right" },
  ];
  const tableRow = (cells, yy, { bold = false, color = "#24312B", size = 9.5 } = {}) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color);
    let bottom = yy;
    cells.forEach((c, i) => {
      if (c == null || c === "") return;
      doc.text(String(c), X[i].x, yy, { width: X[i].w, align: X[i].align ?? "left" });
      bottom = Math.max(bottom, doc.y);
    });
    return bottom + 6;
  };

  y += 14;
  y = tableRow(COLS.slice(0, 6).map((c) => c.toUpperCase()), y, { bold: true, color: GREY, size: 7.5 });
  y = rule(doc, y - 2, GREEN);

  const e = booking.estimate ?? {};
  const serviceName = SERVICE_NAMES[l][booking.serviceId] ?? findService(booking.serviceId)?.name ?? booking.serviceId;
  const rateCents = e.hourlyRateCents ?? PRICING.hourlyRateCents;
  y = tableRow([serviceName, booking.reference, day(booking.preferredDate, l), hoursLabel(e.durationMinutes), money(rateCents, l), money(f.labourCents, l)], y);
  for (const extra of e.extras ?? []) {
    y = tableRow([t.extra(extra.label ?? extra.id), "", "", "", "", money(extra.priceCents ?? 0, l)], y, { color: GREY });
  }
  if (f.recurringDiscountCents) y = tableRow([t.recurringDiscount, "", "", "", "", `− ${money(f.recurringDiscountCents, l)}`], y);
  if (f.promotionDiscountCents) y = tableRow([t.promotion(booking.pricing?.promotion?.code), "", "", "", "", `− ${money(f.promotionDiscountCents, l)}`], y);

  y = rule(doc, y + 2);
  if (INVOICING.showVat && f.vatRate > 0) {
    y = row(doc, y, t.net, money(f.netCents, l), { color: GREY });
    y = row(doc, y, t.vat(pct(f.vatRate, l)), money(f.vatCents, l), { color: GREY });
  }
  // Green total bar
  y += 4;
  doc.rect(PAGE.left, y, PAGE.width, 30).fill(GREEN);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(10).text(COLS[6].toUpperCase(), PAGE.left + 12, y + 10, { width: 250 });
  doc.fontSize(12).text(money(f.totalCents, l), PAGE.right - 172, y + 9, { width: 160, align: "right" });
  y += 40;
  if (INVOICING.vatNote) {
    doc.font("Helvetica").fontSize(9).fillColor(GREY).text(INVOICING.vatNote, PAGE.left, y, { width: PAGE.width });
    y = doc.y + 4;
  }

  // Payment lines (gift card = payment, not a discount)
  y = rule(doc, y + 2);
  if (f.giftCardCents) y = row(doc, y, t.giftCard, `− ${money(f.giftCardCents, l)}`);
  const methodLabel = t.methods[f.paymentMethod] ?? f.paymentMethod;
  const paidAt = booking.payment?.paidAt ? ` (${day(booking.payment.paidAt, l)})` : "";
  // Issued on completion before the money arrived (e.g. bank transfer): the
  // amount is shown as open instead of paid.
  const settled = f.paidCents === 0 || ["paid", "partially_refunded", "refunded", "refund_pending"].includes(booking.payment?.status);
  if (settled) {
    y = row(doc, y, `${f.paidCents > 0 ? t.paidVia(methodLabel) : t.paid}${paidAt}`, money(f.paidCents, l), { bold: true });
    y = row(doc, y, t.open, money(0, l), { color: GREY });
  } else {
    y = row(doc, y, t.open, money(f.paidCents, l), { bold: true });
  }

  y += 20;
  doc.font("Helvetica").fontSize(10).fillColor("#24312B").text(t.thanks, PAGE.left, y);
  footer(doc, t);
  doc.end();
  return out;
};

// ---------------------------------------------------------------------------
// Issue (idempotent)
// ---------------------------------------------------------------------------

const META_FIELDS = [
  "number", "issuedAt", "locale", "totalCents", "netCents", "vatCents", "vatRate", "labourCents", "extraFeesCents",
  "recurringDiscountCents", "promotionDiscountCents", "giftCardCents", "paidCents", "paymentMethod", "taxDeductible",
];
const metaOf = (invoice) => Object.fromEntries(META_FIELDS.filter((k) => invoice?.[k] !== undefined).map((k) => [k, invoice[k]]));

const applyMeta = (booking, meta) => {
  for (const [k, v] of Object.entries(meta)) booking.set(`invoice.${k}`, v);
};

/**
 * Create the invoice for a booking whose payment is "paid". Safe to call
 * several times – only the first call draws a number. Persists the invoice
 * (incl. PDF) directly and mirrors the metadata on the in-memory document;
 * the caller may still save() the booking afterwards.
 * Returns { invoice: meta, pdf: Buffer | null, created: boolean }.
 */
export const issueInvoiceForBooking = async (booking) => {
  if (booking.invoice?.number) return { invoice: metaOf(booking.invoice), pdf: null, created: false };
  const stored = await Booking.findById(booking._id).select("invoice").lean();
  if (stored?.invoice?.number) {
    applyMeta(booking, metaOf(stored.invoice));
    return { invoice: metaOf(stored.invoice), pdf: null, created: false };
  }

  const issuedAt = new Date();
  const number = await nextInvoiceNumber(issuedAt);
  const figures = invoiceFigures(booking);
  const pdf = await renderInvoicePdf({ booking, number, issuedAt, figures });
  const invoice = { number, issuedAt, locale: lang(booking.locale), ...figures, pdf };

  const result = await Booking.updateOne(
    { _id: booking._id, "invoice.number": { $exists: false } },
    { $set: { invoice } }
  );
  if (result.matchedCount === 0) {
    // Lost a race – keep the number that was persisted first
    const winner = await Booking.findById(booking._id).select("invoice").lean();
    applyMeta(booking, metaOf(winner?.invoice));
    return { invoice: metaOf(winner?.invoice), pdf: null, created: false };
  }
  const meta = metaOf(invoice);
  applyMeta(booking, meta);
  return { invoice: meta, pdf, created: true };
};

/** Stored PDF of a booking's invoice (or null) */
export const loadInvoicePdf = async (bookingId) => {
  const doc = await Booking.findById(bookingId).select("+invoice.pdf").lean();
  if (!doc?.invoice?.number || !doc.invoice.pdf) return null;
  const pdf = Buffer.from(doc.invoice.pdf.buffer ?? doc.invoice.pdf);
  if (pdf.length >= 2000) return { number: doc.invoice.number, pdf };
  // Invoices issued before the blank-PDF fix contain an empty page. Re-render
  // once with the SAME number, date and stored figures, and persist it.
  const { number, issuedAt } = doc.invoice;
  const figures = { ...invoiceFigures(doc), ...metaOf(doc.invoice) };
  const fixed = await renderInvoicePdf({ booking: doc, number, issuedAt, figures });
  await Booking.updateOne({ _id: doc._id, "invoice.number": number }, { $set: { "invoice.pdf": fixed } });
  return { number, pdf: fixed };
};

/** Attachment descriptor for the outbox */
export const invoiceAttachment = (number, pdf) => ({ filename: `${number}.pdf`, contentType: "application/pdf", content: pdf });

// ---------------------------------------------------------------------------
// Customer invoice list + yearly § 35a statement
// ---------------------------------------------------------------------------

export const listInvoicesForCustomer = async (customerId, { year } = {}) => {
  const filter = { customer: customerId, "invoice.number": { $exists: true } };
  if (year) filter["invoice.issuedAt"] = { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) };
  const docs = await Booking.find(filter)
    .select("reference serviceId preferredDate slot slotEnd locale status estimate.durationMinutes job.actualDurationMinutes payment.status payment.method invoice")
    .sort({ "invoice.issuedAt": -1 })
    .lean();
  return docs.map((b) => ({
    bookingId: b._id,
    reference: b.reference,
    serviceId: b.serviceId,
    preferredDate: b.preferredDate,
    slot: b.slot,
    slotEnd: b.slotEnd ?? "",
    bookingStatus: b.status,
    // Booked duration incl. approved extra time
    durationMinutes: b.estimate?.durationMinutes ?? null,
    // paid · pending · unpaid · failed · refunded · partially_refunded · refund_pending
    paymentStatus: b.payment?.status,
    ...metaOf(b.invoice),
  }));
};

export const renderTaxStatementPdf = async ({ user, year, invoices, locale }) => {
  const l = lang(locale);
  const t = T[l];
  const eligible = invoices.filter((i) => i.taxDeductible && i.paymentStatus === "paid");
  const cashCount = invoices.filter((i) => !i.taxDeductible).length;
  const sumTotal = eligible.reduce((s, i) => s + (i.totalCents ?? 0), 0);
  const sumVat = eligible.reduce((s, i) => s + (i.vatCents ?? 0), 0);

  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `${t.statementTitle} ${year}`, Author: INVOICING.companyName } });
  const out = toBuffer(doc);
  header(doc, t.statementTitle, t.statementFor(year));

  block(doc, PAGE.left, 120, t.customer, [user.name, user.email]);
  block(doc, 330, 120, t.issuer, [...issuerLines(), INVOICING.taxId ? `${t.taxId}: ${INVOICING.taxId}` : ""], 215);

  let y = 200;
  doc.font("Helvetica").fontSize(10).fillColor("#24312B").text(t.statementIntro(user.name, year), PAGE.left, y, { width: PAGE.width });
  y = doc.y + 16;

  // Table header
  const cols = { inv: PAGE.left, date: PAGE.left + 110, service: PAGE.left + 180, vat: PAGE.right - 190, labour: PAGE.right - 95 };
  doc.font("Helvetica-Bold").fontSize(9).fillColor(GREY);
  doc.text(t.colInvoice.toUpperCase(), cols.inv, y);
  doc.text(t.colDate.toUpperCase(), cols.date, y);
  doc.text(t.colService.toUpperCase(), cols.service, y, { width: 150 });
  doc.text(t.colVat.toUpperCase(), cols.vat, y, { width: 90, align: "right" });
  doc.text(t.colLabour.toUpperCase(), cols.labour, y, { width: 95, align: "right" });
  y = rule(doc, y + 14, GREEN);

  doc.font("Helvetica").fontSize(9.5).fillColor("#24312B");
  if (eligible.length === 0) {
    doc.fillColor(GREY).text(t.statementNone, PAGE.left, y, { width: PAGE.width });
    y = doc.y + 6;
  }
  for (const inv of eligible) {
    if (y > 720) {
      footer(doc, t);
      doc.addPage();
      y = 60;
    }
    doc.fillColor("#24312B");
    doc.text(inv.number, cols.inv, y, { width: 105 });
    doc.text(day(inv.issuedAt, l), cols.date, y, { width: 65 });
    doc.text(`${SERVICE_NAMES[l][inv.serviceId] ?? inv.serviceId} (${inv.reference})`, cols.service, y, { width: 150 });
    doc.text(money(inv.vatCents, l), cols.vat, y, { width: 90, align: "right" });
    doc.text(money(inv.totalCents, l), cols.labour, y, { width: 95, align: "right" });
    y = doc.y + 4;
  }
  y = rule(doc, y + 2);
  y = row(doc, y, t.sumLabour, money(sumTotal, l), { bold: true, size: 11 });
  if (INVOICING.showVat) {
    y = row(doc, y, t.sumVat, money(sumVat, l), { color: GREY });
    y = row(doc, y, t.sumNet, money(sumTotal - sumVat, l), { color: GREY });
  }
  y += 10;
  doc.font("Helvetica").fontSize(9).fillColor(GREY);
  doc.text(t.taxLabourNote, PAGE.left, y, { width: PAGE.width });
  if (cashCount) doc.text(t.statementCash(cashCount), PAGE.left, doc.y + 4, { width: PAGE.width });
  doc.text(t.statementNote, PAGE.left, doc.y + 4, { width: PAGE.width });
  doc.text(`${t.issued}: ${day(new Date(), l)}`, PAGE.left, doc.y + 12, { width: PAGE.width });
  footer(doc, t);
  doc.end();
  return { pdf: await out, totals: { count: eligible.length, labourCents: sumTotal, vatCents: sumVat, netCents: sumTotal - sumVat, excludedCash: cashCount } };
};

/** Validate ?year= (defaults to the current year) */
export const parseStatementYear = (raw) => {
  const now = new Date().getFullYear();
  if (raw == null || raw === "") return now;
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 2020 || year > now) throw httpError(400, "Please provide a valid year.");
  return year;
};
