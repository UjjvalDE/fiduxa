// Mails of the automatic assignment (round 3), de / en / pl:
//   cleaner: new job assigned to you (no accept step) / job removed from you
//   customer: your cleaner changed / no cleaner available – choose a new time
import { emailButton, emailGreeting, emailLayout, sendRawEmail } from "./email.service.js";
import { escapeHtml, slotLabel } from "../utils/helpers.js";
import { getSiteUrl } from "../utils/site-url.js";
import { EXTRAS, SERVICES } from "../data/catalogue.js";

const LOCALES = { de: "de-DE", en: "en-GB", pl: "pl-PL" };
const lang = (locale) => (LOCALES[locale] ? locale : "de");
const day = (date, l) =>
  new Date(date).toLocaleDateString(LOCALES[l], { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "Fiduxa";
const serviceName = (id, l) => {
  const s = SERVICES.find((x) => x.id === id);
  return (l === "de" ? s?.name ?? s?.label : s?.nameEn ?? s?.labelEn ?? s?.name) ?? id;
};
const extraName = (id, l) => {
  const e = EXTRAS.find((x) => x.id === id);
  return (l === "de" ? e?.label : e?.labelEn) ?? id;
};

const rowsHtml = (pairs) =>
  `<table style="border-collapse:collapse;margin:16px 0">${pairs
    .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#65736B;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`)
    .join("")}</table>`;
const rowsText = (pairs) => pairs.map(([k, v]) => `${k}: ${v}`).join("\n");

const T = {
  de: {
    ref: "Buchung", date: "Termin", duration: "Dauer", service: "Leistung", extras: "Extras", address: "Adresse", notes: "Hinweise", pets: "Haustiere", yes: "ja",
    hours: (m) => `${(m / 60).toLocaleString("de-DE")} Std.`,
    assigned: {
      subject: (ref) => `Neuer Auftrag für dich – ${ref}`,
      title: "Neuer Auftrag für dich",
      body: "wir haben dir einen Auftrag zugeteilt. Er passt zu deiner Verfügbarkeit und steht schon in deinem Kalender – du musst nichts bestätigen. Falls du ausnahmsweise nicht kannst, melde das bitte sofort im Portal („Ich kann nicht“).",
      button: "Auftrag ansehen",
    },
    removed: {
      subject: (ref) => `Auftrag ${ref} wurde neu vergeben`,
      title: "Auftrag neu vergeben",
      body: "dieser Auftrag ist nicht mehr dir zugeteilt. Du musst nichts weiter tun.",
    },
    changed: {
      subject: (ref) => `Neue Reinigungskraft für deine Buchung ${ref}`,
      title: "Deine Reinigungskraft hat sich geändert",
      body: (name) => `deine ursprünglich eingeplante Reinigungskraft kann den Termin leider nicht wahrnehmen. ${name} übernimmt deine Reinigung – Termin und Preis bleiben gleich.`,
    },
    none: {
      subject: (ref) => `Bitte wähle einen neuen Termin – Buchung ${ref}`,
      title: "Für deinen Termin ist gerade keine Reinigungskraft frei",
      body: "leider können wir für deinen Termin im Moment keine passende Reinigungskraft einplanen. Das liegt an uns – nicht an dir. Du kannst einen der folgenden freien Termine wählen, weiter warten (wir suchen automatisch weiter) oder kostenlos stornieren und erhältst den vollen Betrag zurück.",
      options: "Freie Termine in der Nähe deines Wunschtermins",
      button: "Termin wählen",
    },
  },
  en: {
    ref: "Booking", date: "Appointment", duration: "Duration", service: "Service", extras: "Extras", address: "Address", notes: "Notes", pets: "Pets", yes: "yes",
    hours: (m) => `${(m / 60).toLocaleString("en-GB")} h`,
    assigned: {
      subject: (ref) => `New job for you – ${ref}`,
      title: "New job for you",
      body: "we have assigned a job to you. It fits your availability and is already in your calendar – there is nothing to confirm. If you exceptionally cannot make it, please report it in the portal right away (\"I can't make it\").",
      button: "View job",
    },
    removed: {
      subject: (ref) => `Job ${ref} was reassigned`,
      title: "Job reassigned",
      body: "this job is no longer assigned to you. There is nothing else you need to do.",
    },
    changed: {
      subject: (ref) => `New cleaner for your booking ${ref}`,
      title: "Your cleaner has changed",
      body: (name) => `unfortunately the cleaner originally planned cannot make your appointment. ${name} will take care of your cleaning – the time and price stay the same.`,
    },
    none: {
      subject: (ref) => `Please choose a new time – booking ${ref}`,
      title: "No cleaner is free for your appointment right now",
      body: "unfortunately we cannot schedule a suitable cleaner for your appointment at the moment. This is on us, not on you. You can choose one of the free times below, keep waiting (we keep searching automatically) or cancel free of charge and get the full amount back.",
      options: "Free times close to your chosen appointment",
      button: "Choose a time",
    },
  },
  pl: {
    ref: "Rezerwacja", date: "Termin", duration: "Czas trwania", service: "Usługa", extras: "Dodatki", address: "Adres", notes: "Uwagi", pets: "Zwierzęta", yes: "tak",
    hours: (m) => `${(m / 60).toLocaleString("pl-PL")} godz.`,
    assigned: {
      subject: (ref) => `Nowe zlecenie dla Ciebie – ${ref}`,
      title: "Nowe zlecenie dla Ciebie",
      body: "przydzieliliśmy Ci zlecenie. Pasuje do Twojej dostępności i jest już w Twoim kalendarzu – nie musisz niczego potwierdzać. Jeśli wyjątkowo nie możesz, zgłoś to od razu w portalu („Nie mogę”).",
      button: "Zobacz zlecenie",
    },
    removed: {
      subject: (ref) => `Zlecenie ${ref} zostało przekazane innej osobie`,
      title: "Zlecenie przekazane",
      body: "to zlecenie nie jest już przypisane do Ciebie. Nie musisz nic robić.",
    },
    changed: {
      subject: (ref) => `Nowa osoba sprzątająca dla rezerwacji ${ref}`,
      title: "Zmieniła się osoba sprzątająca",
      body: (name) => `niestety pierwotnie zaplanowana osoba nie może przyjść w tym terminie. ${name} zajmie się Twoim sprzątaniem – termin i cena pozostają bez zmian.`,
    },
    none: {
      subject: (ref) => `Wybierz nowy termin – rezerwacja ${ref}`,
      title: "Na Twój termin nie ma teraz wolnej osoby sprzątającej",
      body: "niestety w tej chwili nie możemy zaplanować odpowiedniej osoby sprzątającej na Twój termin. To nasza strona, nie Twoja. Możesz wybrać jeden z wolnych terminów poniżej, poczekać (szukamy dalej automatycznie) albo bezpłatnie anulować i otrzymać pełny zwrot.",
      options: "Wolne terminy blisko Twojego terminu",
      button: "Wybierz termin",
    },
  },
};

/** Cleaner (portal language): a job was assigned – everything needed for the job */
export const sendAutoAssignedToWorkerEmail = async ({ worker, booking }) => {
  const l = lang(worker.preferredLanguage);
  const t = T[l];
  const g = emailGreeting(l);
  const minutes = booking.estimate?.durationMinutes ?? 120;
  const pairs = [
    [t.ref, booking.reference],
    [t.date, `${day(booking.preferredDate, l)}, ${slotLabel(booking.slot, booking.slotEnd)}`],
    [t.duration, t.hours(minutes)],
    [t.service, serviceName(booking.serviceId, l)],
    ...(booking.extras?.length ? [[t.extras, booking.extras.map((e) => extraName(e, l)).join(", ")]] : []),
    [t.address, `${booking.customerDetails?.address ?? ""}, ${booking.customerDetails?.postcode ?? ""} Berlin`],
    ...(booking.pets ? [[t.pets, t.yes]] : []),
    ...(booking.notes ? [[t.notes, booking.notes]] : []),
  ];
  const url = `${getSiteUrl()}/worker/jobs/${booking._id}`;
  return sendRawEmail({
    template: "jobAutoAssigned",
    bookingRef: booking.reference,
    to: worker.email,
    subject: t.assigned.subject(booking.reference),
    text: `${g.hello(worker.name)}\n\n${t.assigned.body}\n\n${rowsText(pairs)}\n\n${url}\n\n${g.regards}`,
    html: emailLayout(
      t.assigned.title,
      `<p>${escapeHtml(g.hello(worker.name))}</p><p>${escapeHtml(t.assigned.body)}</p>${rowsHtml(pairs)}${emailButton(url, t.assigned.button)}`,
      g.regardsHtml
    ),
  });
};

/** Previous cleaner: the job was taken off them (removal, suspension, document expiry) */
export const sendJobRemovedEmail = async ({ worker, booking }) => {
  const l = lang(worker.preferredLanguage);
  const t = T[l];
  const g = emailGreeting(l);
  const pairs = [
    [t.ref, booking.reference],
    [t.date, `${day(booking.preferredDate, l)}, ${slotLabel(booking.slot, booking.slotEnd)}`],
  ];
  return sendRawEmail({
    template: "jobRemoved",
    bookingRef: booking.reference,
    to: worker.email,
    subject: t.removed.subject(booking.reference),
    text: `${g.hello(worker.name)}\n\n${t.removed.body}\n\n${rowsText(pairs)}\n\n${g.regards}`,
    html: emailLayout(t.removed.title, `<p>${escapeHtml(g.hello(worker.name))}</p><p>${escapeHtml(t.removed.body)}</p>${rowsHtml(pairs)}`, g.regardsHtml),
  });
};

/** Customer: a replacement cleaner was assigned */
export const sendCleanerChangedEmail = async ({ booking, workerName }) => {
  const l = lang(booking.locale);
  const t = T[l];
  const g = emailGreeting(l);
  const pairs = [
    [t.ref, booking.reference],
    [t.date, `${day(booking.preferredDate, l)}, ${slotLabel(booking.slot, booking.slotEnd)}`],
  ];
  const body = t.changed.body(firstName(workerName));
  return sendRawEmail({
    template: "cleanerChanged",
    bookingRef: booking.reference,
    to: booking.customerDetails.email,
    subject: t.changed.subject(booking.reference),
    text: `${g.hello(booking.customerDetails.name)}\n\n${body}\n\n${rowsText(pairs)}\n\n${g.regards}`,
    html: emailLayout(t.changed.title, `<p>${escapeHtml(g.hello(booking.customerDetails.name))}</p><p>${escapeHtml(body)}</p>${rowsHtml(pairs)}`, g.regardsHtml),
  });
};

/** Customer: nobody is free – pick an alternative, wait or cancel free of charge */
export const sendNoCleanerEmail = async ({ booking, alternatives = [] }) => {
  const l = lang(booking.locale);
  const t = T[l];
  const g = emailGreeting(l);
  const url = `${getSiteUrl()}/konto/buchungen/${booking._id}/termin-waehlen`;
  const pairs = [
    [t.ref, booking.reference],
    [t.date, `${day(booking.preferredDate, l)}, ${slotLabel(booking.slot, booking.slotEnd)}`],
  ];
  const options = alternatives.map((a) => `${day(new Date(`${a.date}T00:00:00Z`), l)}, ${a.startTime}–${a.endTime}`);
  const optionsHtml = options.length ? `<p><strong>${escapeHtml(t.none.options)}</strong></p><ul>${options.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ul>` : "";
  return sendRawEmail({
    template: "noCleanerAvailable",
    bookingRef: booking.reference,
    to: booking.customerDetails.email,
    subject: t.none.subject(booking.reference),
    text: `${g.hello(booking.customerDetails.name)}\n\n${t.none.body}\n\n${rowsText(pairs)}\n${options.length ? `\n${t.none.options}:\n${options.map((o) => `- ${o}`).join("\n")}\n` : ""}\n${url}\n\n${g.regards}`,
    html: emailLayout(
      t.none.title,
      `<p>${escapeHtml(g.hello(booking.customerDetails.name))}</p><p>${escapeHtml(t.none.body)}</p>${rowsHtml(pairs)}${optionsHtml}${emailButton(url, t.none.button)}`,
      g.regardsHtml
    ),
  });
};
