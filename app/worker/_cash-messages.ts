// Texts for cash-at-the-end-of-the-job bookings and net pay in the cleaner portal.
// German uses "du", Polish the informal "Ty".
import { defineMessages } from '@/lib/i18n/config';

const de = {
  badge: 'Bar',
  badgeLong: 'Barzahlung',
  openHint: 'Kundschaft zahlt bar bei dir',
  card: {
    title: 'Barzahlung',
    collect: (amount: string) => `Bitte ${amount} vom Kunden kassieren`,
    hint: 'Kassiere den Betrag am Ende des Einsatzes. Er wird mit deinem Verdienst verrechnet.',
    collected: (amount: string) => `Bar kassiert: ${amount}`,
  },
  complete: {
    legend: 'Barzahlung',
    expected: (amount: string) => `Zu kassieren: ${amount}`,
    amount: 'Erhaltener Betrag (€)',
    amountHint: 'Trag ein, was du wirklich bekommen hast.',
    confirm: 'Ich habe den Betrag bar erhalten',
    errAmount: 'Bitte gib einen gültigen Betrag ein (z. B. 87,50).',
    errConfirm: 'Bitte bestätige, dass du den Betrag bar erhalten hast.',
    differs: (expected: string) =>
      `Der Betrag weicht von ${expected} ab. Das Büro wird informiert – schreib gern kurz in die Notiz, warum.`,
  },
  pay: {
    gross: 'Vergütung',
    cashKept: 'Bar kassiert (behalten)',
    net: 'Auszahlung',
    owed: (amount: string) => `Offen an Fiduxa: ${amount}`,
    negative:
      'Du hast mehr bar kassiert als deine Vergütung – die Differenz wird mit deiner nächsten Auszahlung verrechnet.',
  },
  earnings: {
    cashHeld: 'Bar kassiert',
    cashHeldHint: 'schon abgezogen',
    netNote:
      'Alle Beträge sind netto: Vergütung minus Bargeld, das du bei Barzahlung direkt von der Kundschaft behalten hast.',
    netLabel: 'netto',
  },
  dashboard: {
    netHint: 'netto, nach Abzug Bargeld',
    cashTile: 'Bar kassiert',
    cashTileHint: 'wird mit der Auszahlung verrechnet',
    owed: (amount: string) => `Offen an Fiduxa: ${amount}`,
  },
};

export type CashMessages = typeof de;

const en: CashMessages = {
  badge: 'Cash',
  badgeLong: 'Cash payment',
  openHint: 'Customer pays you in cash',
  card: {
    title: 'Cash payment',
    collect: (amount) => `Please collect ${amount} from the customer`,
    hint: 'Collect the amount at the end of the job. It is offset against your pay.',
    collected: (amount) => `Cash collected: ${amount}`,
  },
  complete: {
    legend: 'Cash payment',
    expected: (amount) => `To collect: ${amount}`,
    amount: 'Amount received (€)',
    amountHint: 'Enter what you actually received.',
    confirm: 'I received the amount in cash',
    errAmount: 'Please enter a valid amount (e.g. 87.50).',
    errConfirm: 'Please confirm that you received the amount in cash.',
    differs: (expected) =>
      `The amount differs from ${expected}. The office will be informed – feel free to add a short note why.`,
  },
  pay: {
    gross: 'Pay',
    cashKept: 'Cash collected (kept)',
    net: 'Payout',
    owed: (amount) => `Owed to Fiduxa: ${amount}`,
    negative: 'You collected more cash than your pay – the difference will be offset against your next payout.',
  },
  earnings: {
    cashHeld: 'Cash collected',
    cashHeldHint: 'already deducted',
    netNote: 'All amounts are net: pay minus cash you kept directly from customers paying in cash.',
    netLabel: 'net',
  },
  dashboard: {
    netHint: 'net, after cash deducted',
    cashTile: 'Cash collected',
    cashTileHint: 'offset against your payout',
    owed: (amount) => `Owed to Fiduxa: ${amount}`,
  },
};

const pl: CashMessages = {
  badge: 'Gotówka',
  badgeLong: 'Płatność gotówką',
  openHint: 'Klient płaci Ci gotówką',
  card: {
    title: 'Płatność gotówką',
    collect: (amount) => `Pobierz od klienta ${amount}`,
    hint: 'Pobierz kwotę na końcu zlecenia. Zostanie rozliczona z Twoim wynagrodzeniem.',
    collected: (amount) => `Pobrano gotówką: ${amount}`,
  },
  complete: {
    legend: 'Płatność gotówką',
    expected: (amount) => `Do pobrania: ${amount}`,
    amount: 'Otrzymana kwota (€)',
    amountHint: 'Wpisz kwotę, którą faktycznie otrzymałeś(-aś).',
    confirm: 'Otrzymałem(-am) kwotę w gotówce',
    errAmount: 'Wpisz prawidłową kwotę (np. 87,50).',
    errConfirm: 'Potwierdź, że otrzymałeś(-aś) kwotę w gotówce.',
    differs: (expected) =>
      `Kwota różni się od ${expected}. Biuro zostanie poinformowane – możesz krótko wyjaśnić to w notatce.`,
  },
  pay: {
    gross: 'Wynagrodzenie',
    cashKept: 'Pobrana gotówka (zatrzymana)',
    net: 'Wypłata',
    owed: (amount) => `Do oddania Fiduxa: ${amount}`,
    negative:
      'Pobrałeś(-aś) więcej gotówki niż wynosi Twoje wynagrodzenie – różnica zostanie rozliczona z następną wypłatą.',
  },
  earnings: {
    cashHeld: 'Pobrana gotówka',
    cashHeldHint: 'już odliczona',
    netNote: 'Wszystkie kwoty są netto: wynagrodzenie minus gotówka zatrzymana od klientów płacących gotówką.',
    netLabel: 'netto',
  },
  dashboard: {
    netHint: 'netto, po odliczeniu gotówki',
    cashTile: 'Pobrana gotówka',
    cashTileHint: 'rozliczana z wypłatą',
    owed: (amount) => `Do oddania Fiduxa: ${amount}`,
  },
};

const cashMessages = defineMessages({ de, en, pl });
export default cashMessages;
