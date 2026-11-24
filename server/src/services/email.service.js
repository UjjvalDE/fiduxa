import nodemailer from "nodemailer";
import { escapeHtml, slotLabel } from "../utils/helpers.js";
import { getSiteUrl } from "../utils/site-url.js";

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const createTransporter = () => {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing email configuration: ${missing.join(", ")}`);
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const send = async ({ to, subject, text, html }) => {
  const transporter = createTransporter();
  return transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, text, html });
};

// Fire-and-report helper: returns "sent" | "failed" instead of throwing.
export const trySend = async (label, fn) => {
  try {
    await fn();
    return "sent";
  } catch (error) {
    console.error(`${label} email failed:`, error.message);
    return "failed";
  }
};

// ---------------------------------------------------------------------------
// i18n (customer-facing emails: de / en / pl; internal admin mails: de)
// ---------------------------------------------------------------------------

const LOCALES = { de: "de-DE", en: "en-GB", pl: "pl-PL" };
const lang = (locale) => (LOCALES[locale] ? locale : "de");

const SERVICE_NAMES = {
  de: {
    "home-cleaning": "Wohnungsreinigung",
    "deep-cleaning": "Grundreinigung",
    "end-of-tenancy": "Umzugsreinigung",
    "business-cleaning": "Büro- und Gewerbereinigung",
  },
  en: {
    "home-cleaning": "Home cleaning",
    "deep-cleaning": "Deep cleaning",
    "end-of-tenancy": "End-of-tenancy cleaning",
    "business-cleaning": "Office & commercial cleaning",
  },
  pl: {
    "home-cleaning": "Sprzątanie mieszkania",
    "deep-cleaning": "Gruntowne sprzątanie",
    "end-of-tenancy": "Sprzątanie po przeprowadzce",
    "business-cleaning": "Sprzątanie biur i lokali",
  },
};

const T = {
  de: {
    hello: (name) => `Hallo ${name},`,
    regards: "Viele Grüße\nIhr Fiduxa Team",
    regardsHtml: "Viele Grüße<br/>Ihr Fiduxa Team",
    reference: "Buchungsnummer",
    service: "Leistung",
    appointment: "Termin",
    address: "Adresse",
    duration: "Dauer",
    hours: (h) => `${h} Std.`,
    amount: "Betrag",
    paid: "bezahlt",
    invoice: "Sie erhalten eine Rechnung per E-Mail.",
    confirmedSubject: (ref) => `Ihre Reinigung ist bestätigt – ${ref}`,
    confirmedTitle: "Ihre Reinigung ist bestätigt",
    confirmedIntro: "vielen Dank für Ihre Buchung. Hier sind Ihre Termindetails:",
    manage: "Sie können Ihre Buchung jederzeit in Ihrem Fiduxa-Konto ansehen oder bis 24 Stunden vorher stornieren.",
    statusSubject: (ref) => `Buchung ${ref} – Statusänderung`,
    statusTitle: "Statusänderung Ihrer Buchung",
    status: {
      cancelled: "Ihre Buchung wurde storniert.",
      completed: "Ihre Reinigung wurde abgeschlossen. Vielen Dank!",
      expired: "Ihre Reservierung ist abgelaufen, weil die Zahlung nicht abgeschlossen wurde.",
    },
    refundNote: "Der gezahlte Betrag wird auf Ihr ursprüngliches Zahlungsmittel erstattet.",
    resetSubject: "Passwort zurücksetzen – Fiduxa",
    resetTitle: "Passwort zurücksetzen",
    resetBody: "Sie haben angefordert, Ihr Passwort zurückzusetzen. Der Link ist 30 Minuten gültig.",
    resetButton: "Neues Passwort festlegen",
    resetIgnore: "Falls Sie das nicht waren, können Sie diese E-Mail ignorieren.",
    inviteSubject: "Ihre Einladung als Reinigungskraft – Fiduxa",
    inviteTitle: "Willkommen bei Fiduxa",
    inviteBody: "Sie wurden eingeladen, unserem Reinigungsteam beizutreten.",
    inviteButton: "Konto einrichten",
    inviteExpiry: "Die Einladung ist 24 Stunden gültig.",
    jobNewSubject: (date) => `Neuer Auftrag verfügbar – ${date}`,
    jobNewTitle: "Neuer Auftrag verfügbar",
    jobNewBody: "Ein neuer Reinigungsauftrag passt in deinen Kalender. Wer zuerst annimmt, bekommt den Auftrag.",
    jobNewButton: "Offene Aufträge ansehen",
    jobAssignedSubject: (ref) => `Dir wurde ein Auftrag zugewiesen – ${ref}`,
    jobAssignedTitle: "Neuer Auftrag für dich",
    jobAssignedBody: "Das Büro hat dir einen Auftrag zugewiesen. Alle Details findest du im Reinigungsportal.",
    jobButton: "Auftrag öffnen",
    postcode: "PLZ",
    cleanerAssignedSubject: (ref) => `Deine Reinigungskraft steht fest – ${ref}`,
    cleanerAssignedTitle: "Deine Reinigungskraft steht fest",
    cleanerAssignedBody: (name) => `${name} übernimmt deine Reinigung.`,
    onTheWaySubject: (ref) => `Deine Reinigungskraft ist unterwegs – ${ref}`,
    onTheWayTitle: "Deine Reinigungskraft ist unterwegs",
    onTheWayBody: (name) => `${name} ist auf dem Weg zu dir.`,
    b2bSubject: (ref) => `Ihre Angebotsanfrage ${ref} – Fiduxa`,
    b2bTitle: "Vielen Dank für Ihre Anfrage",
    b2bBody: (ref) =>
      `Wir prüfen Ihre Angaben und melden uns mit einem individuellen Angebot. Ihre Referenznummer lautet ${ref}.`,
  },
  en: {
    hello: (name) => `Hello ${name},`,
    regards: "Best regards\nYour Fiduxa team",
    regardsHtml: "Best regards<br/>Your Fiduxa team",
    reference: "Booking number",
    service: "Service",
    appointment: "Appointment",
    address: "Address",
    duration: "Duration",
    hours: (h) => `${h} h`,
    amount: "Amount",
    paid: "paid",
    invoice: "You will receive an invoice by email.",
    confirmedSubject: (ref) => `Your cleaning is confirmed – ${ref}`,
    confirmedTitle: "Your cleaning is confirmed",
    confirmedIntro: "thank you for your booking. Here are your appointment details:",
    manage: "You can view your booking in your Fiduxa account at any time or cancel it up to 24 hours in advance.",
    statusSubject: (ref) => `Booking ${ref} – status update`,
    statusTitle: "Your booking status has changed",
    status: {
      cancelled: "Your booking has been cancelled.",
      completed: "Your cleaning has been completed. Thank you!",
      expired: "Your reservation has expired because the payment was not completed.",
    },
    refundNote: "The amount paid will be refunded to your original payment method.",
    resetSubject: "Reset your password – Fiduxa",
    resetTitle: "Reset your password",
    resetBody: "You asked to reset your password. The link is valid for 30 minutes.",
    resetButton: "Set a new password",
    resetIgnore: "If this wasn't you, you can ignore this email.",
    inviteSubject: "Your invitation to join Fiduxa as a cleaner",
    inviteTitle: "Welcome to Fiduxa",
    inviteBody: "You have been invited to join our cleaning team.",
    inviteButton: "Set up my account",
    inviteExpiry: "This invitation is valid for 24 hours.",
    jobNewSubject: (date) => `New job available – ${date}`,
    jobNewTitle: "New job available",
    jobNewBody: "A new cleaning job fits your calendar. The first cleaner to accept gets the job.",
    jobNewButton: "View open jobs",
    jobAssignedSubject: (ref) => `A job has been assigned to you – ${ref}`,
    jobAssignedTitle: "New job for you",
    jobAssignedBody: "The office has assigned a job to you. You can find all details in the cleaner portal.",
    jobButton: "Open job",
    postcode: "Postcode",
    cleanerAssignedSubject: (ref) => `Your cleaner is confirmed – ${ref}`,
    cleanerAssignedTitle: "Your cleaner is confirmed",
    cleanerAssignedBody: (name) => `${name} will take care of your cleaning.`,
    onTheWaySubject: (ref) => `Your cleaner is on the way – ${ref}`,
    onTheWayTitle: "Your cleaner is on the way",
    onTheWayBody: (name) => `${name} is on the way to you.`,
    b2bSubject: (ref) => `Your quotation request ${ref} – Fiduxa`,
    b2bTitle: "Thank you for your request",
    b2bBody: (ref) =>
      `We are reviewing your details and will get back to you with a tailored quotation. Your reference number is ${ref}.`,
  },
  pl: {
    hello: (name) => `Dzień dobry ${name},`,
    regards: "Pozdrawiamy\nZespół Fiduxa",
    regardsHtml: "Pozdrawiamy<br/>Zespół Fiduxa",
    reference: "Numer rezerwacji",
    service: "Usługa",
    appointment: "Termin",
    address: "Adres",
    duration: "Czas trwania",
    hours: (h) => `${h} godz.`,
    amount: "Kwota",
    paid: "zapłacono",
    invoice: "Fakturę otrzymasz e-mailem.",
    confirmedSubject: (ref) => `Twoje sprzątanie zostało potwierdzone – ${ref}`,
    confirmedTitle: "Twoje sprzątanie zostało potwierdzone",
    confirmedIntro: "dziękujemy za rezerwację. Oto szczegóły terminu:",
    manage: "Rezerwację możesz w każdej chwili sprawdzić na swoim koncie Fiduxa lub anulować do 24 godzin przed terminem.",
    statusSubject: (ref) => `Rezerwacja ${ref} – zmiana statusu`,
    statusTitle: "Status Twojej rezerwacji się zmienił",
    status: {
      cancelled: "Twoja rezerwacja została anulowana.",
      completed: "Sprzątanie zostało zakończone. Dziękujemy!",
      expired: "Twoja rezerwacja wygasła, ponieważ płatność nie została dokończona.",
    },
    refundNote: "Zapłacona kwota zostanie zwrócona na Twoją pierwotną metodę płatności.",
    resetSubject: "Resetowanie hasła – Fiduxa",
    resetTitle: "Resetowanie hasła",
    resetBody: "Poprosiłeś(-aś) o zresetowanie hasła. Link jest ważny przez 30 minut.",
    resetButton: "Ustaw nowe hasło",
    resetIgnore: "Jeśli to nie Ty, zignoruj tę wiadomość.",
    inviteSubject: "Zaproszenie do zespołu sprzątającego Fiduxa",
    inviteTitle: "Witamy w Fiduxa",
    inviteBody: "Zostałeś(-aś) zaproszony(-a) do naszego zespołu sprzątającego.",
    inviteButton: "Załóż konto",
    inviteExpiry: "Zaproszenie jest ważne przez 24 godziny.",
    jobNewSubject: (date) => `Nowe zlecenie dostępne – ${date}`,
    jobNewTitle: "Nowe zlecenie dostępne",
    jobNewBody: "Nowe zlecenie sprzątania pasuje do Twojego kalendarza. Kto pierwszy przyjmie, ten je otrzyma.",
    jobNewButton: "Zobacz otwarte zlecenia",
    jobAssignedSubject: (ref) => `Przydzielono Ci zlecenie – ${ref}`,
    jobAssignedTitle: "Nowe zlecenie dla Ciebie",
    jobAssignedBody: "Biuro przydzieliło Ci zlecenie. Wszystkie szczegóły znajdziesz w portalu.",
    jobButton: "Otwórz zlecenie",
    postcode: "Kod pocztowy",
    cleanerAssignedSubject: (ref) => `Twoja osoba sprzątająca jest już znana – ${ref}`,
    cleanerAssignedTitle: "Twoja osoba sprzątająca jest już znana",
    cleanerAssignedBody: (name) => `${name} zajmie się Twoim sprzątaniem.`,
    onTheWaySubject: (ref) => `Osoba sprzątająca jest w drodze – ${ref}`,
    onTheWayTitle: "Osoba sprzątająca jest w drodze",
    onTheWayBody: (name) => `${name} jest w drodze do Ciebie.`,
    b2bSubject: (ref) => `Twoje zapytanie ofertowe ${ref} – Fiduxa`,
    b2bTitle: "Dziękujemy za zapytanie",
    b2bBody: (ref) =>
      `Sprawdzamy Twoje dane i wkrótce prześlemy indywidualną ofertę. Twój numer referencyjny to ${ref}.`,
  },
};

const PRICE_LABELS = {
  de: { discount: (code) => (code ? `Rabatt (${code})` : "Rabatt"), giftCard: "Gutschein", cash: "Bar nach der Reinigung", vat: (p) => `enthaltene MwSt. (${p} %)` },
  en: { discount: (code) => (code ? `Discount (${code})` : "Discount"), giftCard: "Gift card", cash: "Cash after the cleaning", vat: (p) => `incl. VAT (${p}%)` },
  pl: { discount: (code) => (code ? `Rabat (${code})` : "Rabat"), giftCard: "Karta podarunkowa", cash: "Gotówka po sprzątaniu", vat: (p) => `zawarty VAT (${p}%)` },
};

const formatMoney = (cents, locale) =>
  new Intl.NumberFormat(LOCALES[lang(locale)], { style: "currency", currency: "EUR" }).format(
    cents / 100
  );

const formatDay = (date, locale) =>
  new Date(date).toLocaleDateString(LOCALES[lang(locale)], {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

// Shared branded wrapper. `bodyHtml` must already be escaped.
const layout = (title, bodyHtml, regardsHtml) => `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#24312B">
    <h2 style="color:#174D3A">${escapeHtml(title)}</h2>
    ${bodyHtml}
    <p style="margin-top:24px">${regardsHtml}</p>
  </div>
`;

const button = (url, label) => `
  <a href="${escapeHtml(url)}"
    style="display:inline-block;background:#174D3A;color:#ffffff;padding:14px 24px;text-decoration:none;border-radius:10px;font-weight:bold">
    ${escapeHtml(label)}
  </a>
`;

const detailRows = (rows) =>
  `<table style="border-collapse:collapse;margin:16px 0">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#65736B">${escapeHtml(label)}</td><td style="padding:4px 0"><strong>${escapeHtml(value)}</strong></td></tr>`
    )
    .join("")}</table>`;

// ---------------------------------------------------------------------------
// Customer: booking confirmed (after payment, or immediately in invoice mode)
// ---------------------------------------------------------------------------
export const sendBookingConfirmedEmail = async ({ booking, paid }) => {
  const l = lang(booking.locale);
  const t = T[l];
  const rows = [
    [t.reference, booking.reference],
    [t.service, SERVICE_NAMES[l][booking.serviceId] ?? booking.serviceId],
    [t.appointment, `${formatDay(booking.preferredDate, l)}, ${slotLabel(booking.slot, booking.slotEnd)}`],
    [t.address, `${booking.customerDetails.address}, ${booking.customerDetails.postcode} Berlin`],
    [t.duration, t.hours((booking.estimate?.durationMinutes ?? 0) / 60)],
    // Price breakdown: promotion and gift cards (bookings created with the quote engine)
    ...(booking.pricing?.promotionDiscountCents
      ? [[PRICE_LABELS[l].discount(booking.pricing.promotion?.code), `−${formatMoney(booking.pricing.promotionDiscountCents, l)}`]]
      : []),
    ...(booking.pricing?.giftCardCents
      ? [[PRICE_LABELS[l].giftCard, `−${formatMoney(booking.pricing.giftCardCents, l)}`]]
      : []),
    [
      booking.payment?.method === "cash" ? PRICE_LABELS[l].cash : t.amount,
      `${formatMoney(booking.payment?.amountCents ?? booking.estimate?.totalCents ?? 0, l)}${paid ? ` (${t.paid})` : ""}`,
    ],
    ...(booking.pricing?.vatCents
      ? [[PRICE_LABELS[l].vat(Math.round((booking.pricing.vatRate ?? 0) * 100)), formatMoney(booking.pricing.vatCents, l)]]
      : []),
  ];

  return send({
    to: booking.customerDetails.email,
    subject: t.confirmedSubject(booking.reference),
    text: `${t.hello(booking.customerDetails.name)}

