// Complaint mails: customer outcome (resolved / rejected), cleaner restriction
// notice and the internal admin notification. de / en / pl ("du").
import { emailButton, emailGreeting, emailLayout, sendAdminNotificationEmail, sendRawEmail } from "./email.service.js";
import { escapeHtml } from "../utils/helpers.js";
import { getSiteUrl } from "../utils/site-url.js";

const LOCALES = { de: "de-DE", en: "en-GB", pl: "pl-PL" };
const lang = (locale) => (LOCALES[locale] ? locale : "de");
const money = (cents, locale) => new Intl.NumberFormat(LOCALES[lang(locale)], { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);
const day = (date, locale) => new Date(date).toLocaleDateString(LOCALES[lang(locale)], { timeZone: "Europe/Berlin", day: "numeric", month: "long", year: "numeric" });

const CATEGORY_DE = { quality: "Qualität", damage: "Schaden", lateness: "Verspätung", no_show: "Nicht erschienen", behaviour: "Verhalten", other: "Sonstiges" };

const T = {
  de: {
    subject: { resolved: (ref) => `Deine Beschwerde zu Buchung ${ref} wurde bearbeitet`, rejected: (ref) => `Deine Beschwerde zu Buchung ${ref}` },
    title: { resolved: "Beschwerde bearbeitet", rejected: "Beschwerde geprüft" },
    intro: { resolved: "wir haben deine Beschwerde geprüft und Folgendes für dich veranlasst:", rejected: "wir haben deine Beschwerde sorgfältig geprüft, können ihr aber leider nicht stattgeben." },
    reason: "Begründung",
    remedies: {
      refund: (a) => `Erstattung von ${a} – du erhältst sie innerhalb von 7 Werktagen über PayPal.`,
      voucher: (a, code) => `Gutschein über ${a}${code ? ` (Code ${code})` : ""} – wir haben ihn dir zusätzlich per E-Mail geschickt.`,
      reclean: "Kostenlose Nachreinigung – wir melden uns zur Terminabstimmung.",
    },
    button: "Zur Buchung",
    cleanerSubject: "Hinweis zu einer Beschwerde",
    cleanerTitle: "Hinweis zu einer Beschwerde",
    cleanerIntro: (ref) => `zu deinem Einsatz ${ref} ist eine Beschwerde eingegangen. Nach Prüfung haben wir Folgendes entschieden:`,
    restriction: {
      warning: "Verwarnung. Bitte achte künftig besonders auf die Qualitäts- und Verhaltensregeln.",
      suspend: (until) => `Du erhältst bis ${until} keine neuen Aufträge.`,
      block: "Dein Konto wurde gesperrt. Bitte wende dich an das Büro.",
    },
    cleanerButton: "Zum Portal",
  },
  en: {
    subject: { resolved: (ref) => `Your complaint about booking ${ref} has been handled`, rejected: (ref) => `Your complaint about booking ${ref}` },
    title: { resolved: "Complaint handled", rejected: "Complaint reviewed" },
    intro: { resolved: "we have reviewed your complaint and arranged the following for you:", rejected: "we have carefully reviewed your complaint but unfortunately cannot uphold it." },
    reason: "Reason",
    remedies: {
      refund: (a) => `Refund of ${a} – you will receive it via PayPal within 7 working days.`,
      voucher: (a, code) => `Voucher worth ${a}${code ? ` (code ${code})` : ""} – we have also sent it to you by e-mail.`,
      reclean: "Free re-clean – we will contact you to arrange a date.",
    },
    button: "View booking",
    cleanerSubject: "Notice about a complaint",
    cleanerTitle: "Notice about a complaint",
    cleanerIntro: (ref) => `we received a complaint about your job ${ref}. After reviewing it we decided the following:`,
    restriction: {
      warning: "Warning. Please pay particular attention to the quality and conduct rules in future.",
      suspend: (until) => `You will not receive new jobs until ${until}.`,
      block: "Your account has been blocked. Please contact the office.",
    },
    cleanerButton: "Open portal",
  },
  pl: {
    subject: { resolved: (ref) => `Twoja reklamacja dotycząca rezerwacji ${ref} została rozpatrzona`, rejected: (ref) => `Twoja reklamacja dotycząca rezerwacji ${ref}` },
    title: { resolved: "Reklamacja rozpatrzona", rejected: "Reklamacja sprawdzona" },
    intro: { resolved: "sprawdziliśmy Twoją reklamację i przygotowaliśmy dla Ciebie:", rejected: "dokładnie sprawdziliśmy Twoją reklamację, ale niestety nie możemy jej uwzględnić." },
    reason: "Uzasadnienie",
    remedies: {
      refund: (a) => `Zwrot ${a} – otrzymasz go przez PayPal w ciągu 7 dni roboczych.`,
      voucher: (a, code) => `Bon o wartości ${a}${code ? ` (kod ${code})` : ""} – wysłaliśmy go też e-mailem.`,
      reclean: "Bezpłatne ponowne sprzątanie – skontaktujemy się w sprawie terminu.",
    },
    button: "Zobacz rezerwację",
    cleanerSubject: "Informacja o reklamacji",
    cleanerTitle: "Informacja o reklamacji",
    cleanerIntro: (ref) => `wpłynęła reklamacja dotycząca Twojego zlecenia ${ref}. Po jej sprawdzeniu zdecydowaliśmy:`,
    restriction: {
      warning: "Upomnienie. Prosimy w przyszłości szczególnie przestrzegać zasad jakości i zachowania.",
      suspend: (until) => `Do ${until} nie otrzymasz nowych zleceń.`,
      block: "Twoje konto zostało zablokowane. Skontaktuj się z biurem.",
    },
    cleanerButton: "Otwórz portal",
  },
};

/** Customer: outcome of their complaint (status resolved | rejected) */
export const sendComplaintOutcomeEmail = async ({ complaint, booking, customer }) => {
  const l = lang(customer?.preferredLanguage ?? booking?.locale);
  const t = T[l];
  const g = emailGreeting(l);
  const kind = complaint.status === "rejected" ? "rejected" : "resolved";
  const remedies =
    kind === "resolved"
      ? complaint.actions
          .map((a) =>
            a.type === "refund" ? t.remedies.refund(money(a.amountCents, l)) : a.type === "voucher" ? t.remedies.voucher(money(a.amountCents, l), a.giftCardCode) : a.type === "reclean" ? t.remedies.reclean : null
          )
          .filter(Boolean)
      : [];
  const message = complaint.resolution?.message ?? "";
  const url = `${getSiteUrl()}/konto/buchungen/${booking._id}#beschwerde`;
  const name = customer?.name ?? booking?.customerDetails?.name ?? "";
  const to = customer?.email ?? booking?.customerDetails?.email;
  return sendRawEmail({
    template: `complaint_${kind}`,
    bookingRef: complaint.bookingRef,
    to,
    subject: t.subject[kind](complaint.bookingRef),
    text: [
      g.hello(name),
      "",
      t.intro[kind],
      ...remedies.map((r) => `· ${r}`),
      ...(message ? ["", kind === "rejected" ? `${t.reason}: ${message}` : message] : []),
      "",
      `${t.button}: ${url}`,
      "",
      g.regards,
    ].join("\n"),
    html: emailLayout(
      t.title[kind],
      `<p>${escapeHtml(g.hello(name))}</p>
       <p>${escapeHtml(t.intro[kind])}</p>
       ${remedies.length ? `<ul>${remedies.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>` : ""}
       ${message ? `<p>${kind === "rejected" ? `<strong>${escapeHtml(t.reason)}:</strong> ` : ""}${escapeHtml(message)}</p>` : ""}
       ${emailButton(url, t.button)}`,
      g.regardsHtml
    ),
  });
};

/** Cleaner: the restriction they received (no customer text is included) */
export const sendComplaintRestrictionEmail = async ({ worker, complaint, action }) => {
  const l = lang(worker?.preferredLanguage);
  const t = T[l];
  const g = emailGreeting(l);
  const line = action.type === "suspend" ? t.restriction.suspend(day(action.until, l)) : t.restriction[action.type];
  const url = `${getSiteUrl()}/worker`;
  return sendRawEmail({
    template: "complaint_restriction",
    bookingRef: complaint.bookingRef,
    to: worker.email,
    subject: t.cleanerSubject,
    text: `${g.hello(worker.name)}\n\n${t.cleanerIntro(complaint.bookingRef)}\n\n${line}\n\n${g.regards}`,
    html: emailLayout(
      t.cleanerTitle,
      `<p>${escapeHtml(g.hello(worker.name))}</p><p>${escapeHtml(t.cleanerIntro(complaint.bookingRef))}</p><p><strong>${escapeHtml(line)}</strong></p>${emailButton(url, t.cleanerButton)}`,
      g.regardsHtml
    ),
  });
};

/** Office: a new complaint arrived (ADMIN_NOTIFICATION_EMAIL) */
export const sendNewComplaintAdminEmail = ({ complaint, customerName, workerName }) =>
  sendAdminNotificationEmail({
    subject: `Neue Beschwerde zu Buchung ${complaint.bookingRef}`,
    lines: [
      `Buchung: ${complaint.bookingRef}`,
      `Kunde: ${customerName}`,
      `Reinigungskraft: ${workerName || "–"}`,
      `Kategorie: ${CATEGORY_DE[complaint.category] ?? complaint.category}`,
      `Fotos: ${complaint.photos?.length ?? 0}`,
      "",
      complaint.description.slice(0, 500),
      "",
      `Im Adminbereich unter „Beschwerden“ bearbeiten: ${getSiteUrl()}/admin/beschwerden/${complaint._id}`,
    ],
  });
