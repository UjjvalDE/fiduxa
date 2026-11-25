// Texts of the public cleaner pages (/reinigungskraefte, /reinigungskraefte/[id]).
// Skill, language and stat labels come from lib/i18n/messages/profile.ts.
import { defineMessages } from '@/lib/i18n/config';

const de = {
  meta: {
    title: 'Unsere Reinigungskräfte in Berlin',
    description:
      'Lerne die Reinigungskräfte von Fiduxa kennen: Fotos, Stärken wie Fenster, Wäsche und Bügeln, Einsatzgebiete, echte Bewertungen und Zuverlässigkeit.',
    profileTitle: 'Profil einer Reinigungskraft',
    profileDescription: 'Stärken, Einsatzgebiete, Bewertungen und Zuverlässigkeit dieser Fiduxa-Reinigungskraft.',
  },
  hero: {
    eyebrow: 'Unser Team',
    titleBefore: 'Die Menschen hinter',
    titleEm: 'deiner sauberen Wohnung',
    lead: 'Alle Reinigungskräfte sind persönlich geprüft. Hier siehst du, was sie besonders gut können, wo sie unterwegs sind und wie zufrieden andere Kund:innen waren.',
  },
  filters: {
    label: 'Reinigungskräfte filtern',
    skill: 'Stärke',
    anySkill: 'Alle Stärken',
    district: 'Bezirk',
    anyDistrict: 'Alle Bezirke',
    pets: 'Haustiere ok',
    reset: 'Filter zurücksetzen',
    results: (n: number) => (n === 1 ? '1 Reinigungskraft' : `${n} Reinigungskräfte`),
  },
  loading: 'Reinigungskräfte werden geladen…',
  empty: 'Gerade passt niemand zu deinen Filtern.',
  emptyAll: 'Unser Team stellt sich hier bald vor.',
  emptyHint: 'Buche trotzdem – wir finden die passende Reinigungskraft für deinen Termin.',
  card: {
    profileSr: (name: string) => `Profil von ${name} ansehen`,
    more: (n: number) => `+${n}`,
    areas: 'Unterwegs in',
    view: 'Profil ansehen',
  },
  howItWorks:
    'Du buchst Termin und Leistung – nach der Zahlung teilen wir automatisch die passendste freie Reinigungskraft aus deiner Nähe zu. Ihr Profil siehst du sofort in deinem Konto.',
  cta: {
    eyebrow: 'Bereit?',
    titleBefore: 'Festpreis sehen und',
    titleEm: 'direkt buchen',
    text: 'In drei Schritten zum Termin – sicher bezahlen mit PayPal.',
    button: 'Jetzt buchen',
  },
  profile: {
    back: 'Zu meinen Buchungen',
    notFoundTitle: 'Profil nicht gefunden',
    notFoundText: 'Diese Reinigungskraft gibt es nicht (mehr) oder ihr Profil ist nicht öffentlich.',
    about: (name: string) => `Über ${name}`,
    noBio: 'Noch keine Beschreibung.',
    statsTitle: 'Bewertungen & Verlässlichkeit',
    jobsLabel: 'Erledigte Reinigungen',
    noData: 'Noch keine Daten',
    reviewsTitle: 'Bewertungen',
    noReviews: 'Noch keine Bewertungen – vielleicht bist du die erste Person?',
    anonymous: 'Kund:in',
    bookTitle: 'Bereit für deine saubere Wohnung?',
    bookText: 'Buche deinen Termin – wir vergeben ihn an eine passende Reinigungskraft aus deinem Bezirk.',
    bookButton: 'Jetzt buchen',
    details: 'Details',
  },
  error: 'Die Profile konnten nicht geladen werden.',
  retry: 'Erneut versuchen',
};

type CleanersMessages = typeof de;