${t.confirmedIntro}

${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}
${paid ? "" : `\n${t.invoice}\n`}
${t.manage}

${t.regards}`,
    html: layout(
      t.confirmedTitle,
      `<p>${escapeHtml(t.hello(booking.customerDetails.name))}</p>
       <p>${escapeHtml(t.confirmedIntro)}</p>
       ${detailRows(rows)}
       ${paid ? "" : `<p>${escapeHtml(t.invoice)}</p>`}
       <p style="color:#65736B;font-size:13px">${escapeHtml(t.manage)}</p>`,
      t.regardsHtml
    ),
  });
};

// ---------------------------------------------------------------------------
// Customer: status update (cancelled / completed / expired)
// ---------------------------------------------------------------------------
export const sendBookingStatusEmail = async ({ booking, status, refund = false }) => {
  const l = lang(booking.locale);
  const t = T[l];
  const statusText = t.status[status];
  if (!statusText) return null;

  const appointment = `${formatDay(booking.preferredDate, l)}, ${slotLabel(booking.slot, booking.slotEnd)}`;
  // Completed jobs: invite the customer to rate the cleaner
  const reviewUrl = status === "completed" && booking.assignedWorker ? `${siteUrl()}/konto/buchungen/${booking._id}#bewertung` : null;
  const x = X[l];

  return send({
    to: booking.customerDetails.email,
    subject: t.statusSubject(booking.reference),
    text: `${t.hello(booking.customerDetails.name)}

${statusText}
${refund ? `${t.refundNote}\n` : ""}
${t.reference}: ${booking.reference}
${t.appointment}: ${appointment}
${reviewUrl ? `\n${x.reviewInvite}\n${reviewUrl}\n` : ""}
${t.regards}`,
    html: layout(
      t.statusTitle,
      `<p>${escapeHtml(t.hello(booking.customerDetails.name))}</p>
       <p>${escapeHtml(statusText)}</p>
       ${refund ? `<p>${escapeHtml(t.refundNote)}</p>` : ""}
       ${detailRows([
         [t.reference, booking.reference],
         [t.appointment, appointment],
       ])}
       ${reviewUrl ? `<p>${escapeHtml(x.reviewInvite)}</p>${button(reviewUrl, x.reviewButton)}` : ""}`,
      t.regardsHtml
    ),
  });
};

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------
export const sendPasswordResetEmail = async ({ to, name, resetUrl, locale }) => {
  const t = T[lang(locale)];
  return send({
    to,
    subject: t.resetSubject,
    text: `${t.hello(name)}

${t.resetBody}
${resetUrl}

${t.resetIgnore}

${t.regards}`,
    html: layout(
      t.resetTitle,
      `<p>${escapeHtml(t.hello(name))}</p>
       <p>${escapeHtml(t.resetBody)}</p>
       ${button(resetUrl, t.resetButton)}
       <p style="font-size:13px;color:#65736B">${escapeHtml(t.resetIgnore)}</p>`,
      t.regardsHtml
    ),
  });
};

