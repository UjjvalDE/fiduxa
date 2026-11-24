import { defineMessages } from '@/lib/i18n/config';

const de = {
  metaTitle: 'So funktioniert es',
  metaDescription:
    'Leistung und Termin wählen, Festpreis sehen, sicher online bezahlen: So läuft eine Buchung bei Fiduxa in Berlin ab.',
  eyebrow: 'So funktioniert es',
  titleBefore: 'Vier Schritte.',
  titleEm: 'Ein fester Preis.',
  lead: 'Bei Fiduxa buchst du deine Reinigung direkt online: freien Termin wählen, Festpreis sehen, sicher bezahlen – und dein Termin steht.',
  stepsHeading: 'Ablauf',
  step: 'Schritt ',
  steps: {
    choose: {
      title: 'Leistung & Termin wählen',
      text: 'Du wählst die Leistung, gibst Fläche, Zustand und Extras an und legst die Stunden fest – wir empfehlen dir eine passende Dauer. Dann suchst du dir einen freien Termin aus unserem Kalender aus.',
      detail: 'Für die Buchung legst du ein Kundenkonto an – so behältst du alle Termine im Blick.',
    },
    price: {
      title: 'Festpreis sehen',
      text: 'Bevor du buchst, siehst du den Endpreis: gebuchte Stunden × Stundensatz, inklusive deiner Extras. Kein Warten auf ein Angebot.',
      detail: 'Vorab ausprobieren kannst du den Preis mit unserem Preisrechner.',
    },
    pay: {
      title: 'Sicher online bezahlen',
      text: (holdMinutes: number) =>
        `Sobald du buchst, wird deine Buchung angelegt und der Termin ${holdMinutes} Minuten für dich reserviert. Du bezahlst sicher mit PayPal.`,
      detail: 'Nach erfolgreicher Zahlung ist dein Termin automatisch bestätigt – die Bestätigung erhältst du per E-Mail.',
    },
    clean: {
      title: 'Reinigung',
      text: 'Zum gebuchten Termin kommt deine Reinigungskraft und arbeitet die gebuchten Leistungen ab. Danach wird der Auftrag abgeschlossen.',
      detail: 'Zugang, Schlüssel oder Besonderheiten trägst du bei der Buchung in die Hinweise ein.',
    },
  },
  afterEyebrow: 'Nach deiner Buchung',
  afterTitleBefore: 'Was dann',
  afterTitleEm: 'passiert.',
  afterLead: 'Den aktuellen Stand deiner Buchung siehst du jederzeit in deinem Kundenkonto.',
  status: {
    payment_pending: (holdMinutes: number) =>
      `Dein Termin ist ${holdMinutes} Minuten für dich reserviert, bis die Zahlung abgeschlossen ist. Wird die Zahlung nicht abgeschlossen, wird der Termin wieder freigegeben.`,
    confirmed: 'Die Zahlung ist eingegangen und dein Termin ist verbindlich eingeplant.',
    completed: 'Die Reinigung ist erledigt und der Auftrag abgeschlossen.',
    cancelled: 'Du hast rechtzeitig storniert – bereits bezahlte Beträge werden automatisch erstattet.',
  },
  invoiceNote:
    'Ist die Online-Zahlung einmal nicht verfügbar, wird deine Buchung direkt bestätigt und du erhältst eine Rechnung.',
  cancelTitle: 'Stornieren & ändern',
  cancelText: (hours: number) =>
    `Bis ${hours} Stunden vor dem Termin kannst du deine Buchung online in deinem Konto stornieren – bereits bezahlte Beträge werden automatisch erstattet. Danach oder für Änderungen schreib uns bitte direkt.`,
  businessTitle: 'Für Unternehmen',
  businessText: 'Gewerbliche Reinigung läuft über eine eigene Angebotsanfrage – bei Bedarf mit Besichtigung vor Ort.',
  businessLink: 'Zur Gewerbeanfrage',
  ctaEyebrow: "Los geht's",
  ctaTitleBefore: 'Starte mit',
  ctaTitleEm: 'deinem Termin.',
  ctaText: 'Freie Termine sofort sehen, Festpreis vor der Buchung, sicher online bezahlen.',
  ctaLabel: 'Termin buchen',
  ctaSecondary: 'Preise ansehen',
};

