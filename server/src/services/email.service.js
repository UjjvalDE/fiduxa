import nodemailer from "nodemailer";
import { escapeHtml, slotLabel } from "../utils/helpers.js";
import { getSiteUrl } from "../utils/site-url.js";
import EmailMessage from "../models/email.model.js";
import { logger } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const createTransporter = () => {
  // Automated tests only: render mails without sending (never in production)
  if (process.env.NODE_ENV === "test" && process.env.EMAIL_TRANSPORT === "json") {
    return nodemailer.createTransport({ jsonTransport: true });
  }
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

const BOOKING_REF = /FID-\d{4}-\d{5}/;
// Retry schedule after a failed delivery (minutes); the 5th failure is final.
const RETRY_MINUTES = [1, 5, 30, 120];
export const MAX_EMAIL_ATTEMPTS = 5;

/**
 * Deliver ONE outbox record. Claims it atomically (nextAttemptAt pushed into
 * the future) so the API process and the worker never send the same mail
 * twice. Never throws – the outcome is stored on the record.
 * Returns "sent" | "queued" (retry scheduled) | "failed" | "skipped".
 */
export const deliverEmail = async (record) => {
  const claimed = await EmailMessage.findOneAndUpdate(
    { _id: record._id, status: "queued", nextAttemptAt: { $lte: new Date() } },
    { $set: { nextAttemptAt: new Date(Date.now() + 2 * 60_000) } },
    { returnDocument: "after" }
  );
  if (!claimed) return "skipped";

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: claimed.to,
      subject: claimed.subject,
      text: claimed.text,
      html: claimed.html,
      ...(claimed.attachments?.length && {
        attachments: claimed.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, content: a.content })),
      }),
    });
    claimed.status = "sent";
    claimed.sentAt = new Date();
    claimed.attempts += 1;
    claimed.lastError = "";
    claimed.providerMessageId = String(info?.messageId || "");
    await claimed.save();
    return "sent";
  } catch (error) {
    claimed.attempts += 1;
    claimed.lastError = String(error?.message || error).slice(0, 1000);
    if (claimed.attempts >= MAX_EMAIL_ATTEMPTS) {
      claimed.status = "failed";
    } else {
      const minutes = RETRY_MINUTES[Math.min(claimed.attempts - 1, RETRY_MINUTES.length - 1)];
      claimed.nextAttemptAt = new Date(Date.now() + minutes * 60_000);
    }
    await claimed.save();
    logger.warn(
      { emailId: String(claimed._id), to: claimed.to, attempts: claimed.attempts, err: claimed.lastError },
      claimed.status === "failed" ? "E-mail delivery failed permanently" : "E-mail delivery failed – retry scheduled"
    );
    return claimed.status === "failed" ? "failed" : "queued";
  }
};

/**
 * Enqueue a mail in the outbox and try to deliver it right away. A transport
 * failure does NOT throw – the worker retries with exponential backoff.
 * Resolves with { id, status } ("sent" | "queued" | "failed").
 */
const send = async ({ to, subject, text, html, template = "", bookingRef = "", attachments }) => {
  if (!to) throw new Error("E-mail without recipient");
  const ref = bookingRef || `${subject} ${text}`.match(BOOKING_REF)?.[0] || "";
  const record = await EmailMessage.create({
    to,
    subject,
    text,
    html,
    template,
    bookingRef: ref,
    // Optional [{ filename, contentType, content: Buffer }] (e.g. invoice PDF)
    ...(attachments?.length && { attachments }),
  });
  const status = await deliverEmail(record);
  return { id: record._id, status };
};

/** Outbox job: deliver every due queued mail (oldest first). */
export const processEmailOutbox = async ({ limit = 50 } = {}) => {
  const due = await EmailMessage.find({ status: "queued", nextAttemptAt: { $lte: new Date() } })
    .sort({ nextAttemptAt: 1 })
    .limit(limit);
  const result = { sent: 0, queued: 0, failed: 0, skipped: 0 };
  for (const record of due) result[await deliverEmail(record)] += 1;
  return result;
};