// ---------------------------------------------------------------------------
// Worker invitation
// ---------------------------------------------------------------------------
export const sendWorkerInvitationEmail = async ({ to, name, invitationUrl, locale }) => {
  const t = T[lang(locale)];
  return send({
    to,
    subject: t.inviteSubject,
    text: `${t.hello(name || "")}

${t.inviteBody}
${invitationUrl}

${t.inviteExpiry}

${t.regards}`,
    html: layout(
      t.inviteTitle,
      `<p>${escapeHtml(t.hello(name || ""))}</p>
       <p>${escapeHtml(t.inviteBody)}</p>
       ${button(invitationUrl, t.inviteButton)}
       <p style="font-size:13px;color:#65736B">${escapeHtml(t.inviteExpiry)}</p>`,
      t.regardsHtml
    ),
  });
};

// ---------------------------------------------------------------------------
// Business request received
// ---------------------------------------------------------------------------
export const sendBusinessRequestReceivedEmail = async ({ to, contactPerson, reference, locale }) => {
  const t = T[lang(locale)];
  return send({
    to,
    subject: t.b2bSubject(reference),
    text: `${t.hello(contactPerson)}

${t.b2bBody(reference)}

${t.regards}`,
    html: layout(
      t.b2bTitle,
      `<p>${escapeHtml(t.hello(contactPerson))}</p>
       <p>${escapeHtml(t.b2bBody(reference))}</p>`,
      t.regardsHtml
    ),
  });
};

