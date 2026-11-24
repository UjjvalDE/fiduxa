// Mails for cleaner extra-time requests: request to the customer (de/en/pl),
// decision to both sides (new end time + final price), expiry to the cleaner.
// Cleaner mails are German with an English line (cleaners have no locale).
import { emailButton, emailGreeting, emailLayout, sendRawEmail } from "./email.service.js";
import { escapeHtml } from "../utils/helpers.js";
import { getSiteUrl } from "../utils/site-url.js";

const LOCALES = { de: "de-DE", en: "en-GB", pl: "pl-PL" };
const lang = (locale) => (LOCALES[locale] ? locale : "de");
const money = (cents, locale) => new Intl.NumberFormat(LOCALES[lang(locale)], { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);
const time = (date, locale) =>
  new Date(date).toLocaleString(LOCALES[lang(locale)], { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });

const rows = (pairs) =>
  `<table style="border-collapse:collapse;margin:16px 0">${pairs
    .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#65736B">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`)
    .join("")}</table>`;

const finalPrice = (booking) => booking.pricing?.totalCents ?? booking.estimate?.totalCents ?? 0;

const T = {
  de: {
    subject: (ref) => `Mehr Zeit für deine Reinigung? – Buchung ${ref}`,
    title: "Anfrage: zusätzliche Zeit",
    intro: (name, min) => `${name} bittet um ${min} Minuten zusätzliche Zeit für deine laufende Reinigung. Bitte stimme zu oder lehne ab – ohne deine Zustimmung wird nichts berechnet.`,
    reason: "Begründung",
    extra: "Zusätzliche Zeit",
    price: "Aufpreis",
    newEnd: "Neues Ende",
    answerBy: "Bitte antworte bis",
    button: "Jetzt entscheiden",
    decided: {
      subject: (ref, ok) => `Zusätzliche Zeit ${ok ? "bestätigt" : "abgelehnt"} – Buchung ${ref}`,
      title: (ok) => (ok ? "Zusätzliche Zeit bestätigt" : "Zusätzliche Zeit abgelehnt"),
      body: (ok) => (ok ? "du hast der zusätzlichen Zeit zugestimmt. Den Aufpreis bezahlst du über den Zahlungslink in deinem Konto." : "du hast die zusätzliche Zeit abgelehnt. Die Reinigung endet zur ursprünglich gebuchten Zeit."),
      total: "Endpreis",
      end: "Ende",
    },
  },
  en: {
    subject: (ref) => `More time for your cleaning? – booking ${ref}`,
    title: "Request: extra time",
    intro: (name, min) => `${name} asks for ${min} extra minutes for your ongoing cleaning. Please approve or decline – nothing is charged without your consent.`,
    reason: "Reason",
    extra: "Extra time",
    price: "Extra charge",
    newEnd: "New end time",
    answerBy: "Please answer by",
    button: "Decide now",
    decided: {
      subject: (ref, ok) => `Extra time ${ok ? "approved" : "declined"} – booking ${ref}`,
      title: (ok) => (ok ? "Extra time approved" : "Extra time declined"),
      body: (ok) => (ok ? "you approved the extra time. Please pay the extra charge via the payment link in your account." : "you declined the extra time. The cleaning ends at the originally booked time."),
      total: "Final price",
      end: "End time",
    },
  },
  pl: {
    subject: (ref) => `Więcej czasu na sprzątanie? – rezerwacja ${ref}`,
    title: "Prośba: dodatkowy czas",
    intro: (name, min) => `${name} prosi o ${min} minut dodatkowego czasu na trwające sprzątanie. Zaakceptuj lub odrzuć – bez Twojej zgody nic nie naliczymy.`,
    reason: "Uzasadnienie",
    extra: "Dodatkowy czas",
    price: "Dopłata",
    newEnd: "Nowa godzina zakończenia",
    answerBy: "Odpowiedz do",
    button: "Zdecyduj teraz",
    decided: {
      subject: (ref, ok) => `Dodatkowy czas ${ok ? "zaakceptowany" : "odrzucony"} – rezerwacja ${ref}`,
      title: (ok) => (ok ? "Dodatkowy czas zaakceptowany" : "Dodatkowy czas odrzucony"),
      body: (ok) => (ok ? "zaakceptowałeś/-aś dodatkowy czas. Dopłatę opłacisz przez link do płatności na swoim koncie." : "odrzuciłeś/-aś dodatkowy czas. Sprzątanie kończy się o pierwotnie zarezerwowanej godzinie."),
      total: "Cena końcowa",
      end: "Zakończenie",
    },
  },
};

/** Customer: the cleaner asks for extra time */
export const sendExtraTimeRequestEmail = async ({ booking, adjustment, workerName }) => {
  const l = lang(booking.locale);
  const t = T[l];
  const g = emailGreeting(l);
  const first = String(workerName ?? "").split(" ")[0] || "Fiduxa";
  const url = `${getSiteUrl()}/konto/buchungen/${booking._id}`;
  const pairs = [
    [t.extra, `${adjustment.minutes} min`],
    [t.price, `+${money(adjustment.deltaCents, l)}`],
    [t.reason, adjustment.reason],
    ...(adjustment.newSlotEnd ? [[t.newEnd, adjustment.newSlotEnd]] : []),
    [t.answerBy, time(adjustment.expiresAt, l)],
  ];
  const intro = t.intro(first, adjustment.minutes);
  return sendRawEmail({
    template: "extraTime.request",
    bookingRef: booking.reference,
    to: booking.customerDetails.email,
    subject: t.subject(booking.reference),
    text: `${g.hello(booking.customerDetails.name)}\n\n${intro}\n\n${pairs.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${t.button}: ${url}\n\n${g.regards}`,
    html: emailLayout(t.title, `<p>${escapeHtml(g.hello(booking.customerDetails.name))}</p><p>${escapeHtml(intro)}</p>${rows(pairs)}${emailButton(url, t.button)}`, g.regardsHtml),
  });
};

/** Customer + cleaner: decision with the new end time and the final price */
export const sendExtraTimeDecisionEmails = async ({ booking, adjustment, worker, approved }) => {
  const l = lang(booking.locale);
  const t = T[l];
  const g = emailGreeting(l);
  const end = booking.slotEnd || "";
  const pairs = [[t.decided.end, end || "-"], [t.decided.total, money(finalPrice(booking), l)], [t.extra, approved ? `${adjustment.minutes} min` : "0 min"]];
  await sendRawEmail({
    template: `extraTime.${approved ? "approved" : "declined"}`,
    bookingRef: booking.reference,
    to: booking.customerDetails.email,
    subject: t.decided.subject(booking.reference, approved),
    text: `${g.hello(booking.customerDetails.name)}\n\n${t.decided.body(approved)}\n\n${pairs.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${g.regards}`,
    html: emailLayout(t.decided.title(approved), `<p>${escapeHtml(g.hello(booking.customerDetails.name))}</p><p>${escapeHtml(t.decided.body(approved))}</p>${rows(pairs)}`, g.regardsHtml),
  });
  if (!worker?.email) return;
  const de = approved
    ? `Der Kunde hat ${adjustment.minutes} Minuten zusätzliche Zeit bestätigt. Neues Ende: ${end || "-"}.`
    : "Der Kunde hat die zusätzliche Zeit abgelehnt. Bitte schließe die Reinigung innerhalb der ursprünglich gebuchten Zeit ab.";
  const en = approved
    ? `The customer approved ${adjustment.minutes} extra minutes. New end time: ${end || "-"}.`
    : "The customer declined the extra time. Please finish the cleaning within the originally booked time.";
  const wPairs = [["Buchung / Booking", booking.reference], ["Ende / End", end || "-"], ["Endpreis / Final price", money(finalPrice(booking), "de")]];
  await sendRawEmail({
    template: `extraTime.worker.${approved ? "approved" : "declined"}`,
    bookingRef: booking.reference,
    to: worker.email,
    subject: `Zusätzliche Zeit ${approved ? "bestätigt" : "abgelehnt"} – ${booking.reference}`,
    text: `Hallo ${worker.name},\n\n${de}\n${en}\n\n${wPairs.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nDein Fiduxa-Team`,
    html: emailLayout(
      approved ? "Zusätzliche Zeit bestätigt" : "Zusätzliche Zeit abgelehnt",
      `<p>Hallo ${escapeHtml(worker.name)},</p><p>${escapeHtml(de)}</p><p style="color:#65736B">${escapeHtml(en)}</p>${rows(wPairs)}`,
      "<p>Dein Fiduxa-Team</p>"
    ),
  });
};

/** Cleaner: the customer did not answer in time */
export const sendExtraTimeExpiredEmail = async ({ booking, adjustment, worker }) =>
  sendRawEmail({
    template: "extraTime.worker.expired",
    bookingRef: booking.reference,
    to: worker.email,
    subject: `Anfrage für zusätzliche Zeit abgelaufen – ${booking.reference}`,
    text: `Hallo ${worker.name},\n\ndeine Anfrage über ${adjustment.minutes} Minuten wurde nicht rechtzeitig beantwortet und ist abgelaufen. Bitte schließe die Reinigung in der gebuchten Zeit ab.\nYour request for ${adjustment.minutes} extra minutes was not answered in time and has expired. Please finish within the booked time.\n\nDein Fiduxa-Team`,
    html: emailLayout(
      "Anfrage abgelaufen",
      `<p>Hallo ${escapeHtml(worker.name)},</p><p>deine Anfrage über ${adjustment.minutes} Minuten wurde nicht rechtzeitig beantwortet und ist abgelaufen. Bitte schließe die Reinigung in der gebuchten Zeit ab.</p><p style="color:#65736B">Your request for ${adjustment.minutes} extra minutes was not answered in time and has expired. Please finish within the booked time.</p>`,
      "<p>Dein Fiduxa-Team</p>"
    ),
  });
