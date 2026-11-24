// Admin dashboard (Übersicht)
import { defineMessages } from '@/lib/i18n/config';

const de = {
  title: 'Übersicht',
  description: 'Was heute ansteht und wo Handlungsbedarf besteht.',
  loadingKpis: 'Kennzahlen werden geladen',
  groups: {
    bookings: 'Buchungen & Einsätze',
    capacity: 'Kapazität & Umsatz',
    people: 'Personen & Eingänge',
  },
  kpi: {
    paymentPending: 'Zahlung ausstehend',
    paymentPendingHint: 'Reserviert, noch nicht bezahlt',
    confirmed: 'Bestätigt',
    confirmedHint: (n: number) => `${n} in Arbeit`,
    todaysJobs: 'Einsätze heute',
    unassigned: 'Ohne Reinigungskraft',
    unassignedHint: 'Anstehend, nicht zugewiesen',
    refundsPending: 'Erstattungen offen',
    refundsPendingHint: 'Storniert nach Zahlung',
    completed: 'Abgeschlossen',
    cancelled: 'Storniert',
    cancelledHint: (expired: number) => `${expired} abgelaufen`,
    utilisation: 'Auslastung (7 Tage)',
    utilisationHint: (booked: string, capacity: string, bookings: number) =>
      `${booked} von ${capacity} Team-Stunden gebucht · ${bookings} ${bookings === 1 ? 'Buchung' : 'Buchungen'}`,
    noSlots: 'Keine Zeitfenster veröffentlicht',
    revenue: 'Umsatz bezahlt',
    revenueHint: 'Summe bezahlter Buchungen',
    customers: 'Kundenkonten',
    workersApproved: 'Reinigungskräfte freigegeben',
    workersPending: 'Reinigungskräfte in Prüfung',
    business: 'Neue Gewerbeanfragen',
    messages: 'Neue Nachrichten',
  },
  latest: {
    title: 'Neueste Buchungen',
    description: 'Die zuletzt eingegangenen Buchungen',
    all: 'Alle anzeigen',
    emptyTitle: 'Noch keine Buchungen',
    emptyText: 'Sobald Kundschaft ein Zeitfenster bucht, erscheint es hier.',
  },
};

export type DashboardMessages = typeof de;

const en: DashboardMessages = {
  title: 'Overview',
  description: 'What is happening today and what needs attention.',
  loadingKpis: 'Loading key figures',
  groups: {
    bookings: 'Bookings & jobs',
    capacity: 'Capacity & revenue',
    people: 'People & inbox',
  },
  kpi: {
    paymentPending: 'Payment pending',
    paymentPendingHint: 'Reserved, not paid yet',
    confirmed: 'Confirmed',
    confirmedHint: (n) => `${n} in progress`,
    todaysJobs: 'Jobs today',
    unassigned: 'Without cleaner',
    unassignedHint: 'Upcoming, not assigned',
    refundsPending: 'Refunds pending',
    refundsPendingHint: 'Cancelled after payment',
    completed: 'Completed',
    cancelled: 'Cancelled',
    cancelledHint: (expired) => `${expired} expired`,
    utilisation: 'Utilisation (7 days)',
    utilisationHint: (booked, capacity, bookings) =>
      `${booked} of ${capacity} team hours booked · ${bookings} ${bookings === 1 ? 'booking' : 'bookings'}`,
    noSlots: 'No time windows published',
    revenue: 'Revenue paid',
    revenueHint: 'Total of paid bookings',
    customers: 'Customer accounts',
    workersApproved: 'Approved cleaners',
    workersPending: 'Cleaners in review',
    business: 'New business requests',
    messages: 'New messages',
  },
  latest: {
    title: 'Latest bookings',
    description: 'The most recently received bookings',
    all: 'Show all',
    emptyTitle: 'No bookings yet',
    emptyText: 'As soon as a customer books a time slot, it will appear here.',
  },
};

const pl: DashboardMessages = {
  title: 'Przegląd',
  description: 'Co dzieje się dzisiaj i co wymaga uwagi.',
  loadingKpis: 'Ładowanie wskaźników',
  groups: {
    bookings: 'Rezerwacje i zlecenia',
    capacity: 'Dostępność i przychody',
    people: 'Osoby i wiadomości',
  },
  kpi: {
    paymentPending: 'Oczekuje na płatność',
    paymentPendingHint: 'Zarezerwowane, jeszcze nieopłacone',
    confirmed: 'Potwierdzone',
    confirmedHint: (n) => `${n} w trakcie`,
    todaysJobs: 'Zlecenia dzisiaj',
    unassigned: 'Bez osoby sprzątającej',
    unassignedHint: 'Nadchodzące, nieprzydzielone',
    refundsPending: 'Zwroty do wykonania',
    refundsPendingHint: 'Anulowane po płatności',
    completed: 'Zakończone',
    cancelled: 'Anulowane',
    cancelledHint: (expired) => `wygasłe: ${expired}`,
    utilisation: 'Obłożenie (7 dni)',
    utilisationHint: (booked, capacity, bookings) =>
      `zarezerwowano ${booked} z ${capacity} godzin zespołów · rezerwacje: ${bookings}`,
    noSlots: 'Brak opublikowanych okien czasowych',
    revenue: 'Przychód opłacony',
    revenueHint: 'Suma opłaconych rezerwacji',
    customers: 'Konta klientów',
    workersApproved: 'Zatwierdzone osoby sprzątające',
    workersPending: 'Osoby sprzątające w weryfikacji',
    business: 'Nowe zapytania firmowe',
    messages: 'Nowe wiadomości',
  },
  latest: {
    title: 'Najnowsze rezerwacje',
    description: 'Ostatnio otrzymane rezerwacje',
    all: 'Pokaż wszystkie',
    emptyTitle: 'Brak rezerwacji',
    emptyText: 'Gdy klient zarezerwuje termin, pojawi się on tutaj.',
  },
};

const dashboardMessages = defineMessages({ de, en, pl });
export default dashboardMessages;