// ---------------------------------------------------------------------------
// Cleaner: new open job / job assigned by the office
// ---------------------------------------------------------------------------
const jobRows = (booking, t, l) => [
  [t.service, SERVICE_NAMES[l][booking.serviceId] ?? booking.serviceId],
  [t.appointment, `${formatDay(booking.preferredDate, l)}, ${slotLabel(booking.slot, booking.slotEnd)}`],
  [t.duration, t.hours((booking.estimate?.durationMinutes ?? 0) / 60)],
  [t.postcode, `${booking.customerDetails.postcode} Berlin`],
];

const portalUrl = (path = "") => `${getSiteUrl()}/worker${path}`;

export const sendNewJobAvailableEmail = async ({ worker, booking }) => {
  const l = lang(worker.preferredLanguage);
  const t = T[l];
  const rows = jobRows(booking, t, l);
  const url = portalUrl();
  return send({
    to: worker.email,
    subject: t.jobNewSubject(formatDay(booking.preferredDate, l)),
    text: `${t.hello(worker.name)}

${t.jobNewBody}

${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}

${url}

${t.regards}`,
    html: layout(
      t.jobNewTitle,
      `<p>${escapeHtml(t.hello(worker.name))}</p>
       <p>${escapeHtml(t.jobNewBody)}</p>
       ${detailRows(rows)}
       ${button(url, t.jobNewButton)}`,
      t.regardsHtml
    ),
  });
};

