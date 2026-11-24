// Texts for the cleaner card, messages hint and review form on /konto/buchungen/[id]
// and the unread badge in the bookings list. Stat/skill labels come from
// lib/i18n/messages/profile.ts.
import { defineMessages } from '@/lib/i18n/config';

const de = {
  cleaner: {
    viewProfile: 'Profil ansehen',
    reliability: (pct: number) => `${pct} % zuverlässig`,
    photoOf: (name: string) => `Foto von ${name}`,
  },
  pets: {
    petsLabel: 'Haustiere',
    petsYes: 'Ja, im Haushalt',
    petsNo: 'Keine',
  },
  messages: {
    unread: (n: number) => (n === 1 ? '1 neue Nachricht zu deiner Buchung' : `${n} neue Nachrichten zu deiner Buchung`),
    show: 'Ansehen',
    badge: (n: number) => (n === 1 ? '1 neue Nachricht' : `${n} neue Nachrichten`),
  },
  review: {
    title: 'Deine Bewertung',
    intro: (name: string) => `Wie war die Reinigung${name ? ` mit ${name}` : ''}? Deine Bewertung hilft anderen Kund:innen – und deiner Reinigungskraft.`,
    overall: 'Gesamteindruck',
    detailsLegend: 'Im Detail (optional)',
    comment: 'Kommentar',
    commentPlaceholder: 'Was hat dir gefallen, was können wir besser machen?',
    counter: (n: number, max: number) => `${n}/${max}`,
    submit: 'Bewertung abschicken',
    sending: 'Wird gesendet…',
    ratingRequired: 'Bitte vergib eine Gesamtbewertung (1 bis 5 Sterne).',
    tooLong: 'Bitte fasse dich kürzer (maximal 1000 Zeichen).',
    thanksTitle: 'Danke für deine Bewertung!',
    thanksText: 'Dein Feedback ist angekommen und hilft uns, jede Reinigung noch besser zu machen.',
    savedAt: (date: string) => `Bewertet am ${date}`,
    publicNote: 'Dein Vorname und der erste Buchstabe deines Nachnamens erscheinen mit deiner Bewertung im Profil der Reinigungskraft.',
    optional: '(optional)',
  },
};

type FeedbackMessages = typeof de;

const en: FeedbackMessages = {
  cleaner: {
    viewProfile: 'View profile',
    reliability: (pct) => `${pct}% reliable`,
    photoOf: (name) => `Photo of ${name}`,
  },
  pets: {
    petsLabel: 'Pets',
    petsYes: 'Yes, in the home',
    petsNo: 'None',
  },
  messages: {
    unread: (n) => (n === 1 ? '1 new message about your booking' : `${n} new messages about your booking`),
    show: 'View',
    badge: (n) => (n === 1 ? '1 new message' : `${n} new messages`),
  },
  review: {
    title: 'Your review',
    intro: (name) => `How was the cleaning${name ? ` with ${name}` : ''}? Your review helps other customers – and your cleaner.`,
    overall: 'Overall impression',
    detailsLegend: 'In detail (optional)',
    comment: 'Comment',
    commentPlaceholder: 'What did you like, what could we do better?',
    counter: (n, max) => `${n}/${max}`,
    submit: 'Submit review',
    sending: 'Sending…',
    ratingRequired: 'Please give an overall rating (1 to 5 stars).',
    tooLong: 'Please keep it shorter (max. 1000 characters).',
    thanksTitle: 'Thank you for your review!',
    thanksText: 'Your feedback has arrived and helps us make every cleaning even better.',
    savedAt: (date) => `Reviewed on ${date}`,
    publicNote: "Your first name and the first letter of your last name are shown with your review on the cleaner's profile.",
    optional: '(optional)',
  },
};

const pl: FeedbackMessages = {
  cleaner: {
    viewProfile: 'Zobacz profil',
    reliability: (pct) => `Niezawodność ${pct}%`,
    photoOf: (name) => `Zdjęcie: ${name}`,
  },
  pets: {
    petsLabel: 'Zwierzęta',
    petsYes: 'Tak, w domu',
    petsNo: 'Brak',
  },
  messages: {
    unread: (n) => (n === 1 ? '1 nowa wiadomość dotycząca rezerwacji' : `Nowe wiadomości dotyczące rezerwacji: ${n}`),
    show: 'Zobacz',
    badge: (n) => (n === 1 ? '1 nowa wiadomość' : `Nowe wiadomości: ${n}`),
  },
  review: {
    title: 'Twoja ocena',
    intro: (name) => `Jak oceniasz sprzątanie${name ? ` (${name})` : ''}? Twoja opinia pomaga innym klientom – i Twojej osobie sprzątającej.`,
    overall: 'Ogólne wrażenie',
    detailsLegend: 'Szczegóły (opcjonalnie)',
    comment: 'Komentarz',
    commentPlaceholder: 'Co Ci się podobało, co możemy poprawić?',
    counter: (n, max) => `${n}/${max}`,
    submit: 'Wyślij ocenę',
    sending: 'Wysyłanie…',
    ratingRequired: 'Wystaw ocenę ogólną (od 1 do 5 gwiazdek).',
    tooLong: 'Napisz krócej (maks. 1000 znaków).',
    thanksTitle: 'Dziękujemy za ocenę!',
    thanksText: 'Twoja opinia do nas dotarła i pomaga nam jeszcze lepiej sprzątać.',
    savedAt: (date) => `Oceniono ${date}`,
    publicNote: 'Twoje imię i pierwsza litera nazwiska pojawią się przy opinii w profilu osoby sprzątającej.',
    optional: '(opcjonalnie)',
  },
};

export default defineMessages({ de, en, pl });
