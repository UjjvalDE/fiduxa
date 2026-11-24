import { defineMessages } from '@/lib/i18n/config';

export interface FaqEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
}

/** Live values from GET /pricing (with fallbacks) used inside the answers */
export interface FaqValues {
  cutoffHours: number;
  holdMinutes: number;
  daysAhead: number;
  areaPerHour: string;
  step: number;
  minimum: string;
}

const de = {
  metaTitle: 'Häufige Fragen',
  metaDescription:
    'Antworten zu Buchung, Festpreis, Online-Zahlung, Stornierung und Erstattung, Leistungsumfang und Datenschutz bei Fiduxa in Berlin.',
  eyebrow: 'FAQ',
  titleBefore: 'Fragen, die',
  titleEm: 'oft',
  titleAfter: 'auftauchen.',
  lead: 'Kurze, ehrliche Antworten zu Buchung, Preisen, Zahlung und Ablauf. Nichts dabei? Schreib uns – wir antworten persönlich.',
  asideTitle: 'Noch Fragen?',
  asideText: 'Wir antworten in der Regel innerhalb von 1–2 Werktagen.',
  asideContact: 'Kontakt aufnehmen',
  asidePrices: 'Preise & Rechner',
  asideHow: 'So funktioniert es',
  search: 'Fragen durchsuchen',
  searchPlaceholder: 'z. B. Stornierung, Zahlung, Schlüssel',
  clearSearch: 'Suche zurücksetzen',
  found: (n: number, total: number) => `${n} von ${total} Fragen gefunden`,
  total: (n: number) => (n === 1 ? '1 Frage' : `${n} Fragen`),
  noResults: 'Zu deiner Suche haben wir leider nichts gefunden.',
  askDirectly: 'Frag uns direkt',
  entries: (v: FaqValues): FaqEntry[] => [
    {
      id: 'buchung-ablauf',
      category: 'Buchung',
      question: 'Wie buche ich eine Reinigung?',
      answer:
        'Ganz einfach online: Du wählst Leistung, Fläche, Zustand, Extras und die Stunden und suchst dir einen freien Termin aus. Dafür legst du ein Kundenkonto an. Du siehst sofort den Festpreis und bezahlst sicher online – danach ist dein Termin automatisch bestätigt.',
    },
    {
      id: 'buchung-verbindlich',
      category: 'Buchung',
      question: 'Wann ist meine Buchung verbindlich?',
      answer:
        'Sobald du gebucht und die Zahlung erfolgreich abgeschlossen hast, ist dein Termin bestätigt. Du erhältst eine Bestätigung per E-Mail und siehst den Termin in deinem Konto.',
    },
    {
      id: 'termine',
      category: 'Buchung',
      question: 'Welche Termine kann ich buchen?',
      answer: `Im Buchungskalender siehst du alle freien Termine, die wir veröffentlicht haben – ab morgen und bis zu ${v.daysAhead} Tage im Voraus. Ausgebuchte Termine kannst du nicht auswählen.`,
    },
    {
      id: 'reservierung',
      category: 'Buchung',
      question: 'Was passiert, wenn ich gebucht, aber noch nicht bezahlt habe?',
      answer: `Mit deiner Buchung wird der Termin ${v.holdMinutes} Minuten lang für dich reserviert. Schließt du die Zahlung in dieser Zeit ab, ist der Termin bestätigt. Andernfalls läuft die Reservierung ab und der Termin wird wieder freigegeben – du kannst dann einfach neu buchen.`,
    },
    {
      id: 'preise-berechnung',
      category: 'Preise',
      question: 'Wie wird der Preis berechnet?',
      answer: `Du zahlst einen einheitlichen Stundensatz für die gebuchten Stunden. Wir empfehlen dir eine Dauer anhand deiner Wohnfläche (Richtwert ca. ${v.areaPerHour} m² pro Stunde), des Zustands und der gewählten Extras – gerundet auf volle ${v.step} Minuten, mindestens ${v.minimum}. Die Stunden kannst du anpassen. Stundensatz und Preisrechner findest du auf der Preisseite.`,
    },
    {
      id: 'festpreis',
      category: 'Preise',
      question: 'Ist der angezeigte Preis ein Festpreis?',
      answer:
        'Ja. Der Preis, den du vor der Buchung siehst, gilt für die gebuchten Stunden und wird mit deiner Buchung gespeichert. Ein separates Angebot gibt es bei Haushaltsreinigungen nicht.',
    },
    {
      id: 'stunden',
      category: 'Preise',
      question: 'Was passiert, wenn ich weniger Stunden als empfohlen buche?',
      answer:
        'Das ist möglich. Gereinigt wird dann in der gebuchten Zeit – eventuell werden nicht alle Aufgaben erledigt. Notiere in den Hinweisen deiner Buchung, was dir am wichtigsten ist.',
    },
    {
      id: 'regelmaessig',
      category: 'Preise',
      question: 'Kann ich regelmäßig buchen?',
      answer:
        'Für die Wohnungsreinigung kannst du einmalig, wöchentlich, alle 2 Wochen oder alle 4 Wochen wählen. Grund- und Umzugsreinigung werden einmalig gebucht. Ob für einen Rhythmus aktuell ein Rabatt gilt, siehst du auf der Preisseite.',
    },
    {
      id: 'zahlung',
      category: 'Zahlung',
      question: 'Wie bezahle ich?',
      answer:
        'Direkt bei der Buchung, sicher online mit PayPal. Du wirst zu PayPal weitergeleitet, bestätigst die Zahlung dort und kommst danach automatisch zurück. Deine Zugangsdaten gibst du nur bei PayPal ein.',
    },
    {
      id: 'rechnung',
      category: 'Zahlung',
      question: 'Kann ich auch per Rechnung bezahlen?',
      answer:
        'Grundsätzlich bezahlst du online bei der Buchung. Ist die Online-Zahlung einmal nicht verfügbar, wird deine Buchung direkt bestätigt und du erhältst eine Rechnung.',
    },
    {
      id: 'stornierung',
      category: 'Stornierung',
      question: 'Kann ich einen Termin stornieren?',
      answer: `Ja. Bis ${v.cutoffHours} Stunden vor dem Termin kannst du deine Buchung online in deinem Konto stornieren. Danach kontaktiere uns bitte direkt.`,
    },
    {
      id: 'erstattung',
      category: 'Stornierung',
      question: 'Bekomme ich mein Geld zurück, wenn ich storniere?',
      answer:
        'Ja. Stornierst du rechtzeitig online, wird ein bereits bezahlter Betrag automatisch erstattet – auf das Zahlungsmittel, mit dem du bezahlt hast. Wann die Gutschrift sichtbar ist, hängt von deiner Bank bzw. deinem Zahlungsanbieter ab.',
    },
    {
      id: 'nicht-enthalten',
      category: 'Leistungen',
      question: 'Was ist nicht enthalten?',
      answer:
        'Nicht zu unseren Leistungen gehören: Schimmelbeseitigung, Schädlingsbekämpfung, der Umgang mit Gefahrstoffen, Außenfenster in Höhe oder andere unsichere Bereiche, Leiter- und Dacharbeiten sowie das Heben oder Verrücken schwerer Möbel. Bei der Umzugsreinigung sind außerdem Renovierungs- und Malerarbeiten sowie die Entsorgung von Möbeln und Sperrmüll ausgeschlossen.',
    },
    {
      id: 'umzug-dauer',
      category: 'Leistungen',
      question: 'Wie lange dauert eine Umzugsreinigung?',
      answer:
        'Das hängt stark vom Zustand der Wohnung ab. Bei der Buchung empfehlen wir dir eine Dauer anhand von Fläche, Zustand und Extras. Wähle den Zustand realistisch und plane im Zweifel lieber etwas mehr Zeit ein.',
    },
    {
      id: 'material',
      category: 'Termine',
      question: 'Muss ich Reinigungsmittel und Material bereitstellen?',
      answer:
        'Was benötigt wird und wer es mitbringt, stimmen wir mit dir ab. Schreib deine Wünsche – etwa zu bestimmten Produkten – gern in die Hinweise deiner Buchung. Bei Gewerbekunden halten wir die Materialfrage im Angebot fest.',
    },
    {
      id: 'schluessel',
      category: 'Termine',
      question: 'Muss ich während der Reinigung zu Hause sein?',
      answer:
        'Nicht unbedingt. Wichtig ist, dass wir zum gebuchten Termin Zugang zur Wohnung haben. Wie das klappt – ob du da bist, ein Schlüssel hinterlegt wird oder jemand öffnet – trägst du bei der Buchung in die Zugangshinweise ein.',
    },
    {
      id: 'servicegebiet',
      category: 'Allgemein',
      question: 'Wo ist Fiduxa verfügbar?',
      answer:
        'Wir reinigen in Berlin. Ob deine Adresse im Servicegebiet liegt, prüfen wir anhand deiner Postleitzahl – direkt auf der Startseite oder bei der Buchung.',
    },
    {
      id: 'notfall',
      category: 'Allgemein',
      question: 'Bietet ihr einen Notfall- oder Sofortservice an?',
      answer:
        'Nein. Termine buchst du frühestens für den nächsten Tag aus unseren freien Zeitfenstern – kurzfristige Noteinsätze bieten wir nicht an. Bei Wasserschäden oder ähnlichen Notfällen wende dich bitte an einen spezialisierten Notdienst.',
    },
    {
      id: 'gewerbe',
      category: 'Unternehmen',
      question: 'Reinigt ihr auch Büros und Gewerbeflächen?',
      answer:
        'Ja. Für Büros, Praxen, Ladengeschäfte und Treppenhäuser gibt es eine eigene Angebotsanfrage statt der Online-Buchung. Wir prüfen die Angaben, vereinbaren bei Bedarf eine Besichtigung und erstellen ein individuelles Angebot.',
    },
    {
      id: 'datenschutz',
      category: 'Datenschutz',
      question: 'Was passiert mit meinen Daten?',
      answer:
        'Wir verwenden deine Angaben, um deine Buchung zu bearbeiten und den Termin durchzuführen. Online-Zahlungen wickelt unser Zahlungsanbieter PayPal ab. Reinigungskräfte sehen nur, was sie für den Einsatz brauchen – etwa Adresse, Telefonnummer und Zugangshinweise, aber keine Preise. Details findest du in unserer Datenschutzerklärung.',
    },
  ],
};

