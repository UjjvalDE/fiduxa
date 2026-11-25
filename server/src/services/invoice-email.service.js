// Mails of the invoicing / manual-booking features (rendered through the
// shared outbox in email.service.js): "your invoice" after a cash payment
// and the pay-link mail for phone orders.
import { escapeHtml, slotLabel } from "../utils/helpers.js";
import { getSiteUrl } from "../utils/site-url.js";
import { emailButton, emailGreeting, emailLayout, sendRawEmail } from "./email.service.js";
import { invoiceAttachment } from "./invoice.service.js";

const LOCALES = { de: "de-DE", en: "en-GB", pl: "pl-PL" };
const lang = (locale) => (LOCALES[locale] ? locale : "de");
const money = (cents, l) => new Intl.NumberFormat(LOCALES[l], { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);
const dayOf = (date, l) => new Date(date).toLocaleDateString(LOCALES[l], { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });

const TEXTS = {
  de: {
    invoiceSubject: (n, ref) => `Ihre Rechnung ${n} – Buchung ${ref}`,
    invoiceTitle: "Ihre Rechnung",
    invoiceBody: (n, amount) => `vielen Dank für Ihre Zahlung. Ihre Rechnung ${n} über ${amount} finden Sie im Anhang und jederzeit in Ihrem Fiduxa-Konto unter „Rechnungen“.`,
    cashNote: "Hinweis: Barzahlungen können nicht nach § 35a EStG (haushaltsnahe Dienstleistungen) abgesetzt werden.",
    taxNote: "Tipp: Der gesamte Rechnungsbetrag zählt als Arbeitskosten nach § 35a EStG – bis zu 20 % können Sie von der Steuer absetzen.",
    linkSubject: (ref) => `Bitte Zahlung abschließen – Buchung ${ref}`,
    linkTitle: "Ihr Termin ist reserviert",
    linkBody: "wir haben Ihre Reinigung wie telefonisch besprochen reserviert. Bitte schließen Sie die Zahlung über den folgenden Link ab, damit der Termin verbindlich wird:",
    linkButton: "Jetzt bezahlen",
    linkHold: (until) => `Die Reservierung gilt bis ${until}.`,
    reference: "Buchungsnummer",
    appointment: "Termin",
    amount: "Betrag",
  },
  en: {
    invoiceSubject: (n, ref) => `Your invoice ${n} – booking ${ref}`,
    invoiceTitle: "Your invoice",
    invoiceBody: (n, amount) => `thank you for your payment. Your invoice ${n} for ${amount} is attached and always available in your Fiduxa account under "Invoices".`,
    cashNote: "Note: cash payments cannot be deducted under § 35a EStG (household-related services).",
    taxNote: "Tip: the whole invoice amount counts as labour costs under § 35a EStG – up to 20% can be deducted from your German income tax.",
    linkSubject: (ref) => `Please complete your payment – booking ${ref}`,
    linkTitle: "Your appointment is reserved",
    linkBody: "we have reserved your cleaning as discussed on the phone. Please complete the payment via the link below to make the appointment binding:",
    linkButton: "Pay now",
    linkHold: (until) => `The reservation is held until ${until}.`,
    reference: "Booking number",
    appointment: "Appointment",
    amount: "Amount",
  },
  pl: {
    invoiceSubject: (n, ref) => `Twoja faktura ${n} – rezerwacja ${ref}`,
    invoiceTitle: "Twoja faktura",
    invoiceBody: (n, amount) => `dziękujemy za płatność. Fakturę ${n} na kwotę ${amount} znajdziesz w załączniku oraz zawsze na koncie Fiduxa w zakładce „Faktury”.`,
    cashNote: "Uwaga: płatności gotówkowych nie można odliczyć zgodnie z § 35a EStG (usługi domowe).",
    taxNote: "Wskazówka: cała kwota faktury liczy się jako koszty pracy zgodnie z § 35a EStG – do 20% można odliczyć od niemieckiego podatku.",
    linkSubject: (ref) => `Dokończ płatność – rezerwacja ${ref}`,
    linkTitle: "Twój termin jest zarezerwowany",
    linkBody: "zarezerwowaliśmy sprzątanie zgodnie z rozmową telefoniczną. Dokończ płatność przez poniższy link, aby termin stał się wiążący:",
    linkButton: "Zapłać teraz",
    linkHold: (until) => `Rezerwacja obowiązuje do ${until}.`,
    reference: "Numer rezerwacji",
    appointment: "Termin",
    amount: "Kwota",
  },
};

/** "Your invoice" mail with the PDF attached (cash payments after the job) */
export const sendInvoiceEmail = async ({ booking, invoice, pdf, storageKey = null }) => {
  const l = lang(booking.locale);
  const t = TEXTS[l];
  const g = emailGreeting(l);
  const name = booking.customerDetails?.name ?? "";
  const body = t.invoiceBody(invoice.number, money(invoice.totalCents, l));
  const note = invoice.taxDeductible ? t.taxNote : t.cashNote;
  return sendRawEmail({
    template: "invoice",
    bookingRef: booking.reference,
    to: booking.customerDetails.email,
    subject: t.invoiceSubject(invoice.number, booking.reference),
    text: `${g.hello(name)}\n\n${body}\n\n${note}\n\n${g.regards}`,
    html: emailLayout(
      t.invoiceTitle,
      `<p>${escapeHtml(g.hello(name))}</p><p>${escapeHtml(body)}</p><p style="color:#65736B;font-size:13px">${escapeHtml(note)}</p>`,
      g.regardsHtml
    ),
    attachments: pdf ? [invoiceAttachment(invoice.number, pdf, storageKey)] : undefined,
  });
};

/** Pay-link mail for bookings the office created by phone (payment "link") */
export const sendPaymentLinkEmail = async ({ booking }) => {
  const l = lang(booking.locale);
  const t = TEXTS[l];
  const g = emailGreeting(l);
  const name = booking.customerDetails?.name ?? "";
  const url = `${getSiteUrl()}/zahlung/${booking._id}`;
  const rows = [
    [t.reference, booking.reference],
    [t.appointment, `${dayOf(booking.preferredDate, l)}, ${slotLabel(booking.slot, booking.slotEnd)}`],
    [t.amount, money(booking.payment?.amountCents ?? booking.pricing?.payableCents ?? 0, l)],
  ];
  const hold = booking.holdExpiresAt ? t.linkHold(new Date(booking.holdExpiresAt).toLocaleString(LOCALES[l], { timeZone: "Europe/Berlin" })) : "";
  return sendRawEmail({
    template: "paymentLink",
    bookingRef: booking.reference,
    to: booking.customerDetails.email,
    subject: t.linkSubject(booking.reference),
    text: `${g.hello(name)}\n\n${t.linkBody}\n${url}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n${hold}\n\n${g.regards}`,
    html: emailLayout(
      t.linkTitle,
      `<p>${escapeHtml(g.hello(name))}</p><p>${escapeHtml(t.linkBody)}</p>${emailButton(url, t.linkButton)}
       <table style="border-collapse:collapse;margin:16px 0">${rows
         .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#65736B">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`)
         .join("")}</table>
       ${hold ? `<p style="color:#65736B;font-size:13px">${escapeHtml(hold)}</p>` : ""}`,
      g.regardsHtml
    ),
  });
};
