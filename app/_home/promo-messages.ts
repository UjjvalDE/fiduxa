// Fixed texts around the dynamic homepage promotions and the gift card teaser.
// Campaign titles, texts, codes and percentages always come from the API.
import { defineMessages } from '@/lib/i18n/config';

const de = {
  campaign: {
    until: (date: string) => `Nur bis ${date}`,
    code: 'Dein Code',
    copy: 'Code kopieren',
    copied: 'Kopiert!',
    upTo: (amount: string) => `max. ${amount} Rabatt`,
    minOrder: (amount: string) => `ab ${amount} Bestellwert`,
    off: 'Rabatt',
    imageAlt: 'Aktionsbild',
    firstBooking: 'Für deine erste Buchung',
    offersLabel: 'Aktuelle Angebote',
  },
  gift: {
    eyebrow: 'Gutscheine',
    titleBefore: 'Schenke ein',
    titleEm: 'sauberes Zuhause',
    text: 'Zeit ist das schönste Geschenk: Mit einem Fiduxa-Gutschein schenkst du eine professionelle Reinigung – per E-Mail, sofort oder zum Wunschtermin, mit persönlicher Nachricht.',
    points: ['Betrag frei wählbar', 'Vier Designs', 'Teilweise einlösbar'],
    cta: 'Gutschein verschenken',
    cardAlt: 'Beispiel eines Fiduxa-Gutscheins',
  },
};

export type PromoMessages = typeof de;

const en: PromoMessages = {
  campaign: {
    until: (date) => `Only until ${date}`,
    code: 'Your code',
    copy: 'Copy code',
    copied: 'Copied!',
    upTo: (amount) => `up to ${amount} off`,
    minOrder: (amount) => `orders from ${amount}`,
    off: 'off',
    imageAlt: 'Promotion image',
    firstBooking: 'For your first booking',
    offersLabel: 'Current offers',
  },
  gift: {
    eyebrow: 'Gift cards',
    titleBefore: 'Give a',
    titleEm: 'clean home',
    text: 'Time is the nicest gift: a Fiduxa gift card gives a professional cleaning – by email, right away or on the day you choose, with a personal message.',
    points: ['Any amount you like', 'Four designs', 'Can be used in parts'],
    cta: 'Give a gift card',
    cardAlt: 'Example of a Fiduxa gift card',
  },
};

const pl: PromoMessages = {
  campaign: {
    until: (date) => `Tylko do ${date}`,
    code: 'Twój kod',
    copy: 'Kopiuj kod',
    copied: 'Skopiowano!',
    upTo: (amount) => `maks. ${amount} rabatu`,
    minOrder: (amount) => `od ${amount} wartości zamówienia`,
    off: 'rabatu',
    imageAlt: 'Zdjęcie promocji',
    firstBooking: 'Na pierwszą rezerwację',
    offersLabel: 'Aktualne oferty',
  },
  gift: {
    eyebrow: 'Karty podarunkowe',
    titleBefore: 'Podaruj',
    titleEm: 'czysty dom',
    text: 'Czas to najpiękniejszy prezent: karta podarunkowa Fiduxa to profesjonalne sprzątanie – e-mailem, od razu lub w wybranym dniu, z osobistą wiadomością.',
    points: ['Dowolna kwota', 'Cztery wzory', 'Można wykorzystać częściowo'],
    cta: 'Podaruj kartę',
    cardAlt: 'Przykład karty podarunkowej Fiduxa',
  },
};

export default defineMessages({ de, en, pl });