type Messages = typeof de;

const en: Messages = {
  metaTitle: 'Frequently asked questions',
  metaDescription:
    'Answers about booking, fixed prices, online payment, cancellation and refunds, scope of services and data protection at Fiduxa in Berlin.',
  eyebrow: 'FAQ',
  titleBefore: 'Questions that come up',
  titleEm: 'often',
  titleAfter: '.',
  lead: "Short, honest answers about booking, prices, payment and the process. Can't find yours? Write to us – we'll reply personally.",
  asideTitle: 'Still have questions?',
  asideText: 'We usually reply within 1–2 working days.',
  asideContact: 'Get in touch',
  asidePrices: 'Prices & calculator',
  asideHow: 'How it works',
  search: 'Search questions',
  searchPlaceholder: 'e.g. cancellation, payment, keys',
  clearSearch: 'Clear search',
  found: (n, total) => `${n} of ${total} questions found`,
  total: (n) => (n === 1 ? '1 question' : `${n} questions`),
  noResults: "Sorry, we couldn't find anything matching your search.",
  askDirectly: 'Ask us directly',
  entries: (v) => [
    {
      id: 'buchung-ablauf',
      category: 'Booking',
      question: 'How do I book a cleaning?',
      answer:
        'Simply online: choose the service, floor space, condition, extras and hours, and pick a free slot. To do this you create a customer account. You see the fixed price straight away and pay securely online – your booking is then confirmed automatically.',
    },
    {
      id: 'buchung-verbindlich',
      category: 'Booking',
      question: 'When is my booking binding?',
      answer:
        'As soon as you have booked and the payment has gone through, your appointment is confirmed. You receive a confirmation by email and can see the appointment in your account.',
    },
    {
      id: 'termine',
      category: 'Booking',
      question: 'Which slots can I book?',
      answer: `The booking calendar shows all free slots we have published – from tomorrow and up to ${v.daysAhead} days in advance. Fully booked slots cannot be selected.`,
    },
    {
      id: 'reservierung',
      category: 'Booking',
      question: "What happens if I've booked but not paid yet?",
      answer: `When you book, the slot is reserved for you for ${v.holdMinutes} minutes. If you complete the payment within this time, the booking is confirmed. Otherwise the reservation expires and the slot is released again – you can then simply book again.`,
    },
    {
      id: 'preise-berechnung',
      category: 'Prices',
      question: 'How is the price calculated?',
      answer: `You pay one hourly rate for the hours you book. We recommend a duration based on your floor space (guide value approx. ${v.areaPerHour} m² per hour), the condition and the extras you choose – rounded up to the next ${v.step} minutes, with a minimum of ${v.minimum}. You can adjust the hours. You'll find the hourly rate and a price calculator on the prices page.`,
    },
    {
      id: 'festpreis',
      category: 'Prices',
      question: 'Is the price shown a fixed price?',
      answer:
        'Yes. The price you see before booking applies to the hours booked and is saved with your booking. There is no separate quotation for household cleaning.',
    },
    {
      id: 'stunden',
      category: 'Prices',
      question: 'What happens if I book fewer hours than recommended?',
      answer:
        "That's possible. The cleaning then takes place within the booked time – some tasks may not get done. Note in your booking what matters most to you.",
    },
    {
      id: 'regelmaessig',
      category: 'Prices',
      question: 'Can I book regular cleaning?',
      answer:
        'For home cleaning you can choose one-time, weekly, every 2 weeks or every 4 weeks. Deep cleaning and end-of-tenancy cleaning are booked as one-offs. Whether a discount currently applies to a schedule is shown on the prices page.',
    },
    {
      id: 'zahlung',
      category: 'Payment',
      question: 'How do I pay?',
      answer:
        'Right when you book, securely online with PayPal. You are redirected to PayPal, confirm the payment there and are brought back automatically. You only enter your login details at PayPal.',
    },
    {
      id: 'rechnung',
      category: 'Payment',
      question: 'Can I pay by invoice?',
      answer:
        'As a rule, you pay online when you book. If online payment is ever unavailable, your booking is confirmed straight away and you receive an invoice.',
    },
    {
      id: 'stornierung',
      category: 'Cancellation',
      question: 'Can I cancel an appointment?',
      answer: `Yes. You can cancel your booking online in your account up to ${v.cutoffHours} hours before the appointment. After that, please contact us directly.`,
    },
    {
      id: 'erstattung',
      category: 'Cancellation',
      question: 'Do I get my money back if I cancel?',
      answer:
        'Yes. If you cancel online in time, any amount already paid is refunded automatically – to the payment method you used. When the refund shows up depends on your bank or payment provider.',
    },
    {
      id: 'nicht-enthalten',
      category: 'Services',
      question: 'What is not included?',
      answer:
        'Our services do not include: mould removal, pest control, handling hazardous substances, exterior windows at height or other unsafe areas, ladder and roof work, or lifting and moving heavy furniture. End-of-tenancy cleaning also excludes renovation and painting work and the disposal of furniture and bulky waste.',
    },
    {
      id: 'umzug-dauer',
      category: 'Services',
      question: 'How long does end-of-tenancy cleaning take?',
      answer:
        'That depends heavily on the condition of the flat. When booking, we recommend a duration based on floor space, condition and extras. Choose the condition realistically and, if in doubt, plan a little more time.',
    },
    {
      id: 'material',
      category: 'Appointments',
      question: 'Do I need to provide cleaning products and equipment?',
      answer:
        "We'll agree with you on what is needed and who brings it. Feel free to add your wishes – for example about specific products – to the notes of your booking. For business customers, we set out the materials question in the quotation.",
    },
    {
      id: 'schluessel',
      category: 'Appointments',
      question: 'Do I need to be at home during the cleaning?',
      answer:
        "Not necessarily. What matters is that we can access the flat at the booked time. How that works – whether you're there, a key is left or someone lets us in – you add to the access notes when booking.",
    },
    {
      id: 'servicegebiet',
      category: 'General',
      question: 'Where is Fiduxa available?',
      answer:
        'We clean in Berlin. We check whether your address is in our service area using your postcode – directly on the home page or when booking.',
    },
    {
      id: 'notfall',
      category: 'General',
      question: 'Do you offer an emergency or same-day service?',
      answer:
        'No. You can book slots from the next day at the earliest from our free time windows – we do not offer short-notice emergency call-outs. For water damage or similar emergencies, please contact a specialist emergency service.',
    },
    {
      id: 'gewerbe',
      category: 'Businesses',
      question: 'Do you also clean offices and commercial premises?',
      answer:
        'Yes. For offices, practices, shops and stairwells there is a separate quotation request instead of online booking. We review the details, arrange a site visit if needed and prepare a tailored quotation.',
    },
    {
      id: 'datenschutz',
      category: 'Data protection',
      question: 'What happens to my data?',
      answer:
        'We use your details to process your booking and carry out the appointment. Online payments are handled by our payment provider PayPal. Cleaners only see what they need for the job – such as address, phone number and access notes, but no prices. You can find details in our privacy policy.',
    },
  ],
};

