import { defineMessages } from '@/lib/i18n/config';
import type { ContactMessage } from '@/lib/types';

type MsgStatus = ContactMessage['status'];

const de = {
  title: 'Nachrichten',
  description: 'Eingänge über das Kontaktformular',
  tabsLabel: 'Nachrichten nach Status filtern',
  all: 'Alle',
  loading: 'Nachrichten werden geladen',
  emptyTitle: 'Keine Nachrichten',
  emptyFiltered: 'In dieser Ansicht gibt es keine Nachrichten.',
  emptyNone: 'Es sind noch keine Nachrichten eingegangen.',
  noSubject: 'Ohne Betreff',
  statusToast: (label: string) => `Status: ${label}`,
  statusOf: (name: string) => `Status der Nachricht von ${name}`,
  saving: 'Wird gespeichert',
  reply: 'Per E-Mail antworten',
  status: {
    new: 'Neu',
    in_progress: 'In Bearbeitung',
    closed: 'Erledigt',
  } as Record<MsgStatus, string>,
};

const en: typeof de = {
  title: 'Messages',
  description: 'Submissions from the contact form',
  tabsLabel: 'Filter messages by status',
  all: 'All',
  loading: 'Loading messages',
  emptyTitle: 'No messages',
  emptyFiltered: 'There are no messages in this view.',
  emptyNone: 'No messages have been received yet.',
  noSubject: 'No subject',
  statusToast: (label) => `Status: ${label}`,
  statusOf: (name) => `Status of the message from ${name}`,
  saving: 'Saving',
  reply: 'Reply by email',
  status: {
    new: 'New',
    in_progress: 'In progress',
    closed: 'Done',
  },
};

const pl: typeof de = {
  title: 'Wiadomości',
  description: 'Wiadomości z formularza kontaktowego',
  tabsLabel: 'Filtruj wiadomości według statusu',
  all: 'Wszystkie',
  loading: 'Ładowanie wiadomości',
  emptyTitle: 'Brak wiadomości',
  emptyFiltered: 'W tym widoku nie ma wiadomości.',
  emptyNone: 'Nie wpłynęły jeszcze żadne wiadomości.',
  noSubject: 'Bez tematu',
  statusToast: (label) => `Status: ${label}`,
  statusOf: (name) => `Status wiadomości od: ${name}`,
  saving: 'Zapisywanie',
  reply: 'Odpowiedz e-mailem',
  status: {
    new: 'Nowa',
    in_progress: 'W realizacji',
    closed: 'Załatwiona',
  },
};

export default defineMessages({ de, en, pl });
