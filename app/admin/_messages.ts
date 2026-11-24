// Shared admin texts: shell, navigation, generic UI states and dialogs.
import { defineMessages } from '@/lib/i18n/config';

const de = {
  meta: { title: 'Verwaltung' },
  shell: {
    skipToContent: 'Zum Inhalt springen',
    navLabel: 'Admin-Navigation',
    openMenu: 'Menü öffnen',
    menuTitle: 'Fiduxa Admin',
    badge: 'Admin',
    logout: 'Abmelden',
    language: 'Sprache',
  },
  nav: {
    overview: 'Übersicht',
    slots: 'Zeitfenster',
    settings: 'Preise & Einstellungen',
    bookings: 'Buchungen',
    payments: 'Zahlungen',
    payouts: 'Auszahlungen',
    commission: 'Provision',
    finance: 'Finanzen',
    emails: 'E-Mails',
    // [slot-A-nav-msg]
    series: 'Putzpläne',
    // [slot-B-nav-msg]
    // [slot-C-nav-msg]
    // [slot-D-nav-msg]
    // [slot-E-nav-msg]
    // [slot-F-nav-msg]
    promotions: 'Aktionen',
    giftCards: 'Gutscheine',
    analytics: 'Auswertungen',
    reviews: 'Bewertungen',
    feedback: 'Feedback (intern)',
    customers: 'Kunden',
    workers: 'Reinigungskräfte',
    applications: 'Bewerbungen',
    business: 'Gewerbeanfragen',
    messages: 'Nachrichten',
    admins: 'Administratoren',
    audit: 'Protokoll',
  },
  ui: {
    back: 'Zurück',
    next: 'Weiter',
    retry: 'Erneut versuchen',
    cancel: 'Abbrechen',
    loading: 'Wird geladen',
    loadingData: 'Daten werden geladen',
    noteOptional: 'Notiz (optional)',
    noteRequired: 'Bitte eine Notiz angeben.',
    entries: (n: number) => `${n} ${n === 1 ? 'Eintrag' : 'Einträge'}`,
    pageOf: (page: number, pages: number, total: number) => `Seite ${page} von ${pages} · ${total} Einträge`,
    pagination: 'Seitennavigation',
    active: 'Aktiv',
    inactive: 'Deaktiviert',
    system: 'System',
    none: 'Keine',
    yes: 'Ja',
    no: 'Nein',
  },
};

export type AdminMessages = typeof de;

const en: AdminMessages = {
  meta: { title: 'Administration' },
  shell: {
    skipToContent: 'Skip to content',
    navLabel: 'Admin navigation',
    openMenu: 'Open menu',
    menuTitle: 'Fiduxa Admin',
    badge: 'Admin',
    logout: 'Log out',
    language: 'Language',
  },
  nav: {
    overview: 'Overview',
    slots: 'Time windows',
    settings: 'Prices & settings',
    bookings: 'Bookings',
    payments: 'Payments',
    payouts: 'Payouts',
    commission: 'Commission',
    finance: 'Finance',
    emails: 'E-mails',
    // [slot-A-nav-msg]
    series: 'Cleaning plans',
    // [slot-B-nav-msg]
    // [slot-C-nav-msg]
    // [slot-D-nav-msg]
    // [slot-E-nav-msg]
    // [slot-F-nav-msg]
    promotions: 'Promotions',
    giftCards: 'Gift cards',
    analytics: 'Analytics',
    reviews: 'Reviews',
    feedback: 'Feedback (internal)',
    customers: 'Customers',
    workers: 'Cleaners',
    applications: 'Applications',
    business: 'Business requests',
    messages: 'Messages',
    admins: 'Administrators',
    audit: 'Audit log',
  },
  ui: {
    back: 'Back',
    next: 'Next',
    retry: 'Try again',
    cancel: 'Cancel',
    loading: 'Loading',
    loadingData: 'Loading data',
    noteOptional: 'Note (optional)',
    noteRequired: 'Please enter a note.',
    entries: (n) => `${n} ${n === 1 ? 'entry' : 'entries'}`,
    pageOf: (page, pages, total) => `Page ${page} of ${pages} · ${total} entries`,
    pagination: 'Pagination',
    active: 'Active',
    inactive: 'Deactivated',
    system: 'System',
    none: 'None',
    yes: 'Yes',
    no: 'No',
  },
};

/** Polish plural helper: 1 wpis, 2–4 wpisy, 5+ wpisów (12–14 → wpisów) */
export const plPlural = (n: number, one: string, few: string, many: string) => {
  if (n === 1) return one;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const pl: AdminMessages = {
  meta: { title: 'Administracja' },
  shell: {
    skipToContent: 'Przejdź do treści',
    navLabel: 'Nawigacja panelu administracyjnego',
    openMenu: 'Otwórz menu',
    menuTitle: 'Fiduxa Admin',
    badge: 'Admin',
    logout: 'Wyloguj się',
    language: 'Język',
  },
  nav: {
    overview: 'Przegląd',
    slots: 'Okna czasowe',
    settings: 'Ceny i ustawienia',
    bookings: 'Rezerwacje',
    payments: 'Płatności',
    payouts: 'Wypłaty',
    commission: 'Prowizja',
    finance: 'Finanse',
    emails: 'E-maile',
    // [slot-A-nav-msg]
    series: 'Plany sprzątania',
    // [slot-B-nav-msg]
    // [slot-C-nav-msg]
    // [slot-D-nav-msg]
    // [slot-E-nav-msg]
    // [slot-F-nav-msg]
    promotions: 'Promocje',
    giftCards: 'Karty podarunkowe',
    analytics: 'Analizy',
    reviews: 'Opinie',
    feedback: 'Feedback (wewnętrzne)',
    customers: 'Klienci',
    workers: 'Osoby sprzątające',
    applications: 'Aplikacje',
    business: 'Zapytania firmowe',
    messages: 'Wiadomości',
    admins: 'Administratorzy',
    audit: 'Dziennik zmian',
  },
  ui: {
    back: 'Wstecz',
    next: 'Dalej',
    retry: 'Spróbuj ponownie',
    cancel: 'Anuluj',
    loading: 'Ładowanie',
    loadingData: 'Ładowanie danych',
    noteOptional: 'Notatka (opcjonalnie)',
    noteRequired: 'Podaj notatkę.',
    entries: (n) => `${n} ${plPlural(n, 'wpis', 'wpisy', 'wpisów')}`,
    pageOf: (page, pages, total) => `Strona ${page} z ${pages} · ${total} ${plPlural(total, 'wpis', 'wpisy', 'wpisów')}`,
    pagination: 'Nawigacja stron',
    active: 'Aktywne',
    inactive: 'Dezaktywowane',
    system: 'System',
    none: 'Brak',
    yes: 'Tak',
    no: 'Nie',
  },
};

const adminMessages = defineMessages({ de, en, pl });
export default adminMessages;