const en: CleanersMessages = {
  meta: {
    title: 'Our cleaners in Berlin',
    description:
      'Meet the Fiduxa cleaners: photos, strengths such as windows, laundry and ironing, work areas, real reviews and reliability.',
    profileTitle: 'Cleaner profile',
    profileDescription: 'Strengths, work areas, reviews and reliability of this Fiduxa cleaner.',
  },
  hero: {
    eyebrow: 'Our team',
    titleBefore: 'The people behind',
    titleEm: 'your clean home',
    lead: 'Every cleaner is vetted in person. See what they are especially good at, where they work and how happy other customers were.',
  },
  filters: {
    label: 'Filter cleaners',
    skill: 'Strength',
    anySkill: 'All strengths',
    district: 'District',
    anyDistrict: 'All districts',
    pets: 'Happy with pets',
    reset: 'Reset filters',
    results: (n) => (n === 1 ? '1 cleaner' : `${n} cleaners`),
  },
  loading: 'Loading cleaners…',
  empty: 'Nobody matches your filters right now.',
  emptyAll: 'Our team will introduce itself here soon.',
  emptyHint: 'Book anyway – we will find the right cleaner for your appointment.',
  card: {
    profileSr: (name) => `View ${name}'s profile`,
    more: (n) => `+${n}`,
    areas: 'Works in',
    view: 'View profile',
  },
  howItWorks:
    'You book the date and service – after payment we automatically assign the best-matching available cleaner near you. You see their profile in your account right away.',
  cta: {
    eyebrow: 'Ready?',
    titleBefore: 'See your fixed price and',
    titleEm: 'book right away',
    text: 'Three steps to your appointment – pay securely with PayPal.',
    button: 'Book now',
  },
  profile: {
    back: 'To my bookings',
    notFoundTitle: 'Profile not found',
    notFoundText: 'This cleaner does not exist (any more) or their profile is not public.',
    about: (name) => `About ${name}`,
    noBio: 'No description yet.',
    statsTitle: 'Reviews & reliability',
    jobsLabel: 'Cleanings completed',
    noData: 'No data yet',
    reviewsTitle: 'Reviews',
    noReviews: 'No reviews yet – maybe you will be the first?',
    anonymous: 'Customer',
    bookTitle: 'Ready for your clean home?',
    bookText: 'Book your appointment – we assign it to a suitable cleaner from your district.',
    bookButton: 'Book now',
    details: 'Details',
  },
  error: 'The profiles could not be loaded.',
  retry: 'Try again',
};

const pl: CleanersMessages = {
  meta: {
    title: 'Nasz zespół sprzątający w Berlinie',
    description:
      'Poznaj osoby sprzątające Fiduxa: zdjęcia, mocne strony jak okna, pranie i prasowanie, obszary pracy, prawdziwe opinie i niezawodność.',
    profileTitle: 'Profil osoby sprzątającej',
    profileDescription: 'Mocne strony, obszary pracy, opinie i niezawodność tej osoby sprzątającej Fiduxa.',
  },
  hero: {
    eyebrow: 'Nasz zespół',
    titleBefore: 'Ludzie, dzięki którym',
    titleEm: 'Twój dom lśni',
    lead: 'Każda osoba sprzątająca jest sprawdzona osobiście. Zobacz, w czym jest szczególnie dobra, gdzie pracuje i jak zadowoleni byli inni klienci.',
  },
  filters: {
    label: 'Filtruj osoby sprzątające',
    skill: 'Mocna strona',
    anySkill: 'Wszystkie',
    district: 'Dzielnica',
    anyDistrict: 'Wszystkie dzielnice',
    pets: 'Zwierzęta ok',
    reset: 'Wyczyść filtry',
    results: (n) => (n === 1 ? '1 osoba' : `Osoby: ${n}`),
  },
  loading: 'Ładowanie…',
  empty: 'Nikt nie pasuje teraz do Twoich filtrów.',
  emptyAll: 'Nasz zespół wkrótce się tu przedstawi.',
  emptyHint: 'Zarezerwuj mimo to – znajdziemy odpowiednią osobę na Twój termin.',
  card: {
    profileSr: (name) => `Zobacz profil: ${name}`,
    more: (n) => `+${n}`,
    areas: 'Pracuje w',
    view: 'Zobacz profil',
  },
  howItWorks:
    'Rezerwujesz termin i usługę – po płatności automatycznie przydzielamy najlepiej dopasowaną wolną osobę z okolicy. Jej profil zobaczysz od razu na swoim koncie.',
  cta: {
    eyebrow: 'Gotowe?',
    titleBefore: 'Zobacz stałą cenę i',
    titleEm: 'zarezerwuj od razu',
    text: 'Trzy kroki do terminu – bezpieczna płatność przez PayPal.',
    button: 'Zarezerwuj',
  },
  profile: {
    back: 'Do moich rezerwacji',
    notFoundTitle: 'Nie znaleziono profilu',
    notFoundText: 'Ta osoba sprzątająca nie istnieje (już) lub jej profil nie jest publiczny.',
    about: (name) => `O mnie: ${name}`,
    noBio: 'Brak opisu.',
    statsTitle: 'Opinie i niezawodność',
    jobsLabel: 'Wykonane sprzątania',
    noData: 'Brak danych',
    reviewsTitle: 'Opinie',
    noReviews: 'Brak opinii – może będziesz pierwszą osobą?',
    anonymous: 'Klient',
    bookTitle: 'Gotowe na czyste mieszkanie?',
    bookText: 'Zarezerwuj termin – przydzielimy go odpowiedniej osobie z Twojej dzielnicy.',
    bookButton: 'Zarezerwuj',
    details: 'Szczegóły',
  },
  error: 'Nie udało się wczytać profili.',
  retry: 'Spróbuj ponownie',
};

export default defineMessages({ de, en, pl });
