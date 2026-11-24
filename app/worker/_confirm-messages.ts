// Texts for confirming a job after the job day ("Job erledigt bestätigen") and
// reporting that it did not take place. German "du", Polish informal "Ty".
import { defineMessages } from '@/lib/i18n/config';

const de = {
  listTitle: 'Bitte bestätigen',
  listIntro: 'Diese Aufträge liegen in der Vergangenheit und sind noch nicht bestätigt. Bitte bestätige sie – erst dann werden Rechnung und dein Verdienst erstellt.',
  badge: 'Bitte bestätigen',
  title: 'Job erledigt bestätigen',
  intro: (deadline: string) => `Du hast Start/Fertig am Einsatztag nicht getippt. Trage die tatsächlichen Zeiten ein (möglich bis ${deadline}).`,
  start: 'Beginn',
  end: 'Ende',
  note: 'Notiz (optional)',
  cash: 'Bar erhalten (€)',
  confirm: 'Job erledigt bestätigen',
  confirmed: 'Danke! Der Auftrag ist bestätigt.',
  errEnd: 'Das Ende muss nach dem Beginn liegen (gleicher Tag).',
  errCash: 'Bitte trage den erhaltenen Barbetrag ein.',
  windowClosed: 'Die Frist zum Bestätigen ist abgelaufen. Bitte melde dich beim Büro.',
  notHappened: 'Nicht stattgefunden',
  notHappenedTitle: 'Der Einsatz hat nicht stattgefunden',
  reasons: { customer_absent: 'Kunde nicht zu Hause', no_access: 'Kein Zugang', other: 'Sonstiges' },
  reasonNote: 'Was ist passiert?',
  send: 'Meldung senden',
  cancel: 'Abbrechen',
  reported: 'Gemeldet – das Büro entscheidet. Es wird nichts automatisch berechnet.',
  reportedState: 'Als „nicht stattgefunden“ gemeldet – das Büro prüft.',
  errNote: 'Bitte beschreibe kurz, was passiert ist.',
};

type ConfirmMessages = typeof de;

const en: ConfirmMessages = {
  listTitle: 'Please confirm',
  listIntro: 'These jobs are in the past and not confirmed yet. Please confirm them – only then are the invoice and your pay created.',
  badge: 'Please confirm',
  title: 'Confirm job done',
  intro: (deadline: string) => `You did not tap Start/Done on the job day. Enter the actual times (possible until ${deadline}).`,
  start: 'Start',
  end: 'End',
  note: 'Note (optional)',
  cash: 'Cash received (€)',
  confirm: 'Confirm job done',
  confirmed: 'Thank you! The job is confirmed.',
  errEnd: 'The end must be after the start (same day).',
  errCash: 'Please enter the cash amount you received.',
  windowClosed: 'The confirmation deadline has passed. Please contact the office.',
  notHappened: 'Did not happen',
  notHappenedTitle: 'The job did not take place',
  reasons: { customer_absent: 'Customer not home', no_access: 'No access', other: 'Other' },
  reasonNote: 'What happened?',
  send: 'Send report',
  cancel: 'Cancel',
  reported: 'Reported – the office decides. Nothing is charged automatically.',
  reportedState: 'Reported as “did not happen” – the office is reviewing it.',
  errNote: 'Please describe briefly what happened.',
};

const pl: ConfirmMessages = {
  listTitle: 'Potwierdź',
  listIntro: 'Te zlecenia już minęły i nie zostały potwierdzone. Potwierdź je – dopiero wtedy powstaje faktura i Twoje wynagrodzenie.',
  badge: 'Potwierdź',
  title: 'Potwierdź wykonanie',
  intro: (deadline: string) => `Nie kliknięto Start/Gotowe w dniu zlecenia. Wpisz rzeczywiste godziny (możliwe do ${deadline}).`,
  start: 'Początek',
  end: 'Koniec',
  note: 'Notatka (opcjonalnie)',
  cash: 'Otrzymana gotówka (€)',
  confirm: 'Potwierdź wykonanie',
  confirmed: 'Dziękujemy! Zlecenie potwierdzone.',
  errEnd: 'Koniec musi być po początku (ten sam dzień).',
  errCash: 'Wpisz otrzymaną kwotę gotówki.',
  windowClosed: 'Termin na potwierdzenie minął. Skontaktuj się z biurem.',
  notHappened: 'Nie odbyło się',
  notHappenedTitle: 'Zlecenie się nie odbyło',
  reasons: { customer_absent: 'Klienta nie było w domu', no_access: 'Brak dostępu', other: 'Inne' },
  reasonNote: 'Co się stało?',
  send: 'Wyślij zgłoszenie',
  cancel: 'Anuluj',
  reported: 'Zgłoszono – decyzję podejmie biuro. Nic nie jest naliczane automatycznie.',
  reportedState: 'Zgłoszono jako „nie odbyło się” – biuro sprawdza.',
  errNote: 'Opisz krótko, co się stało.',
};

const confirmMessages = defineMessages({ de, en, pl });
export default confirmMessages;