const plQuestions = (n: number) => {
  if (n === 1) return 'pytanie';
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'pytania' : 'pytań';
};

const pl: Messages = {
  metaTitle: 'Najczęstsze pytania',
  metaDescription:
    'Odpowiedzi na pytania o rezerwację, stałą cenę, płatność online, anulowanie i zwrot pieniędzy, zakres usług oraz ochronę danych w Fiduxa w Berlinie.',
  eyebrow: 'FAQ',
  titleBefore: 'Pytania, które',
  titleEm: 'często',
  titleAfter: 'się pojawiają.',
  lead: 'Krótkie, szczere odpowiedzi na temat rezerwacji, cen, płatności i przebiegu. Nie ma Twojego pytania? Napisz do nas – odpowiemy osobiście.',
  asideTitle: 'Masz jeszcze pytania?',
  asideText: 'Zwykle odpowiadamy w ciągu 1–2 dni roboczych.',
  asideContact: 'Skontaktuj się z nami',
  asidePrices: 'Ceny i kalkulator',
  asideHow: 'Jak to działa',
  search: 'Szukaj w pytaniach',
  searchPlaceholder: 'np. anulowanie, płatność, klucze',
  clearSearch: 'Wyczyść wyszukiwanie',
  found: (n, total) => `Znaleziono: ${n} z ${total} pytań`,
  total: (n) => `${n} ${plQuestions(n)}`,
  noResults: 'Niestety nic nie znaleźliśmy dla tego wyszukiwania.',
  askDirectly: 'Zapytaj nas bezpośrednio',
  entries: (v) => [
    {
      id: 'buchung-ablauf',
      category: 'Rezerwacja',
      question: 'Jak zarezerwować sprzątanie?',
      answer:
        'Po prostu online: wybierasz usługę, metraż, stan, dodatki i liczbę godzin, a potem wolny termin. Do tego zakładasz konto klienta. Od razu widzisz stałą cenę i płacisz bezpiecznie online – następnie Twój termin zostaje automatycznie potwierdzony.',
    },
    {
      id: 'buchung-verbindlich',
      category: 'Rezerwacja',
      question: 'Kiedy moja rezerwacja jest wiążąca?',
      answer:
        'Gdy tylko zarezerwujesz termin i płatność zostanie pomyślnie zakończona, termin jest potwierdzony. Otrzymasz potwierdzenie e-mailem i zobaczysz termin na swoim koncie.',
    },
    {
      id: 'termine',
      category: 'Rezerwacja',
      question: 'Jakie terminy mogę zarezerwować?',
      answer: `W kalendarzu rezerwacji widzisz wszystkie opublikowane przez nas wolne terminy – od jutra i do ${v.daysAhead} dni naprzód. Terminów w pełni zarezerwowanych nie można wybrać.`,
    },
    {
      id: 'reservierung',
      category: 'Rezerwacja',
      question: 'Co się stanie, jeśli zarezerwuję, ale jeszcze nie zapłacę?',
      answer: `Po rezerwacji termin jest zarezerwowany dla Ciebie przez ${v.holdMinutes} minut. Jeśli w tym czasie zakończysz płatność, termin zostanie potwierdzony. W przeciwnym razie rezerwacja wygaśnie, a termin zostanie ponownie zwolniony – możesz wtedy po prostu zarezerwować jeszcze raz.`,
    },
    {
      id: 'preise-berechnung',
      category: 'Ceny',
      question: 'Jak obliczana jest cena?',
      answer: `Płacisz jedną stawkę godzinową za zarezerwowane godziny. Polecamy czas trwania na podstawie metrażu (wartość orientacyjna ok. ${v.areaPerHour} m² na godzinę), stanu i wybranych dodatków – zaokrąglony w górę do pełnych ${v.step} minut, minimum ${v.minimum}. Liczbę godzin możesz zmienić. Stawkę godzinową i kalkulator znajdziesz na stronie z cenami.`,
    },
    {
      id: 'festpreis',
      category: 'Ceny',
      question: 'Czy wyświetlana cena jest stała?',
      answer:
        'Tak. Cena, którą widzisz przed rezerwacją, dotyczy zarezerwowanych godzin i zostaje zapisana w Twojej rezerwacji. Przy sprzątaniu domów nie ma osobnej oferty.',
    },
    {
      id: 'stunden',
      category: 'Ceny',
      question: 'Co jeśli zarezerwuję mniej godzin, niż polecacie?',
      answer:
        'To możliwe. Sprzątanie odbywa się wtedy w zarezerwowanym czasie – może się zdarzyć, że nie wszystkie zadania zostaną wykonane. Zapisz w uwagach do rezerwacji, co jest dla Ciebie najważniejsze.',
    },
    {
      id: 'regelmaessig',
      category: 'Ceny',
      question: 'Czy mogę rezerwować regularnie?',
      answer:
        'Przy sprzątaniu mieszkania możesz wybrać: jednorazowo, co tydzień, co 2 tygodnie lub co 4 tygodnie. Gruntowne sprzątanie i sprzątanie po przeprowadzce rezerwuje się jednorazowo. Czy dla danego rytmu obowiązuje obecnie rabat, zobaczysz na stronie z cenami.',
    },
    {
      id: 'zahlung',
      category: 'Płatność',
      question: 'Jak mogę zapłacić?',
      answer:
        'Od razu przy rezerwacji, bezpiecznie online przez PayPal. Zostaniesz przekierowany do PayPal, potwierdzisz płatność i automatycznie wrócisz. Dane logowania podajesz tylko w PayPal.',
    },
    {
      id: 'rechnung',
      category: 'Płatność',
      question: 'Czy mogę zapłacić na fakturę?',
      answer:
        'Co do zasady płacisz online przy rezerwacji. Jeśli płatność online będzie chwilowo niedostępna, rezerwacja zostanie od razu potwierdzona, a Ty otrzymasz fakturę.',
    },
    {
      id: 'stornierung',
      category: 'Anulowanie',
      question: 'Czy mogę anulować termin?',
      answer: `Tak. Do ${v.cutoffHours} godzin przed terminem możesz anulować rezerwację online na swoim koncie. Później skontaktuj się z nami bezpośrednio.`,
    },
    {
      id: 'erstattung',
      category: 'Anulowanie',
      question: 'Czy otrzymam zwrot pieniędzy po anulowaniu?',
      answer:
        'Tak. Jeśli anulujesz online w terminie, już zapłacona kwota zostanie automatycznie zwrócona – na środek płatności, którego użyłeś/-aś. Kiedy zwrot będzie widoczny, zależy od Twojego banku lub operatora płatności.',
    },
    {
      id: 'nicht-enthalten',
      category: 'Usługi',
      question: 'Czego nie obejmują usługi?',
      answer:
        'Nasze usługi nie obejmują: usuwania pleśni, zwalczania szkodników, pracy z substancjami niebezpiecznymi, mycia okien zewnętrznych na wysokości ani innych niebezpiecznych miejsc, prac na drabinie i dachu oraz podnoszenia lub przesuwania ciężkich mebli. Przy sprzątaniu po przeprowadzce wyłączone są także prace remontowe i malarskie oraz wywóz mebli i gabarytów.',
    },
    {
      id: 'umzug-dauer',
      category: 'Usługi',
      question: 'Ile trwa sprzątanie po przeprowadzce?',
      answer:
        'To w dużej mierze zależy od stanu mieszkania. Przy rezerwacji polecamy czas trwania na podstawie metrażu, stanu i dodatków. Oceń stan realistycznie i w razie wątpliwości zaplanuj nieco więcej czasu.',
    },
    {
      id: 'material',
      category: 'Terminy',
      question: 'Czy muszę zapewnić środki czystości i sprzęt?',
      answer:
        'Co jest potrzebne i kto to przynosi, ustalamy z Tobą. Swoje życzenia – np. dotyczące konkretnych produktów – możesz wpisać w uwagach do rezerwacji. W przypadku klientów biznesowych kwestię materiałów określamy w ofercie.',
    },
    {
      id: 'schluessel',
      category: 'Terminy',
      question: 'Czy muszę być w domu podczas sprzątania?',
      answer:
        'Niekoniecznie. Ważne, żebyśmy w zarezerwowanym terminie mieli dostęp do mieszkania. Jak to zorganizować – czy będziesz na miejscu, zostawisz klucz, czy ktoś nam otworzy – wpisujesz przy rezerwacji w informacjach o dostępie.',
    },
    {
      id: 'servicegebiet',
      category: 'Ogólne',
      question: 'Gdzie działa Fiduxa?',
      answer:
        'Sprzątamy w Berlinie. Czy Twój adres jest w naszym obszarze działania, sprawdzamy na podstawie kodu pocztowego – bezpośrednio na stronie głównej lub przy rezerwacji.',
    },
    {
      id: 'notfall',
      category: 'Ogólne',
      question: 'Czy oferujecie usługi awaryjne lub natychmiastowe?',
      answer:
        'Nie. Terminy rezerwujesz najwcześniej na następny dzień z naszych wolnych okien czasowych – nie oferujemy pilnych interwencji. W przypadku zalania lub podobnych sytuacji awaryjnych zwróć się do wyspecjalizowanego pogotowia.',
    },
    {
      id: 'gewerbe',
      category: 'Firmy',
      question: 'Czy sprzątacie także biura i lokale usługowe?',
      answer:
        'Tak. Dla biur, gabinetów, sklepów i klatek schodowych zamiast rezerwacji online jest osobne zapytanie ofertowe. Sprawdzamy dane, w razie potrzeby umawiamy wizję lokalną i przygotowujemy indywidualną ofertę.',
    },
    {
      id: 'datenschutz',
      category: 'Ochrona danych',
      question: 'Co dzieje się z moimi danymi?',
      answer:
        'Twoje dane wykorzystujemy do obsługi rezerwacji i realizacji terminu. Płatności online obsługuje nasz operator płatności PayPal. Osoby sprzątające widzą tylko to, czego potrzebują do zlecenia – np. adres, numer telefonu i informacje o dostępie, ale nie ceny. Szczegóły znajdziesz w naszej polityce prywatności.',
    },
  ],
};

const faqMessages = defineMessages({ de, en, pl });
export default faqMessages;
