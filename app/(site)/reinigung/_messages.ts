import { defineMessages } from '@/lib/i18n/config';

const de = {
  title: (d: string) => `Wohnungsreinigung in ${d}`,
  metaTitle: (d: string) => `Wohnungsreinigung in ${d} | Fiduxa`,
  metaDescription: (d: string) => `Geprüfte Reinigungskräfte für ${d}: Wohnungsreinigung, Grundreinigung und Umzugsreinigung zum festen Stundenpreis. Jetzt online buchen.`,
  eyebrow: 'Berlin',
  rating: (avg: string, count: string) => `${avg} von 5 Sternen aus ${count} Bewertungen`,
  servicesTitle: 'Unsere Leistungen',
  perHour: (price: string) => `ab ${price} pro Stunde`,
  faqTitle: 'Häufige Fragen',
  faq: [
    { q: 'Wie schnell bekomme ich einen Termin?', a: 'Du siehst direkt bei der Buchung alle freien Tage und Uhrzeiten und wählst den Termin, der für dich passt.' },
    { q: 'Was kostet die Reinigung?', a: 'Du zahlst einen festen Stundenpreis inklusive Umsatzsteuer. Die empfohlene Dauer berechnen wir aus Größe und Zustand, du kannst sie anpassen.' },
    { q: 'Muss ich Putzmittel stellen?', a: 'Nein, die Reinigungskraft bringt alles Nötige mit.' },
  ],
  cta: 'Jetzt in Berlin buchen',
  genericIntro: (d: string) => `Fiduxa vermittelt geprüfte Reinigungskräfte in ${d}.`,
};

export type DistrictMessages = typeof de;

const en: DistrictMessages = {
  title: (d) => `Home cleaning in ${d}`,
  metaTitle: (d) => `Home cleaning in ${d} | Fiduxa`,
  metaDescription: (d) => `Vetted cleaners for ${d}: home cleaning, deep cleaning and move-out cleaning at a fixed hourly price. Book online.`,
  eyebrow: 'Berlin',
  rating: (avg, count) => `${avg} out of 5 stars from ${count} reviews`,
  servicesTitle: 'Our services',
  perHour: (price) => `from ${price} per hour`,
  faqTitle: 'Frequently asked questions',
  faq: [
    { q: 'How soon can I get an appointment?', a: 'When you book you see all free days and times and choose the one that suits you.' },
    { q: 'How much does it cost?', a: 'You pay a fixed hourly price including VAT. We recommend a duration based on size and condition, and you can adjust it.' },
    { q: 'Do I need to provide cleaning supplies?', a: 'No, your cleaner brings everything needed.' },
  ],
  cta: 'Book in Berlin now',
  genericIntro: (d) => `Fiduxa connects you with vetted cleaners in ${d}.`,
};

const pl: DistrictMessages = {
  title: (d) => `Sprzątanie mieszkań: ${d}`,
  metaTitle: (d) => `Sprzątanie mieszkań: ${d} | Fiduxa`,
  metaDescription: (d) => `Sprawdzone osoby sprzątające dla dzielnicy ${d}: sprzątanie mieszkań, gruntowne i po przeprowadzce za stałą cenę godzinową. Zarezerwuj online.`,
  eyebrow: 'Berlin',
  rating: (avg, count) => `${avg} na 5 gwiazdek z ${count} opinii`,
  servicesTitle: 'Nasze usługi',
  perHour: (price) => `od ${price} za godzinę`,
  faqTitle: 'Często zadawane pytania',
  faq: [
    { q: 'Jak szybko dostanę termin?', a: 'Podczas rezerwacji widzisz wszystkie wolne dni i godziny i wybierasz dogodny termin.' },
    { q: 'Ile to kosztuje?', a: 'Płacisz stałą cenę godzinową z VAT. Zalecany czas wyliczamy z wielkości i stanu mieszkania, możesz go zmienić.' },
    { q: 'Czy muszę zapewnić środki czystości?', a: 'Nie, osoba sprzątająca przynosi wszystko, co potrzebne.' },
  ],
  cta: 'Zarezerwuj w Berlinie',
  genericIntro: (d) => `Fiduxa łączy Cię ze sprawdzonymi osobami sprzątającymi w dzielnicy ${d}.`,
};

export default defineMessages({ de, en, pl });
