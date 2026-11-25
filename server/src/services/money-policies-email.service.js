// Customer mails for the money policies: cancellation fee notice and price
// adjustments (pay link, proposal after a duration review, refund, waiver).
// Rendered through the shared e-mail layout; de / en / pl ("du").
import { emailButton, emailGreeting, emailLayout, sendRawEmail } from "./email.service.js";
import { escapeHtml } from "../utils/helpers.js";
import { getSiteUrl } from "../utils/site-url.js";

const LOCALES = { de: "de-DE", en: "en-GB", pl: "pl-PL" };
const lang = (locale) => (LOCALES[locale] ? locale : "de");
const money = (cents, locale) => new Intl.NumberFormat(LOCALES[lang(locale)], { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);
const day = (date, locale) => new Date(date).toLocaleDateString(LOCALES[lang(locale)], { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

const rows = (pairs) =>
  `<table style="border-collapse:collapse;margin:16px 0">${pairs
    .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#65736B">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`)
    .join("")}</table>`;

const FEE = {
  de: {
    subject: (ref) => `Stornogebühr für Buchung ${ref}`,
    title: "Stornogebühr",
    intro: (pct, hours) => `du hast kurzfristig storniert (weniger als ${hours} Stunden vor Beginn). Laut unseren Stornobedingungen fällt eine Gebühr von ${pct} % des Preises an.`,
    fee: "Stornogebühr",
    kept: (amount) => `Die Gebühr wurde von deiner Zahlung einbehalten; ${amount} erstatten wir dir innerhalb von 7 Werktagen über PayPal.`,
    keptAll: "Die Gebühr entspricht dem bereits gezahlten Betrag – es gibt keine Erstattung.",
    outstanding: (amount) => `Offener Betrag: ${amount}. Er wird mit deiner nächsten Buchung verrechnet – du musst jetzt nichts tun.`,
    reference: "Buchungsnummer",
    appointment: "Termin",
  },
  en: {
    subject: (ref) => `Cancellation fee for booking ${ref}`,
    title: "Cancellation fee",
    intro: (pct, hours) => `you cancelled at short notice (less than ${hours} hours before the start). Under our cancellation policy a fee of ${pct} % of the price applies.`,
    fee: "Cancellation fee",
    kept: (amount) => `The fee was kept from your payment; ${amount} will be refunded to you via PayPal within 7 working days.`,
    keptAll: "The fee equals the amount already paid – there is no refund.",
    outstanding: (amount) => `Outstanding amount: ${amount}. It will be settled with your next booking – nothing to do right now.`,
    reference: "Booking number",
    appointment: "Appointment",
  },
  pl: {
    subject: (ref) => `Opłata za anulowanie rezerwacji ${ref}`,
    title: "Opłata za anulowanie",
    intro: (pct, hours) => `anulowałeś/-aś rezerwację w krótkim terminie (mniej niż ${hours} godzin przed rozpoczęciem). Zgodnie z naszymi warunkami naliczamy opłatę w wysokości ${pct} % ceny.`,
    fee: "Opłata za anulowanie",
    kept: (amount) => `Opłata została potrącona z Twojej płatności; ${amount} zwrócimy Ci przez PayPal w ciągu 7 dni roboczych.`,
    keptAll: "Opłata odpowiada zapłaconej kwocie – zwrot nie przysługuje.",
    outstanding: (amount) => `Kwota do zapłaty: ${amount}. Rozliczymy ją przy Twojej następnej rezerwacji – teraz nic nie musisz robić.`,
    reference: "Numer rezerwacji",
    appointment: "Termin",
  },
};

/** Fee notice after a late cancellation (only when feeCents > 0) */
export const sendCancellationFeeEmail = async ({ booking, fee }) => {
  const l = lang(booking.locale);
  const t = FEE[l];
  const g = emailGreeting(l);
  const hours = fee.policy?.freeHours ?? 24;
  const outcome =
    fee.outstandingCents > 0 ? t.outstanding(money(fee.outstandingCents, l)) : fee.refundCents > 0 ? t.kept(money(fee.refundCents, l)) : t.keptAll;
  const pairs = [
    [t.reference, booking.reference],
    [t.appointment, `${day(booking.preferredDate, l)}, ${booking.slot}`],
    [t.fee, `${money(fee.feeCents, l)} (${fee.feePct} %)`],
  ];
  return sendRawEmail({
    template: "cancellationFee",
    bookingRef: booking.reference,
    to: booking.customerDetails.email,
    subject: t.subject(booking.reference),
    text: `${g.hello(booking.customerDetails.name)}

${t.intro(fee.feePct, hours)}

${pairs.map(([k, v]) => `${k}: ${v}`).join("\n")}

${outcome}

${g.regards}`,
    html: emailLayout(
      t.title,
      `<p>${escapeHtml(g.hello(booking.customerDetails.name))}</p>
       <p>${escapeHtml(t.intro(fee.feePct, hours))}</p>
       ${rows(pairs)}
       <p>${escapeHtml(outcome)}</p>`,
      g.regardsHtml
    ),
  });
};

const ADJ = {
  de: {
    subject: { pay: (ref) => `Nachzahlung für Buchung ${ref}`, proposal: (ref) => `Bitte bestätigen: Preisanpassung für Buchung ${ref}`, refunded: (ref) => `Teilerstattung für Buchung ${ref}`, paid: (ref) => `Nachzahlung erhalten – Buchung ${ref}`, waived: (ref) => `Preisanpassung erlassen – Buchung ${ref}` },
    title: { pay: "Nachzahlung", proposal: "Preisanpassung bestätigen", refunded: "Teilerstattung", paid: "Vielen Dank", waived: "Preisanpassung erlassen" },
    intro: {
      pay: (d) => `deine Buchung wurde geändert und ist dadurch um ${d} teurer geworden. Bitte zahle die Differenz über den Link unten.`,
      proposal: (d, min) => `bei deiner Reinigung ${min > 0 ? `wurden ${min} Minuten länger gearbeitet` : `wurden ${-min} Minuten weniger benötigt`} als gebucht. Wir schlagen eine Preisanpassung von ${d} vor. Bitte bestätige oder lehne sie in deinem Konto ab – ohne deine Zustimmung wird nichts berechnet.`,
      refunded: (d) => `deine Buchung wurde geändert und ist dadurch um ${d} günstiger geworden. Wir erstatten dir die Differenz innerhalb von 7 Werktagen über PayPal.`,
      paid: (d) => `wir haben deine Nachzahlung von ${d} erhalten. Danke!`,
      waived: () => "die vorgeschlagene Preisanpassung wurde erlassen. Es fällt nichts an.",
    },
    reason: "Grund",
    amount: "Betrag",
    reference: "Buchungsnummer",
    button: { pay: "Jetzt bezahlen", proposal: "Im Konto prüfen" },
    note: "Der Zahlungslink ist 30 Minuten gültig – danach kannst du die Zahlung jederzeit in deinem Konto neu starten.",
  },
  en: {
    subject: { pay: (ref) => `Additional payment for booking ${ref}`, proposal: (ref) => `Please confirm: price adjustment for booking ${ref}`, refunded: (ref) => `Partial refund for booking ${ref}`, paid: (ref) => `Additional payment received – booking ${ref}`, waived: (ref) => `Price adjustment waived – booking ${ref}` },
    title: { pay: "Additional payment", proposal: "Confirm price adjustment", refunded: "Partial refund", paid: "Thank you", waived: "Price adjustment waived" },
    intro: {
      pay: (d) => `your booking was changed and is now ${d} more expensive. Please pay the difference via the link below.`,
      proposal: (d, min) => `your cleaning ${min > 0 ? `took ${min} minutes longer` : `needed ${-min} minutes less`} than booked. We propose a price adjustment of ${d}. Please approve or decline it in your account – nothing is charged without your consent.`,
      refunded: (d) => `your booking was changed and is now ${d} cheaper. We refund the difference to you via PayPal within 7 working days.`,
      paid: (d) => `we have received your additional payment of ${d}. Thank you!`,
      waived: () => "the proposed price adjustment was waived. Nothing is due.",
    },
    reason: "Reason",
    amount: "Amount",
    reference: "Booking number",
    button: { pay: "Pay now", proposal: "Review in your account" },
    note: "The payment link is valid for 30 minutes – after that you can restart the payment any time from your account.",
  },
  pl: {
    subject: { pay: (ref) => `Dopłata do rezerwacji ${ref}`, proposal: (ref) => `Potwierdź: korekta ceny rezerwacji ${ref}`, refunded: (ref) => `Częściowy zwrot za rezerwację ${ref}`, paid: (ref) => `Dopłata otrzymana – rezerwacja ${ref}`, waived: (ref) => `Korekta ceny anulowana – rezerwacja ${ref}` },
    title: { pay: "Dopłata", proposal: "Potwierdź korektę ceny", refunded: "Częściowy zwrot", paid: "Dziękujemy", waived: "Korekta ceny anulowana" },
    intro: {
      pay: (d) => `Twoja rezerwacja została zmieniona i jest teraz droższa o ${d}. Dopłać różnicę, korzystając z poniższego linku.`,
      proposal: (d, min) => `sprzątanie ${min > 0 ? `trwało o ${min} minut dłużej` : `wymagało o ${-min} minut mniej`} niż zarezerwowano. Proponujemy korektę ceny o ${d}. Zaakceptuj lub odrzuć ją na swoim koncie – bez Twojej zgody nic nie naliczymy.`,
      refunded: (d) => `Twoja rezerwacja została zmieniona i jest teraz tańsza o ${d}. Zwrócimy Ci różnicę przez PayPal w ciągu 7 dni roboczych.`,
      paid: (d) => `otrzymaliśmy Twoją dopłatę w wysokości ${d}. Dziękujemy!`,
      waived: () => "proponowana korekta ceny została anulowana. Nic nie jest należne.",
    },
    reason: "Powód",
    amount: "Kwota",
    reference: "Numer rezerwacji",
    button: { pay: "Zapłać teraz", proposal: "Sprawdź na koncie" },
    note: "Link do płatności jest ważny 30 minut – potem możesz w każdej chwili ponownie rozpocząć płatność na swoim koncie.",
  },
};

/**
 * variant: "pay" (pay link for a positive delta) · "proposal" (duration review,
 * customer decides) · "refunded" · "paid" · "waived"
 */
export const sendPriceAdjustmentEmail = async ({ booking, adjustment, variant }) => {
  const l = lang(booking.locale);
  const t = ADJ[l];
  const g = emailGreeting(l);
  const delta = money(Math.abs(adjustment.deltaCents), l);
  const intro = t.intro[variant](delta, adjustment.minutes ?? 0);
  const accountUrl = `${getSiteUrl()}/konto/buchungen/${booking._id}`;
  const url = variant === "pay" ? adjustment.checkoutUrl || accountUrl : variant === "proposal" ? accountUrl : null;
  const pairs = [
    [t.reference, booking.reference],
    [t.amount, `${adjustment.deltaCents > 0 ? "+" : "−"}${delta}`],
    ...(adjustment.reason ? [[t.reason, adjustment.reason]] : []),
  ];
  return sendRawEmail({
    template: `priceAdjustment.${variant}`,
    bookingRef: booking.reference,
    to: booking.customerDetails.email,
    subject: t.subject[variant](booking.reference),
    text: `${g.hello(booking.customerDetails.name)}

${intro}

${pairs.map(([k, v]) => `${k}: ${v}`).join("\n")}
${url ? `\n${t.button[variant]}: ${url}\n${variant === "pay" ? t.note : ""}` : ""}
${g.regards}`,
    html: emailLayout(
      t.title[variant],
      `<p>${escapeHtml(g.hello(booking.customerDetails.name))}</p>
       <p>${escapeHtml(intro)}</p>
       ${rows(pairs)}
       ${url ? emailButton(url, t.button[variant]) : ""}
       ${variant === "pay" ? `<p style="color:#65736B;font-size:13px">${escapeHtml(t.note)}</p>` : ""}`,
      g.regardsHtml
    ),
  });
};
