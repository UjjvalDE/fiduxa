// Customer reviews of cleaners (moderation).
import { defineMessages } from '@/lib/i18n/config';

const de = {
  title: 'Bewertungen',
  description: 'Kundenbewertungen der Reinigungskräfte. Unangemessene Bewertungen können ausgeblendet werden.',
  tabsLabel: 'Bewertungen filtern',
  tabAll: 'Alle',
  tabVisible: 'Sichtbar',
  tabHidden: 'Ausgeblendet',
  loading: 'Bewertungen werden geladen',
  emptyTitle: 'Keine Bewertungen',
  emptyText: 'Bewertungen erscheinen hier, sobald Kundinnen und Kunden abgeschlossene Reinigungen bewerten.',
  hide: 'Ausblenden',
  show: 'Wieder anzeigen',
  hiddenBadge: 'Ausgeblendet',
  hiddenToast: 'Bewertung ausgeblendet.',
  shownToast: 'Bewertung wird wieder angezeigt.',
  noComment: 'Ohne Kommentar',
  by: 'Von',
  forWorker: 'Für',
  booking: 'Buchung',
  hint: 'Ausgeblendete Bewertungen sind öffentlich nicht sichtbar und zählen nicht in die Durchschnittsbewertung.',
  shownOf: (shown: number, total: number) => `${shown} von ${total}`,
};

export type ReviewMessages = typeof de;

const en: ReviewMessages = {
  title: 'Reviews',
  description: 'Customer reviews of cleaners. Inappropriate reviews can be hidden.',
  tabsLabel: 'Filter reviews',
  tabAll: 'All',
  tabVisible: 'Visible',
  tabHidden: 'Hidden',
  loading: 'Loading reviews',
  emptyTitle: 'No reviews',
  emptyText: 'Reviews appear here as soon as customers rate completed cleanings.',
  hide: 'Hide',
  show: 'Show again',
  hiddenBadge: 'Hidden',
  hiddenToast: 'Review hidden.',
  shownToast: 'Review is visible again.',
  noComment: 'No comment',
  by: 'By',
  forWorker: 'For',
  booking: 'Booking',
  hint: 'Hidden reviews are not shown publicly and do not count towards the average rating.',
  shownOf: (shown, total) => `${shown} of ${total}`,
};

const pl: ReviewMessages = {
  title: 'Opinie',
  description: 'Opinie klientów o osobach sprzątających. Niestosowne opinie można ukryć.',
  tabsLabel: 'Filtruj opinie',
  tabAll: 'Wszystkie',
  tabVisible: 'Widoczne',
  tabHidden: 'Ukryte',
  loading: 'Ładowanie opinii',
  emptyTitle: 'Brak opinii',
  emptyText: 'Opinie pojawią się tutaj, gdy klienci ocenią zakończone sprzątania.',
  hide: 'Ukryj',
  show: 'Pokaż ponownie',
  hiddenBadge: 'Ukryta',
  hiddenToast: 'Opinia została ukryta.',
  shownToast: 'Opinia jest ponownie widoczna.',
  noComment: 'Bez komentarza',
  by: 'Od',
  forWorker: 'Dla',
  booking: 'Rezerwacja',
  hint: 'Ukryte opinie nie są widoczne publicznie i nie wliczają się do średniej oceny.',
  shownOf: (shown, total) => `${shown} z ${total}`,
};

const reviewMessages = defineMessages({ de, en, pl });
export default reviewMessages;