export const sendJobAssignedToWorkerEmail = async ({ worker, booking }) => {
  const l = lang(worker.preferredLanguage);
  const t = T[l];
  const rows = [[t.reference, booking.reference], ...jobRows(booking, t, l)];
  const url = portalUrl(`/jobs/${booking._id}`);
  return send({
    to: worker.email,
    subject: t.jobAssignedSubject(booking.reference),
    text: `${t.hello(worker.name)}

${t.jobAssignedBody}

${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}

${url}

${t.regards}`,
    html: layout(
      t.jobAssignedTitle,
      `<p>${escapeHtml(t.hello(worker.name))}</p>
       <p>${escapeHtml(t.jobAssignedBody)}</p>
       ${detailRows(rows)}
       ${button(url, t.jobButton)}`,
      t.regardsHtml
    ),
  });
};

// ---------------------------------------------------------------------------
// Customer: cleaner assigned / on the way (first name only)
// ---------------------------------------------------------------------------
const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "Fiduxa";

export const sendCleanerAssignedEmail = async ({ booking, workerName }) => {
  const l = lang(booking.locale);
  const t = T[l];
  const rows = [
    [t.reference, booking.reference],
    [t.appointment, `${formatDay(booking.preferredDate, l)}, ${slotLabel(booking.slot, booking.slotEnd)}`],
  ];
  const body = t.cleanerAssignedBody(firstName(workerName));
  return send({
    to: booking.customerDetails.email,
    subject: t.cleanerAssignedSubject(booking.reference),
    text: `${t.hello(booking.customerDetails.name)}

${body}

${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}

${t.regards}`,
    html: layout(
      t.cleanerAssignedTitle,
      `<p>${escapeHtml(t.hello(booking.customerDetails.name))}</p>
       <p>${escapeHtml(body)}</p>
       ${detailRows(rows)}`,
      t.regardsHtml
    ),
  });
};

export const sendCleanerOnTheWayEmail = async ({ booking, workerName }) => {
  const l = lang(booking.locale);
  const t = T[l];
  const body = t.onTheWayBody(firstName(workerName));
  return send({
    to: booking.customerDetails.email,
    subject: t.onTheWaySubject(booking.reference),
    text: `${t.hello(booking.customerDetails.name)}

${body}

${t.regards}`,
    html: layout(
      t.onTheWayTitle,
      `<p>${escapeHtml(t.hello(booking.customerDetails.name))}</p>
       <p>${escapeHtml(body)}</p>`,
      t.regardsHtml
    ),
  });
};

// ---------------------------------------------------------------------------
// Internal admin notification (German)
// ---------------------------------------------------------------------------
export const sendAdminNotificationEmail = async ({ subject, lines }) => {
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!to) return null;

  return send({
    to,
    subject: `[Fiduxa] ${subject}`,
    text: lines.join("\n"),
    html: layout(subject, `<p>${lines.map(escapeHtml).join("<br/>")}</p>`, "Fiduxa System"),
  });
};

// ---------------------------------------------------------------------------
// Booking messages, reviews, cleaner payouts
// ---------------------------------------------------------------------------
const siteUrl = () => getSiteUrl();

const X = {
  de: {
    reviewInvite: "Wie war deine Reinigung? Deine Bewertung hilft anderen Kundinnen und Kunden und motiviert unser Team.",
    reviewButton: "Jetzt bewerten",
    messageSubject: (ref) => `Neue Nachricht zu Buchung ${ref}`,
    messageTitle: "Neue Nachricht",
    messageBody: (author) => `${author} hat eine Nachricht zu deiner Buchung geschrieben:`,
    messageButton: "Nachricht ansehen und antworten",
    office: "Das Fiduxa-Team",
    customer: "Deine Kundin / dein Kunde",
    payoutSubject: (ref) => `Auszahlung ${ref} ist unterwegs`,
    payoutTitle: "Deine Auszahlung ist unterwegs",
    payoutBody: (amount, last4) => `Wir haben ${amount} auf dein Konto mit Endung ${last4 || "–"} überwiesen. Je nach Bank dauert die Gutschrift 1–2 Werktage.`,
    payoutJobs: "Aufträge",
    payoutButton: "Verdienst ansehen",
  },
  en: {
    reviewInvite: "How was your cleaning? Your rating helps other customers and motivates our team.",
    reviewButton: "Rate now",
    messageSubject: (ref) => `New message about booking ${ref}`,
    messageTitle: "New message",
    messageBody: (author) => `${author} wrote a message about your booking:`,
    messageButton: "View and reply",
    office: "The Fiduxa team",
    customer: "Your customer",
    payoutSubject: (ref) => `Payout ${ref} is on its way`,
    payoutTitle: "Your payout is on its way",
    payoutBody: (amount, last4) => `We have transferred ${amount} to your account ending in ${last4 || "–"}. Depending on your bank it arrives within 1–2 working days.`,
    payoutJobs: "Jobs",
    payoutButton: "View earnings",
  },
  pl: {
    reviewInvite: "Jak przebiegło sprzątanie? Twoja ocena pomaga innym klientom i motywuje nasz zespół.",
    reviewButton: "Oceń teraz",
    messageSubject: (ref) => `Nowa wiadomość dotycząca rezerwacji ${ref}`,
    messageTitle: "Nowa wiadomość",
    messageBody: (author) => `${author} napisał(a) wiadomość dotyczącą Twojej rezerwacji:`,
    messageButton: "Zobacz i odpowiedz",
    office: "Zespół Fiduxa",
    customer: "Twój klient",
    payoutSubject: (ref) => `Wypłata ${ref} jest w drodze`,
    payoutTitle: "Twoja wypłata jest w drodze",
    payoutBody: (amount, last4) => `Przelaliśmy ${amount} na Twoje konto kończące się na ${last4 || "–"}. W zależności od banku środki dotrą w ciągu 1–2 dni roboczych.`,
    payoutJobs: "Zlecenia",
    payoutButton: "Zobacz zarobki",
  },
};