type Messages = typeof de;

const en: Messages = {
  metaTitle: 'How it works',
  metaDescription: 'Choose your service and slot, see a fixed price, pay securely online: this is how booking with Fiduxa in Berlin works.',
  eyebrow: 'How it works',
  titleBefore: 'Four steps.',
  titleEm: 'One fixed price.',
  lead: 'With Fiduxa you book your cleaning directly online: choose a free slot, see the fixed price, pay securely – and your appointment is set.',
  stepsHeading: 'The process',
  step: 'Step ',
  steps: {
    choose: {
      title: 'Choose service & slot',
      text: 'Choose the service, enter floor space, condition and extras, and set the hours – we recommend a suitable duration. Then pick a free slot from our calendar.',
      detail: 'To book, you create a customer account – so you can keep track of all your appointments.',
    },
    price: {
      title: 'See the fixed price',
      text: 'Before you book, you see the final price: hours booked × hourly rate, including your extras. No waiting for a quotation.',
      detail: 'You can try out the price beforehand with our price calculator.',
    },
    pay: {
      title: 'Pay securely online',
      text: (holdMinutes) =>
        `As soon as you book, your booking is created and the slot is reserved for you for ${holdMinutes} minutes. You pay securely with PayPal.`,
      detail: 'Once the payment has gone through, your booking is confirmed automatically – you receive the confirmation by email.',
    },
    clean: {
      title: 'Cleaning',
      text: 'At the booked time, your cleaner arrives and carries out the booked services. The job is then marked as completed.',
      detail: 'Add access details, keys or anything special to the notes when booking.',
    },
  },
  afterEyebrow: 'After you book',
  afterTitleBefore: 'What happens',
  afterTitleEm: 'next.',
  afterLead: 'You can see the current status of your booking at any time in your customer account.',
  status: {
    payment_pending: (holdMinutes) =>
      `Your slot is reserved for you for ${holdMinutes} minutes until the payment is completed. If the payment is not completed, the slot is released again.`,
    confirmed: 'Your payment has been received and your appointment is firmly scheduled.',
    completed: 'The cleaning is done and the job is completed.',
    cancelled: 'You cancelled in time – any amount already paid is refunded automatically.',
  },
  invoiceNote: 'If online payment is ever unavailable, your booking is confirmed straight away and you receive an invoice.',
  cancelTitle: 'Cancelling & changes',
  cancelText: (hours) =>
    `You can cancel your booking online in your account up to ${hours} hours before the appointment – any amount already paid is refunded automatically. After that, or for changes, please contact us directly.`,
  businessTitle: 'For businesses',
  businessText: 'Commercial cleaning has its own quotation request – with a site visit if needed.',
  businessLink: 'Go to the business request',
  ctaEyebrow: "Let's go",
  ctaTitleBefore: 'Start with',
  ctaTitleEm: 'your appointment.',
  ctaText: 'See free slots instantly, fixed price before you book, pay securely online.',
  ctaLabel: 'Book a cleaning',
  ctaSecondary: 'View prices',
};