/** Admin resend: back to the queue with a fresh attempt budget, then deliver now. */
export const resendEmail = async (record, adminId) => {
  record.status = "queued";
  record.attempts = 0;
  record.lastError = "";
  record.nextAttemptAt = new Date();
  record.resentBy = adminId ?? null;
  record.resentAt = new Date();
  await record.save();
  const status = await deliverEmail(record);
  return { status, record: await EmailMessage.findById(record._id) };
};

// Fire-and-report helper: returns "sent" | "failed" instead of throwing.
// "sent" includes "queued for retry" – the outbox guarantees delivery attempts.
export const trySend = async (label, fn) => {
  try {
    const result = await fn();
    return result?.status === "failed" ? "failed" : "sent";
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
    refundNote: "Den gezahlten Betrag erstatten wir Ihnen innerhalb von 7 Werktagen über PayPal.",
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
    delayedSubject: (ref) => `Wir prüfen, wo deine Reinigungskraft bleibt – ${ref}`,
    delayedTitle: "Deine Reinigungskraft verspätet sich",
    delayedBody: "Deine Reinigungskraft hat sich zum geplanten Start noch nicht gemeldet. Wir prüfen gerade, wo sie bleibt, und melden uns bei dir, sobald wir mehr wissen. Entschuldige bitte die Unannehmlichkeiten.",
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
    refundNote: "The amount paid will be refunded to you via PayPal within 7 working days.",
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
    delayedSubject: (ref) => `We are checking where your cleaner is – ${ref}`,
    delayedTitle: "Your cleaner is running late",
    delayedBody: "Your cleaner has not checked in for the planned start yet. We are finding out where they are and will get back to you as soon as we know more. Sorry for the inconvenience.",
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
    refundNote: "Zapłaconą kwotę zwrócimy Ci przez PayPal w ciągu 7 dni roboczych.",
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
    delayedSubject: (ref) => `Sprawdzamy, gdzie jest Twoja osoba sprzątająca – ${ref}`,
    delayedTitle: "Twoja osoba sprzątająca się spóźnia",
    delayedBody: "Twoja osoba sprzątająca nie zgłosiła się jeszcze na zaplanowany start. Właśnie sprawdzamy, gdzie jest, i odezwiemy się, gdy tylko będziemy wiedzieć więcej. Przepraszamy za niedogodności.",
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
export const sendBookingConfirmedEmail = async ({ booking, paid, attachments }) => {
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
    template: "bookingConfirmed",
    attachments,
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
    template: "bookingStatus",
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
// `intro` / `subject` (optional) turn the mail into a "Welcome – set your
// password" variant for accounts created by the office (phone orders).
export const sendPasswordResetEmail = async ({ to, name, resetUrl, locale, intro, subject }) => {
  const t = T[lang(locale)];
  const body = intro || t.resetBody;
  return send({
    template: intro ? "setPassword" : "passwordReset",
    to,
    subject: subject || t.resetSubject,
    text: `${t.hello(name)}

${body}
${resetUrl}

${t.resetIgnore}

${t.regards}`,
    html: layout(
      t.resetTitle,
      `<p>${escapeHtml(t.hello(name))}</p>
       <p>${escapeHtml(body)}</p>
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
    template: "workerInvitation",
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
    template: "businessRequestReceived",
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
    template: "newJobAvailable",
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
    template: "jobAssignedToWorker",
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

/** Cleaner: evening reminder – today's / a past job was not confirmed yet (de/en/pl) */
const CONFIRM_REMINDER = {
  de: {
    subject: (ref) => `Bitte Auftrag bestätigen – ${ref}`,
    title: "Bitte bestätige deinen Auftrag",
    body: "dein Auftrag ist noch nicht als erledigt bestätigt. Bitte bestätige im Portal, dass die Reinigung stattgefunden hat (mit Start- und Endzeit) – oder melde, dass sie nicht stattgefunden hat.",
    button: "Job erledigt bestätigen",
  },
  en: {
    subject: (ref) => `Please confirm your job – ${ref}`,
    title: "Please confirm your job",
    body: "your job has not been confirmed as done yet. Please confirm in the portal that the cleaning took place (with start and end time) – or report that it did not happen.",
    button: "Confirm job done",
  },
  pl: {
    subject: (ref) => `Potwierdź zlecenie – ${ref}`,
    title: "Potwierdź swoje zlecenie",
    body: "Twoje zlecenie nie zostało jeszcze potwierdzone jako wykonane. Potwierdź w portalu, że sprzątanie się odbyło (z godziną rozpoczęcia i zakończenia) – albo zgłoś, że się nie odbyło.",
    button: "Potwierdź wykonanie",
  },
};

export const sendJobConfirmReminderEmail = async ({ worker, booking }) => {
  const l = lang(worker.preferredLanguage);
  const t = T[l];
  const c = CONFIRM_REMINDER[l];
  const rows = [[t.reference, booking.reference], ...jobRows(booking, t, l)];
  const url = portalUrl(`/jobs/${booking._id}`);
  return send({
    template: "jobConfirmReminder",
    bookingRef: booking.reference,
    to: worker.email,
    subject: c.subject(booking.reference),
    text: `${t.hello(worker.name)}

${c.body}

${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}

${url}

${t.regards}`,
    html: layout(
      c.title,
      `<p>${escapeHtml(t.hello(worker.name))}</p>
       <p>${escapeHtml(c.body)}</p>
       ${detailRows(rows)}
       ${button(url, c.button)}`,
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
    template: "cleanerAssigned",
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
    template: "cleanerOnTheWay",
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

/** Customer notice when the no-show watch flags a late cleaner (de/en/pl). */
export const sendCleanerDelayedEmail = async ({ booking }) => {
  const l = lang(booking.locale);
  const t = T[l];
  const rows = [
    [t.reference, booking.reference],
    [t.appointment, `${formatDay(booking.preferredDate, l)}, ${slotLabel(booking.slot, booking.slotEnd)}`],
  ];
  return send({
    template: "cleanerDelayed",
    bookingRef: booking.reference,
    to: booking.customerDetails.email,
    subject: t.delayedSubject(booking.reference),
    text: `${t.hello(booking.customerDetails.name)}

${t.delayedBody}

${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}

${t.regards}`,
    html: layout(
      t.delayedTitle,
      `<p>${escapeHtml(t.hello(booking.customerDetails.name))}</p>
       <p>${escapeHtml(t.delayedBody)}</p>
       ${detailRows(rows)}`,
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
    template: "adminNotification",
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
    payoutBodyPaypal: (amount, email) => `Wir haben ${amount} an dein PayPal-Konto ${email} gesendet. Das Geld ist in der Regel sofort verfügbar.`,
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
    payoutBodyPaypal: (amount, email) => `We have sent ${amount} to your PayPal account ${email}. The money is usually available immediately.`,
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
    payoutBodyPaypal: (amount, email) => `Wysłaliśmy ${amount} na Twoje konto PayPal ${email}. Pieniądze są zwykle dostępne od razu.`,
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
    template: "newMessage",
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
  const body =
    payout.provider === "paypal"
      ? x.payoutBodyPaypal(amount, payout.paypalEmail)
      : x.payoutBody(amount, payout.bankAccountLast4);
  const rows = [
    ["Ref.", payout.reference],
    [t.amount, amount],
    [x.payoutJobs, String(payout.bookings.length)],
  ];
  return send({
    template: "payout",
    to: worker.email,
    subject: x.payoutSubject(payout.reference),
    text: `${t.hello(worker.name)}

${body}

${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}

${url}

${t.regards}`,
    html: layout(
      x.payoutTitle,
      `<p>${escapeHtml(t.hello(worker.name))}</p>
       <p>${escapeHtml(body)}</p>
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
    template: "adminInvite",
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
    offer: (pct) => `Danach schicken wir dir deinen persönlichen Code für ${pct} % Rabatt auf deine erste Reinigung.`,
    button: "E-Mail-Adresse bestätigen",
    welcomeSubject: (pct) => `Willkommen bei Fiduxa – ${pct} % auf deine erste Reinigung`,
    welcomeTitle: "Willkommen bei Fiduxa!",
    welcomeBody: (pct) => `Deine E-Mail-Adresse ist bestätigt. Hier ist dein persönlicher Code für ${pct} % Rabatt auf deine erste Reinigung. Gib ihn bei der Buchung im Feld „Rabattcode“ ein – er gilt nur für dein Konto und einmalig.`,
    codeLabel: "Dein persönlicher Code",
    validUntil: "Gültig bis",
    welcomeButton: "Jetzt Reinigung buchen",
  },
  en: {
    subject: "Please confirm your email address – Fiduxa",
    title: "Confirm your email address",
    body: "Please confirm your email address so we can keep you updated about your bookings. The link is valid for 24 hours.",
    offer: (pct) => `After that we send you your personal code for ${pct}% off your first cleaning.`,
    button: "Confirm email address",
    welcomeSubject: (pct) => `Welcome to Fiduxa – ${pct}% off your first cleaning`,
    welcomeTitle: "Welcome to Fiduxa!",
    welcomeBody: (pct) => `Your email address is confirmed. Here is your personal code for ${pct}% off your first cleaning. Enter it in the "Promo code" field when booking – it only works for your account and once.`,
    codeLabel: "Your personal code",
    validUntil: "Valid until",
    welcomeButton: "Book a cleaning",
  },
  pl: {
    subject: "Potwierdź swój adres e-mail – Fiduxa",
    title: "Potwierdź adres e-mail",
    body: "Potwierdź swój adres e-mail, abyśmy mogli informować Cię o rezerwacjach. Link jest ważny 24 godziny.",
    offer: (pct) => `Następnie wyślemy Ci osobisty kod na ${pct}% zniżki na pierwsze sprzątanie.`,
    button: "Potwierdź adres e-mail",
    welcomeSubject: (pct) => `Witamy w Fiduxa – ${pct}% zniżki na pierwsze sprzątanie`,
    welcomeTitle: "Witamy w Fiduxa!",
    welcomeBody: (pct) => `Twój adres e-mail jest potwierdzony. Oto Twój osobisty kod na ${pct}% zniżki na pierwsze sprzątanie. Wpisz go przy rezerwacji w polu „Kod rabatowy” – działa tylko dla Twojego konta i jednorazowo.`,
    codeLabel: "Twój osobisty kod",
    validUntil: "Ważny do",
    welcomeButton: "Zarezerwuj sprzątanie",
  },
};

export const sendEmailVerificationEmail = async ({ to, name, url, locale, welcomePercent }) => {
  const l = lang(locale);
  const t = T[l];
  const v = VERIFY[l];
  const offer = welcomePercent ? v.offer(welcomePercent) : "";
  return send({
    template: "emailVerification",
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

export const sendWelcomeOfferEmail = async ({ to, name, locale, percent, code, expiresAt }) => {
  const l = lang(locale);
  const t = T[l];
  const v = VERIFY[l];
  const url = `${getSiteUrl()}/buchung?code=${encodeURIComponent(code)}`;
  const until = expiresAt ? new Date(expiresAt).toLocaleDateString(LOCALES[l], { timeZone: "Europe/Berlin" }) : null;
  return send({
    template: "welcomeOffer",
    to,
    subject: v.welcomeSubject(percent),
    text: `${t.hello(name)}\n\n${v.welcomeBody(percent)}\n\n${v.codeLabel}: ${code}${until ? `\n${v.validUntil}: ${until}` : ""}\n\n${url}\n\n${t.regards}`,
    html: layout(
      v.welcomeTitle,
      `<p>${escapeHtml(t.hello(name))}</p>
       <p>${escapeHtml(v.welcomeBody(percent))}</p>
       <div style="margin:20px 0;padding:20px;border-radius:14px;background:#E4EFE7;text-align:center">
         <div style="font-size:13px;color:#65736B">${escapeHtml(v.codeLabel)}</div>
         <div style="font-size:28px;font-weight:bold;letter-spacing:3px;font-family:monospace;color:#174D3A;margin:6px 0">${escapeHtml(code)}</div>
         ${until ? `<div style="font-size:12px;color:#65736B">${escapeHtml(v.validUntil)}: ${escapeHtml(until)}</div>` : ""}
       </div>
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
    template: "giftCard",
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
    template: "giftCardPurchase",
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

// ---------------------------------------------------------------------------
// Customer + cleaner: booking was edited (reschedule / resize / price change)
// ---------------------------------------------------------------------------
const EDIT_LABELS = {
  de: {
    subject: (ref) => `Deine Buchung ${ref} wurde aktualisiert`,
    title: "Buchung aktualisiert",
    intro: "die folgenden Angaben deiner Buchung wurden geändert:",
    newState: "Neuer Stand deiner Buchung:",
    fields: { preferredDate: "Datum", slot: "Uhrzeit", durationMinutes: "Dauer", extras: "Zusatzleistungen", serviceId: "Leistung", areaM2: "Wohnfläche", condition: "Zustand", notes: "Hinweise", totalCents: "Preis", assignedWorker: "Reinigungskraft" },
    priceNote: (delta, l) => (delta > 0 ? `Der Preis hat sich um ${formatMoney(delta, l)} erhöht.` : `Der Preis hat sich um ${formatMoney(-delta, l)} verringert.`),
    workerSubject: (ref) => `Terminänderung: Einsatz ${ref}`,
    workerIntro: "der Termin eines deiner Einsätze wurde geändert:",
  },
  en: {
    subject: (ref) => `Your booking ${ref} has been updated`,
    title: "Booking updated",
    intro: "the following details of your booking have changed:",
    newState: "Your booking now:",
    fields: { preferredDate: "Date", slot: "Time", durationMinutes: "Duration", extras: "Extras", serviceId: "Service", areaM2: "Living area", condition: "Condition", notes: "Notes", totalCents: "Price", assignedWorker: "Cleaner" },
    priceNote: (delta, l) => (delta > 0 ? `The price increased by ${formatMoney(delta, l)}.` : `The price decreased by ${formatMoney(-delta, l)}.`),
    workerSubject: (ref) => `Schedule change: job ${ref}`,
    workerIntro: "the appointment of one of your jobs has changed:",
  },
  pl: {
    subject: (ref) => `Twoja rezerwacja ${ref} została zaktualizowana`,
    title: "Rezerwacja zaktualizowana",
    intro: "zmieniły się następujące dane Twojej rezerwacji:",
    newState: "Aktualny stan rezerwacji:",
    fields: { preferredDate: "Data", slot: "Godzina", durationMinutes: "Czas trwania", extras: "Usługi dodatkowe", serviceId: "Usługa", areaM2: "Powierzchnia", condition: "Stan", notes: "Uwagi", totalCents: "Cena", assignedWorker: "Osoba sprzątająca" },
    priceNote: (delta, l) => (delta > 0 ? `Cena wzrosła o ${formatMoney(delta, l)}.` : `Cena spadła o ${formatMoney(-delta, l)}.`),
    workerSubject: (ref) => `Zmiana terminu: zlecenie ${ref}`,
    workerIntro: "zmienił się termin jednego z Twoich zleceń:",
  },
};

export const sendBookingUpdatedEmail = async ({ booking, changes = [], priceDeltaCents = 0 }) => {
  const l = lang(booking.locale);
  const t = T[l];
  const e = EDIT_LABELS[l];
  const changeRows = changes.map((c) => [e.fields[c.field] ?? c.field, `${c.from || "—"} → ${c.to || "—"}`]);
  const rows = [
    [t.reference, booking.reference],
    [t.service, SERVICE_NAMES[l][booking.serviceId] ?? booking.serviceId],
    [t.appointment, `${formatDay(booking.preferredDate, l)}, ${slotLabel(booking.slot, booking.slotEnd)}`],
    [t.duration, t.hours((booking.estimate?.durationMinutes ?? 0) / 60)],
    [t.amount, formatMoney(booking.pricing?.payableCents ?? booking.payment?.amountCents ?? 0, l)],
  ];
  const priceLine = priceDeltaCents !== 0 ? e.priceNote(priceDeltaCents, l) : "";
  return send({
    template: "bookingUpdated",
    to: booking.customerDetails.email,
    subject: e.subject(booking.reference),
    text: `${t.hello(booking.customerDetails.name)}

${e.intro}

${changeRows.map(([k, v]) => `${k}: ${v}`).join("\n")}
${priceLine ? `\n${priceLine}\n` : ""}
${e.newState}

${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}

${t.regards}`,
    html: layout(
      e.title,
      `<p>${escapeHtml(t.hello(booking.customerDetails.name))}</p>
       <p>${escapeHtml(e.intro)}</p>
       ${detailRows(changeRows)}
       ${priceLine ? `<p><strong>${escapeHtml(priceLine)}</strong></p>` : ""}
       <p>${escapeHtml(e.newState)}</p>
       ${detailRows(rows)}`,
      t.regardsHtml
    ),
  });
};

export const sendWorkerScheduleChangedEmail = async ({ worker, booking }) => {
  const l = lang(worker.preferredLanguage);
  const t = T[l];
  const e = EDIT_LABELS[l];
  const rows = [
    [t.reference, booking.reference],
    [t.appointment, `${formatDay(booking.preferredDate, l)}, ${slotLabel(booking.slot, booking.slotEnd)}`],
    [t.duration, t.hours((booking.estimate?.durationMinutes ?? 0) / 60)],
  ];
  return send({
    template: "workerScheduleChanged",
    to: worker.email,
    subject: e.workerSubject(booking.reference),
    text: `${t.hello(worker.name)}

${e.workerIntro}

${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}

${t.regards}`,
    html: layout(
      e.title,
      `<p>${escapeHtml(t.hello(worker.name))}</p><p>${escapeHtml(e.workerIntro)}</p>${detailRows(rows)}`,
      t.regardsHtml
    ),
  });
};

// ---------------------------------------------------------------------------
// Customer: post-cleaning feedback request ("How was your cleaning?")
// Sent once per completed booking; links to the account's feedback form.
// ---------------------------------------------------------------------------
const FEEDBACK_TEXTS = {
  de: {
    subject: "Wie war deine Fiduxa-Reinigung?",
    title: "Wie war deine Reinigung?",
    intro: (ref) => `deine Reinigung (${ref}) ist abgeschlossen. Wir würden uns sehr über dein Feedback freuen:`,
    questions: [
      "Wurde die Reinigung erfolgreich abgeschlossen?",
      "War deine Reinigungskraft professionell und freundlich?",
      "Warst du mit der Qualität zufrieden?",
      "Hat die tatsächliche Dauer gepasst – kürzer oder länger als geplant?",
      "Gab es zusätzliche Aufgaben oder Änderungen?",
      "Würdest du deine Reinigungskraft weiterempfehlen?",
    ],
    cta: "Feedback geben",
    note: "Das Feedback dauert nur eine Minute und hilft uns und deiner Reinigungskraft.",
  },
  en: {
    subject: "How was your Fiduxa cleaning experience?",
    title: "How was your cleaning?",
    intro: (ref) => `your cleaning (${ref}) is complete. We would love your feedback:`,
    questions: [
      "Was the cleaning completed successfully?",
      "Was your cleaner professional and friendly?",
      "Were you satisfied with the cleaning quality?",
      "Was the actual duration right – shorter or longer than planned?",
      "Were there any additional tasks or changes?",
      "Would you recommend your cleaner?",
    ],
    cta: "Give feedback",
    note: "It only takes a minute and helps us and your cleaner.",
  },
  pl: {
    subject: "Jak minęło sprzątanie z Fiduxa?",
    title: "Jak minęło sprzątanie?",
    intro: (ref) => `Twoje sprzątanie (${ref}) zostało zakończone. Będziemy wdzięczni za opinię:`,
    questions: [
      "Czy sprzątanie zostało ukończone pomyślnie?",
      "Czy osoba sprzątająca była profesjonalna i miła?",
      "Czy jakość sprzątania była zadowalająca?",
      "Czy rzeczywisty czas się zgadzał – krócej czy dłużej niż planowano?",
      "Czy były dodatkowe zadania lub zmiany?",
      "Czy polecasz tę osobę sprzątającą?",
    ],
    cta: "Przekaż opinię",
    note: "To tylko minuta – pomaga nam i Twojej osobie sprzątającej.",
  },
};

export const sendFeedbackRequestEmail = async ({ booking }) => {
  const l = lang(booking.locale);
  const t = T[l];
  const f = FEEDBACK_TEXTS[l];
  const url = `${siteUrl()}/konto/buchungen/${booking._id}?feedback=1`;
  return send({
    template: "feedbackRequest",
    to: booking.customerDetails.email,
    subject: f.subject,
    text: `${t.hello(booking.customerDetails.name)}

${f.intro(booking.reference)}

${f.questions.map((q) => `• ${q}`).join("\n")}

${f.cta}: ${url}

${f.note}

${t.regards}`,
    html: layout(
      f.title,
      `<p>${escapeHtml(t.hello(booking.customerDetails.name))}</p>
       <p>${escapeHtml(f.intro(booking.reference))}</p>
       <ul>${f.questions.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul>
       ${button(url, f.cta)}
       <p style="color:#65736B;font-size:13px">${escapeHtml(f.note)}</p>`,
      t.regardsHtml
    ),
  });
};

// ---------------------------------------------------------------------------
// Applicant: "Become a cleaner" application received
// ---------------------------------------------------------------------------
const APPLICATION_TEXTS = {
  de: {
    subject: "Deine Bewerbung bei Fiduxa",
    title: "Danke für deine Bewerbung!",
    body: "wir haben deine Bewerbung als Reinigungskraft erhalten. Unser Team meldet sich innerhalb weniger Werktage bei dir – telefonisch oder per E-Mail.",
    privacy: "Deine Angaben nutzen wir ausschließlich für das Bewerbungsverfahren und löschen sie spätestens nach 6 Monaten, falls keine Zusammenarbeit entsteht.",
  },
  en: {
    subject: "Your application at Fiduxa",
    title: "Thank you for applying!",
    body: "we have received your application as a cleaner. Our team will get back to you within a few working days – by phone or email.",
    privacy: "We use your details only for the application process and delete them after 6 months at the latest if we do not start working together.",
  },
  pl: {
    subject: "Twoja aplikacja w Fiduxa",
    title: "Dziękujemy za aplikację!",
    body: "otrzymaliśmy Twoją aplikację na stanowisko osoby sprzątającej. Nasz zespół odezwie się w ciągu kilku dni roboczych – telefonicznie lub e-mailem.",
    privacy: "Twoje dane wykorzystujemy wyłącznie w procesie rekrutacji i usuwamy je najpóźniej po 6 miesiącach, jeśli nie podejmiemy współpracy.",
  },
};

export const sendApplicationReceivedEmail = async ({ to, name, locale }) => {
  const l = lang(locale);
  const t = T[l];
  const a = APPLICATION_TEXTS[l];
  return send({
    template: "applicationReceived",
    to,
    subject: a.subject,
    text: `${t.hello(name)}

${a.body}

${a.privacy}

${t.regards}`,
    html: layout(
      a.title,
      `<p>${escapeHtml(t.hello(name))}</p><p>${escapeHtml(a.body)}</p><p style="color:#65736B;font-size:13px">${escapeHtml(a.privacy)}</p>`,
      t.regardsHtml
    ),
  });
};

// ---------------------------------------------------------------------------
// Recurring plan (Putzplan): next occurrence created – pay link (online plans)
// ---------------------------------------------------------------------------
const SERIES_LABELS = {
  de: {
    subject: (ref) => `Dein nächster Putztermin – ${ref}`,
    title: "Dein nächster Putztermin steht",
    intro: "wir haben den nächsten Termin deines Putzplans für dich reserviert. Bitte bezahle ihn online, damit der Termin bestätigt wird:",
    hold: (days) => `Der Termin bleibt ${days} Tage für dich reserviert. Danach wird er automatisch freigegeben.`,
    button: "Jetzt bezahlen",
    manage: "Pausieren, überspringen oder beenden kannst du deinen Putzplan jederzeit unter „Mein Putzplan“ in deinem Konto.",
    noLink: "Den Zahlungslink findest du in deinem Fiduxa-Konto unter „Buchungen“.",
  },
  en: {
    subject: (ref) => `Your next cleaning – ${ref}`,
    title: "Your next cleaning is scheduled",
    intro: "we have reserved the next appointment of your cleaning plan. Please pay online to confirm it:",
    hold: (days) => `The appointment stays reserved for you for ${days} days. After that it is released automatically.`,
    button: "Pay now",
    manage: "You can pause, skip or end your cleaning plan at any time under “My cleaning plan” in your account.",
    noLink: "You find the payment link in your Fiduxa account under “Bookings”.",
  },
  pl: {
    subject: (ref) => `Twoje następne sprzątanie – ${ref}`,
    title: "Twoje następne sprzątanie jest zaplanowane",
    intro: "zarezerwowaliśmy kolejny termin Twojego planu sprzątania. Opłać go online, aby potwierdzić termin:",
    hold: (days) => `Termin pozostaje zarezerwowany dla Ciebie przez ${days} dni. Potem zostanie automatycznie zwolniony.`,
    button: "Zapłać teraz",
    manage: "Plan sprzątania możesz w każdej chwili wstrzymać, pominąć lub zakończyć w sekcji „Mój plan sprzątania” na swoim koncie.",
    noLink: "Link do płatności znajdziesz na swoim koncie Fiduxa w sekcji „Rezerwacje”.",
  },
};

export const sendSeriesPaymentEmail = async ({ booking, url }) => {
  const l = lang(booking.locale);
  const t = T[l];
  const x = SERIES_LABELS[l];
  const payUrl = url || `${siteUrl()}/zahlung/${booking._id}`;
  const holdDays = booking.holdExpiresAt ? Math.max(1, Math.round((new Date(booking.holdExpiresAt).getTime() - Date.now()) / 86400000)) : 7;
  const rows = [
    [t.reference, booking.reference],
    [t.service, SERVICE_NAMES[l][booking.serviceId] ?? booking.serviceId],
    [t.appointment, `${formatDay(booking.preferredDate, l)}, ${slotLabel(booking.slot, booking.slotEnd)}`],
    [t.duration, t.hours((booking.estimate?.durationMinutes ?? 0) / 60)],
    [t.amount, formatMoney(booking.payment?.amountCents ?? booking.pricing?.payableCents ?? 0, l)],
  ];
  return send({
    template: "seriesPayment",
    to: booking.customerDetails.email,
    subject: x.subject(booking.reference),
    text: `${t.hello(booking.customerDetails.name)}

${x.intro}

${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}

${x.button}: ${payUrl}
${x.hold(holdDays)}

${x.manage}

${t.regards}`,
    html: layout(
      x.title,
      `<p>${escapeHtml(t.hello(booking.customerDetails.name))}</p>
       <p>${escapeHtml(x.intro)}</p>
       ${detailRows(rows)}
       ${button(payUrl, x.button)}
       <p style="color:#65736B;font-size:13px">${escapeHtml(x.hold(holdDays))}</p>
       <p style="color:#65736B;font-size:13px">${escapeHtml(x.manage)}</p>`,
      t.regardsHtml
    ),
  });
};

// ---------------------------------------------------------------------------
// Low-level access for feature modules that render their own mails
// (invoice / pay-link mails live in services/invoice-email.service.js)
// ---------------------------------------------------------------------------
export const sendRawEmail = (mail) => send(mail);
export const emailLayout = (title, bodyHtml, regardsHtml) => layout(title, bodyHtml, regardsHtml);
export const emailButton = (url, label) => button(url, label);
export const emailGreeting = (locale) => ({ hello: T[lang(locale)].hello, regards: T[lang(locale)].regards, regardsHtml: T[lang(locale)].regardsHtml });