/**
 * Notify a customer or cleaner about a new booking message.
 * authorKind: "office" | "customer" | "cleaner" (cleaner → first name shown)
 */
export const sendNewMessageEmail = async ({ to, name, locale, booking, authorKind, authorName, body, path }) => {
  const l = lang(locale);
  const t = T[l];
  const x = X[l];
  const author = authorKind === "office" ? x.office : authorKind === "customer" ? x.customer : firstName(authorName);
  const url = `${siteUrl()}${path}`;
  const excerpt = body.length > 500 ? `${body.slice(0, 500)}…` : body;
  return send({
    to,
    subject: x.messageSubject(booking.reference),
    text: `${t.hello(name)}

${x.messageBody(author)}

"${excerpt}"

${url}

${t.regards}`,
    html: layout(
      x.messageTitle,
      `<p>${escapeHtml(t.hello(name))}</p>
       <p>${escapeHtml(x.messageBody(author))}</p>
       <blockquote style="margin:16px 0;padding:12px 16px;background:#F3F6F2;border-left:4px solid #174D3A;white-space:pre-wrap">${escapeHtml(excerpt)}</blockquote>
       ${button(url, x.messageButton)}`,
      t.regardsHtml
    ),
  });
};

export const sendPayoutEmail = async ({ worker, payout }) => {
  const l = lang(worker.preferredLanguage);
  const t = T[l];
  const x = X[l];
  const amount = formatMoney(payout.amountCents, l);
  const url = `${siteUrl()}/worker/verdienst`;
  const rows = [
    ["Ref.", payout.reference],
    [t.amount, amount],
    [x.payoutJobs, String(payout.bookings.length)],
  ];
  return send({
    to: worker.email,
    subject: x.payoutSubject(payout.reference),
    text: `${t.hello(worker.name)}

${x.payoutBody(amount, payout.bankAccountLast4)}

${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}

${url}

${t.regards}`,
    html: layout(
      x.payoutTitle,
      `<p>${escapeHtml(t.hello(worker.name))}</p>
       <p>${escapeHtml(x.payoutBody(amount, payout.bankAccountLast4))}</p>
       ${detailRows(rows)}
       ${button(url, x.payoutButton)}`,
      t.regardsHtml
    ),
  });
};

// ---------------------------------------------------------------------------
// New admin: set-password link
// ---------------------------------------------------------------------------
const ADMIN_INVITE = {
  de: {
    subject: "Du wurdest als Administrator bei Fiduxa hinzugefügt",
    title: "Willkommen im Fiduxa-Admin",
    body: (by) => `${by} hat dich als Administrator hinzugefügt. Lege jetzt dein Passwort fest. Der Link ist 48 Stunden gültig.`,
    button: "Passwort festlegen",
  },
  en: {
    subject: "You have been added as a Fiduxa administrator",
    title: "Welcome to the Fiduxa admin",
    body: (by) => `${by} added you as an administrator. Please set your password now. The link is valid for 48 hours.`,
    button: "Set password",
  },
  pl: {
    subject: "Dodano Cię jako administratora Fiduxa",
    title: "Witamy w panelu Fiduxa",
    body: (by) => `${by} dodał(a) Cię jako administratora. Ustaw teraz swoje hasło. Link jest ważny 48 godzin.`,
    button: "Ustaw hasło",
  },
};

export const sendAdminInviteEmail = async ({ to, name, url, invitedBy, locale }) => {
  const l = lang(locale);
  const t = T[l];
  const x = ADMIN_INVITE[l];
  return send({
    to,
    subject: x.subject,
    text: `${t.hello(name)}

${x.body(invitedBy)}
${url}

${t.regards}`,
    html: layout(
      x.title,
      `<p>${escapeHtml(t.hello(name))}</p>
       <p>${escapeHtml(x.body(invitedBy))}</p>
       ${button(url, x.button)}`,
      t.regardsHtml
    ),
  });
};