const pl: Messages = {
  metaTitle: 'Jak to działa',
  metaDescription: 'Wybierz usługę i termin, zobacz stałą cenę, zapłać bezpiecznie online: tak wygląda rezerwacja w Fiduxa w Berlinie.',
  eyebrow: 'Jak to działa',
  titleBefore: 'Cztery kroki.',
  titleEm: 'Jedna stała cena.',
  lead: 'W Fiduxa rezerwujesz sprzątanie bezpośrednio online: wybierasz wolny termin, widzisz stałą cenę, płacisz bezpiecznie – i termin jest Twój.',
  stepsHeading: 'Przebieg',
  step: 'Krok ',
  steps: {
    choose: {
      title: 'Wybierz usługę i termin',
      text: 'Wybierasz usługę, podajesz metraż, stan i dodatki oraz ustalasz liczbę godzin – polecamy Ci odpowiedni czas trwania. Następnie wybierasz wolny termin z naszego kalendarza.',
      detail: 'Do rezerwacji zakładasz konto klienta – dzięki temu masz wszystkie terminy pod kontrolą.',
    },
    price: {
      title: 'Zobacz stałą cenę',
      text: 'Zanim zarezerwujesz, widzisz cenę końcową: zarezerwowane godziny × stawka godzinowa, łącznie z dodatkami. Bez czekania na ofertę.',
      detail: 'Cenę możesz wcześniej sprawdzić w naszym kalkulatorze cen.',
    },
    pay: {
      title: 'Zapłać bezpiecznie online',
      text: (holdMinutes) =>
        `Gdy tylko zarezerwujesz, tworzymy Twoją rezerwację, a termin jest zarezerwowany dla Ciebie przez ${holdMinutes} minut. Płacisz bezpiecznie przez PayPal.`,
      detail: 'Po udanej płatności Twój termin zostaje automatycznie potwierdzony – potwierdzenie otrzymasz e-mailem.',
    },
    clean: {
      title: 'Sprzątanie',
      text: 'W zarezerwowanym terminie przychodzi osoba sprzątająca i wykonuje zarezerwowane usługi. Następnie zlecenie zostaje zakończone.',
      detail: 'Informacje o dostępie, kluczach lub szczególnych potrzebach wpisujesz w uwagach przy rezerwacji.',
    },
  },
  afterEyebrow: 'Po rezerwacji',
  afterTitleBefore: 'Co dzieje się',
  afterTitleEm: 'dalej.',
  afterLead: 'Aktualny status rezerwacji widzisz w każdej chwili na swoim koncie klienta.',
  status: {
    payment_pending: (holdMinutes) =>
      `Termin jest zarezerwowany dla Ciebie przez ${holdMinutes} minut, aż do zakończenia płatności. Jeśli płatność nie zostanie zakończona, termin zostanie ponownie zwolniony.`,
    confirmed: 'Płatność wpłynęła, a Twój termin jest wiążąco zaplanowany.',
    completed: 'Sprzątanie zostało wykonane, a zlecenie zakończone.',
    cancelled: 'Anulowałeś/-aś w terminie – już zapłacone kwoty są zwracane automatycznie.',
  },
  invoiceNote: 'Jeśli płatność online będzie chwilowo niedostępna, rezerwacja zostanie od razu potwierdzona, a Ty otrzymasz fakturę.',
  cancelTitle: 'Anulowanie i zmiany',
  cancelText: (hours) =>
    `Do ${hours} godzin przed terminem możesz anulować rezerwację online na swoim koncie – już zapłacone kwoty są zwracane automatycznie. Później lub w sprawie zmian napisz do nas bezpośrednio.`,
  businessTitle: 'Dla firm',
  businessText: 'Sprzątanie firm odbywa się na podstawie osobnego zapytania ofertowego – w razie potrzeby z wizją lokalną.',
  businessLink: 'Do zapytania dla firm',
  ctaEyebrow: 'Zaczynamy',
  ctaTitleBefore: 'Zacznij od',
  ctaTitleEm: 'swojego terminu.',
  ctaText: 'Wolne terminy od razu widoczne, stała cena przed rezerwacją, bezpieczna płatność online.',
  ctaLabel: 'Zarezerwuj termin',
  ctaSecondary: 'Zobacz ceny',
};

const howItWorksMessages = defineMessages({ de, en, pl });
export default howItWorksMessages;