// ---------------------------------------------------------------------------
// Email verification (customers) + welcome offer
// ---------------------------------------------------------------------------
const VERIFY = {
  de: {
    subject: "Bitte bestätige deine E-Mail-Adresse – Fiduxa",
    title: "E-Mail-Adresse bestätigen",
    body: "Bitte bestätige deine E-Mail-Adresse, damit wir dich zuverlässig über deine Buchungen informieren können. Der Link ist 24 Stunden gültig.",
    offer: (pct) => `Danach erhältst du automatisch ${pct} % Rabatt auf deine erste Reinigung.`,
    button: "E-Mail-Adresse bestätigen",
    welcomeSubject: (pct) => `Willkommen bei Fiduxa – ${pct} % auf deine erste Reinigung`,
    welcomeTitle: "Willkommen bei Fiduxa!",
    welcomeBody: (pct) => `Deine E-Mail-Adresse ist bestätigt. Dein Willkommensrabatt von ${pct} % wird bei deiner ersten Buchung automatisch abgezogen – ganz ohne Code.`,
    welcomeButton: "Jetzt Reinigung buchen",
  },
  en: {
    subject: "Please confirm your email address – Fiduxa",
    title: "Confirm your email address",
    body: "Please confirm your email address so we can keep you updated about your bookings. The link is valid for 24 hours.",
    offer: (pct) => `After that you automatically get ${pct}% off your first cleaning.`,
    button: "Confirm email address",
    welcomeSubject: (pct) => `Welcome to Fiduxa – ${pct}% off your first cleaning`,
    welcomeTitle: "Welcome to Fiduxa!",
    welcomeBody: (pct) => `Your email address is confirmed. Your ${pct}% welcome discount is applied automatically to your first booking – no code needed.`,
    welcomeButton: "Book a cleaning",
  },
  pl: {
    subject: "Potwierdź swój adres e-mail – Fiduxa",
    title: "Potwierdź adres e-mail",
    body: "Potwierdź swój adres e-mail, abyśmy mogli informować Cię o rezerwacjach. Link jest ważny 24 godziny.",
    offer: (pct) => `Następnie automatycznie otrzymasz ${pct}% zniżki na pierwsze sprzątanie.`,
    button: "Potwierdź adres e-mail",
    welcomeSubject: (pct) => `Witamy w Fiduxa – ${pct}% zniżki na pierwsze sprzątanie`,
    welcomeTitle: "Witamy w Fiduxa!",
    welcomeBody: (pct) => `Twój adres e-mail jest potwierdzony. Zniżka powitalna ${pct}% zostanie automatycznie odjęta przy pierwszej rezerwacji – bez kodu.`,
    welcomeButton: "Zarezerwuj sprzątanie",
  },
};

export const sendEmailVerificationEmail = async ({ to, name, url, locale, welcomePercent }) => {
  const l = lang(locale);
  const t = T[l];
  const v = VERIFY[l];
  const offer = welcomePercent ? v.offer(welcomePercent) : "";
  return send({
    to,
    subject: v.subject,
    text: `${t.hello(name)}\n\n${v.body}\n${offer}\n\n${url}\n\n${t.regards}`,
    html: layout(
      v.title,
      `<p>${escapeHtml(t.hello(name))}</p>
       <p>${escapeHtml(v.body)}</p>
       ${offer ? `<p><strong>${escapeHtml(offer)}</strong></p>` : ""}
       ${button(url, v.button)}`,
      t.regardsHtml
    ),
  });
};

export const sendWelcomeOfferEmail = async ({ to, name, locale, percent }) => {
  const l = lang(locale);
  const t = T[l];
  const v = VERIFY[l];
  const url = `${getSiteUrl()}/buchung`;
  return send({
    to,
    subject: v.welcomeSubject(percent),
    text: `${t.hello(name)}\n\n${v.welcomeBody(percent)}\n\n${url}\n\n${t.regards}`,
    html: layout(
      v.welcomeTitle,
      `<p>${escapeHtml(t.hello(name))}</p>
       <p>${escapeHtml(v.welcomeBody(percent))}</p>
       ${button(url, v.welcomeButton)}`,
      t.regardsHtml
    ),
  });
};

// ---------------------------------------------------------------------------
// Gift cards
// ---------------------------------------------------------------------------
const GIFT = {
  de: {
    recipientSubject: (from) => `${from} schenkt dir eine Reinigung – dein Fiduxa-Gutschein`,
    recipientTitle: "Du hast einen Fiduxa-Gutschein erhalten!",
    recipientIntro: (from, amount) => `${from} schenkt dir einen Fiduxa-Gutschein über ${amount} – für ein wunderbar sauberes Zuhause.`,
    code: "Gutscheincode",
    value: "Wert",
    validUntil: "Gültig bis",
    howTo: "So löst du ihn ein: Reinigung auf fiduxa.de buchen und den Code im Bezahlschritt eingeben. Ein Restguthaben bleibt erhalten.",
    redeem: "Jetzt Reinigung buchen",
    buyerSubject: (amount) => `Dein Fiduxa-Gutschein über ${amount} ist bezahlt`,
    buyerTitle: "Vielen Dank für deinen Gutschein-Kauf!",
    buyerSent: (name) => `Wir haben den Gutschein an ${name} geschickt.`,
    buyerScheduled: (name, date) => `Wir schicken den Gutschein am ${date} an ${name}.`,
    buyerSelf: "Hier ist dein Gutschein:",
    message: "Persönliche Nachricht",
    note: "Gutscheine sind Mehrzweck-Gutscheine. Die Umsatzsteuer fällt erst bei der Einlösung an.",
  },
  en: {
    recipientSubject: (from) => `${from} has given you a cleaning – your Fiduxa gift card`,
    recipientTitle: "You received a Fiduxa gift card!",
    recipientIntro: (from, amount) => `${from} gives you a Fiduxa gift card worth ${amount} – for a beautifully clean home.`,
    code: "Gift card code",
    value: "Value",
    validUntil: "Valid until",
    howTo: "How to redeem: book a cleaning on fiduxa.de and enter the code at checkout. Any remaining balance stays on the card.",
    redeem: "Book a cleaning",
    buyerSubject: (amount) => `Your Fiduxa gift card worth ${amount} is paid`,
    buyerTitle: "Thank you for buying a gift card!",
    buyerSent: (name) => `We have sent the gift card to ${name}.`,
    buyerScheduled: (name, date) => `We will send the gift card to ${name} on ${date}.`,
    buyerSelf: "Here is your gift card:",
    message: "Personal message",
    note: "Gift cards are multi-purpose vouchers. VAT is charged when the card is redeemed.",
  },
  pl: {
    recipientSubject: (from) => `${from} podarował(a) Ci sprzątanie – Twoja karta podarunkowa Fiduxa`,
    recipientTitle: "Otrzymałeś(-aś) kartę podarunkową Fiduxa!",
    recipientIntro: (from, amount) => `${from} podarował(a) Ci kartę podarunkową Fiduxa o wartości ${amount} – na pięknie czysty dom.`,
    code: "Kod karty",
    value: "Wartość",
    validUntil: "Ważna do",
    howTo: "Jak wykorzystać: zarezerwuj sprzątanie na fiduxa.de i wpisz kod przy płatności. Pozostałe saldo zostaje na karcie.",
    redeem: "Zarezerwuj sprzątanie",
    buyerSubject: (amount) => `Twoja karta podarunkowa Fiduxa o wartości ${amount} została opłacona`,
    buyerTitle: "Dziękujemy za zakup karty podarunkowej!",
    buyerSent: (name) => `Wysłaliśmy kartę do: ${name}.`,
    buyerScheduled: (name, date) => `Wyślemy kartę do: ${name} w dniu ${date}.`,
    buyerSelf: "Oto Twoja karta podarunkowa:",
    message: "Wiadomość osobista",
    note: "Karty podarunkowe są bonami różnego przeznaczenia. VAT jest naliczany przy realizacji.",
  },
};

const giftCardBlock = (card, l, g) => `
  <div style="margin:20px 0;padding:24px;border-radius:16px;background:#174D3A;color:#ffffff;font-family:Arial,sans-serif">
    <div style="font-size:14px;letter-spacing:2px;opacity:.8">FIDUXA · GUTSCHEIN</div>
    <div style="font-size:36px;font-weight:bold;margin:12px 0">${escapeHtml(formatMoney(card.initialCents, l))}</div>
    <div style="font-size:13px;opacity:.8">${escapeHtml(g.code)}</div>
    <div style="font-size:22px;font-weight:bold;letter-spacing:2px;font-family:monospace">${escapeHtml(card.code)}</div>
    ${card.expiresAt ? `<div style="font-size:12px;margin-top:10px;opacity:.8">${escapeHtml(g.validUntil)}: ${escapeHtml(new Date(card.expiresAt).toLocaleDateString(LOCALES[l], { timeZone: "Europe/Berlin" }))}</div>` : ""}
  </div>`;

export const sendGiftCardEmail = async (card) => {
  const l = lang(card.locale);
  const t = T[l];
  const g = GIFT[l];
  const from = card.senderName || "Fiduxa";
  const amount = formatMoney(card.initialCents, l);
  const url = `${getSiteUrl()}/buchung`;
  return send({
    to: card.recipientEmail,
    subject: g.recipientSubject(from),
    text: `${t.hello(card.recipientName)}\n\n${g.recipientIntro(from, amount)}\n${card.message ? `\n${g.message}: "${card.message}"\n` : ""}\n${g.code}: ${card.code}\n${g.value}: ${amount}\n\n${g.howTo}\n${url}\n\n${t.regards}`,
    html: layout(
      g.recipientTitle,
      `<p>${escapeHtml(t.hello(card.recipientName))}</p>
       <p>${escapeHtml(g.recipientIntro(from, amount))}</p>
       ${card.message ? `<blockquote style="margin:16px 0;padding:12px 16px;background:#F3F6F2;border-left:4px solid #174D3A;white-space:pre-wrap">${escapeHtml(card.message)}</blockquote>` : ""}
       ${giftCardBlock(card, l, g)}
       <p>${escapeHtml(g.howTo)}</p>
       ${button(url, g.redeem)}`,
      t.regardsHtml
    ),
  });
};

export const sendGiftCardPurchaseEmail = async ({ card, to, name, delivered }) => {
  const l = lang(card.locale);
  const t = T[l];
  const g = GIFT[l];
  const amount = formatMoney(card.initialCents, l);
  const self = card.recipientEmail === to;
  const status = self
    ? g.buyerSelf
    : delivered
      ? g.buyerSent(card.recipientName)
      : g.buyerScheduled(card.recipientName, new Date(card.deliverAt).toLocaleDateString(LOCALES[l], { timeZone: "Europe/Berlin" }));
  return send({
    to,
    subject: g.buyerSubject(amount),
    text: `${t.hello(name)}\n\n${status}\n\n${g.code}: ${card.code}\n${g.value}: ${amount}\n\n${g.note}\n\n${t.regards}`,
    html: layout(
      g.buyerTitle,
      `<p>${escapeHtml(t.hello(name))}</p>
       <p>${escapeHtml(status)}</p>
       ${giftCardBlock(card, l, g)}
       <p style="font-size:12px;color:#65736B">${escapeHtml(g.note)}</p>`,
      t.regardsHtml
    ),
  });
};
