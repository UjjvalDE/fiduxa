// Texts of the payment pages (/zahlung/[id], /zahlung/erfolg) and the
// reservation countdown (also used in /konto).
import { defineMessages } from '@/lib/i18n/config';

const de = {
  meta: { pay: 'Bezahlen', status: 'Zahlung' },
  progress: {
    label: 'Fortschritt',
    steps: ['Termin gewählt', 'Bezahlen', 'Bestätigt'] as [string, string, string],
    done: ' (erledigt)',
  },
  loading: 'Zahlung wird vorbereitet…',
  reload: 'Erneut laden',
  backToBooking: 'Zurück zur Buchung',
  toBooking: 'Zur Buchung',
  titlePay: 'Bezahlen',
  titlePaid: 'Zahlung erhalten',
  countdown: {
    label: 'Reserviert noch',
    reservedUntil: (time: string) => `Dein Termin ist bis ${time} Uhr für dich reserviert.`,
    minutesLeft: (n: number) => (n <= 1 ? 'Noch weniger als 1 Minute reserviert.' : `Noch ${n} Minuten reserviert.`),
    expired: 'Die Reservierung ist abgelaufen.',
  },
  pay: {
    cardTitle: 'Zahlungsart',
    cardText:
      'Du bezahlst sicher über PayPal: Du wirst zu PayPal weitergeleitet, bestätigst die Zahlung dort und kommst danach automatisch zu deiner Buchung zurück. Deine Zugangsdaten gibst du nur bei PayPal ein – Fiduxa speichert sie nicht.',
    holdTitle: 'Dein Termin ist reserviert',
    holdText: 'Schließe die Zahlung ab, bevor die Reservierung abläuft – danach wird der Termin wieder freigegeben.',
    button: (amount: string) => `Jetzt bezahlen · ${amount}`,
    redirecting: 'Weiterleitung zur Zahlung…',
    secure: 'Sichere, verschlüsselte Zahlung',
    chooseMethod: 'Bitte wähle eine Zahlungsart.',
    aborted: 'Die Zahlung wurde abgebrochen – es wurde nichts abgebucht. Du kannst es erneut versuchen, solange dein Termin reserviert ist.',
    failed: 'Die letzte Zahlung ist fehlgeschlagen. Bitte versuche es erneut oder wähle eine andere Zahlungsart.',
    unavailableTitle: 'Online-Zahlung gerade nicht möglich',
    unavailableText: 'Die Online-Zahlung ist im Moment nicht verfügbar. Bitte kontaktiere uns – wir helfen dir sofort weiter.',
    contact: 'Kontakt aufnehmen',
  },
  paid: {
    title: 'Bezahlt – vielen Dank!',
    text: (amount: string, date: string | null) =>
      `Wir haben deine Zahlung über ${amount}${date ? ` am ${date}` : ''} erhalten. Dein Termin ist bestätigt – die Bestätigung kommt per E-Mail.`,
  },
  invoice: {
    title: 'Bestätigt – Zahlung per Rechnung',
    text: (amount: string) => `Dein Termin ist bestätigt. Du musst hier nichts bezahlen: Die Rechnung über ${amount} folgt per E-Mail.`,
  },
  processing: {
    title: 'Zahlung in Bearbeitung',
    text: 'Deine Zahlung wurde übermittelt und wird gerade von der Bank bestätigt (bei SEPA-Lastschrift kann das einige Tage dauern). Du musst nichts weiter tun – wir melden uns per E-Mail.',
  },
  expired: {
    title: 'Reservierung abgelaufen',
    text: 'Die Zahlung wurde nicht rechtzeitig abgeschlossen, deshalb haben wir den Termin wieder freigegeben. Es wurde nichts abgebucht.',
    cta: 'Neuen Termin buchen',
  },
  cancelled: {
    title: 'Buchung storniert',
    text: 'Diese Buchung wurde storniert.',
    refunded: 'Der gezahlte Betrag wurde auf dein ursprüngliches Zahlungsmittel erstattet.',
    refundPending: 'Wir erstatten den gezahlten Betrag in Kürze auf dein ursprüngliches Zahlungsmittel.',
  },
  notPayable: {
    title: 'Keine Zahlung nötig',
    text: 'Für diese Buchung ist aktuell keine Online-Zahlung vorgesehen.',
  },
  summary: {
    title: 'Zusammenfassung',
    booking: (reference: string) => `Buchung ${reference}`,
    duration: (hours: string) => `${hours} Reinigung`,
    city: 'Berlin',
    amount: 'Zu zahlen',
    total: 'Preis',
  },
  paypal: {
    confirmingTitle: 'Zahlung wird bestätigt …',
    confirmingText: 'Wir schließen deine PayPal-Zahlung ab. Bitte schließe dieses Fenster nicht.',
    failedTitle: 'PayPal-Zahlung nicht abgeschlossen',
    failedText: 'Es wurde nichts abgebucht. Solange dein Termin reserviert ist, kannst du es noch einmal versuchen – gern auch mit einer anderen Zahlungsart.',
    retry: 'Erneut versuchen',
    expiredTitle: 'Reservierung abgelaufen',
    expiredText: 'Deine Reservierung ist nicht mehr gültig. Es wurde nichts abgebucht.',
    newSlot: 'Neuen Termin buchen',
    errorTitle: 'Zahlung konnte nicht bestätigt werden',
    missing: 'Der Link ist unvollständig – die Zahlung konnte nicht zugeordnet werden.',
    toBooking: 'Zur Buchung',
  },
  success: {
    missing: 'Die Buchung konnte nicht zugeordnet werden.',
    checkingTitle: 'Zahlung wird bestätigt…',
    checkingText: 'Einen Moment bitte, wir warten auf die Bestätigung des Zahlungsanbieters.',
    paidTitle: 'Vielen Dank – Zahlung erhalten!',
    paidText: (amount: string | null, reference: string | null) =>
      `${amount ? `${amount} wurden bezahlt. ` : ''}Dein Termin${reference ? ` (${reference})` : ''} ist bestätigt. Eine Bestätigung ist per E-Mail unterwegs. Deine Reinigungskraft teilen wir automatisch zu – du siehst sie gleich in deinem Konto.`,
    processingTitle: 'Zahlung in Bearbeitung',
    processingText: 'Deine Zahlung wurde übermittelt und wird von der Bank bestätigt. Das kann je nach Zahlungsart etwas dauern.',
    slowText:
      'Die Bestätigung dauert länger als üblich. Du musst nichts erneut bezahlen – sobald die Zahlung eingeht, bekommst du eine E-Mail.',
    errorTitle: 'Status konnte nicht geladen werden',
  },
};

export type PaymentMessages = typeof de;

const en: PaymentMessages = {
  meta: { pay: 'Pay', status: 'Payment' },
  progress: {
    label: 'Progress',
    steps: ['Slot chosen', 'Pay', 'Confirmed'],
    done: ' (done)',
  },
  loading: 'Preparing payment…',
  reload: 'Reload',
  backToBooking: 'Back to booking',
  toBooking: 'Go to booking',
  titlePay: 'Pay',
  titlePaid: 'Payment received',
  countdown: {
    label: 'Reserved for',
    reservedUntil: (time) => `Your slot is reserved for you until ${time}.`,
    minutesLeft: (n) => (n <= 1 ? 'Reserved for less than 1 more minute.' : `Reserved for ${n} more minutes.`),
    expired: 'The reservation has expired.',
  },
  pay: {
    cardTitle: 'Payment method',
    cardText:
      'You pay securely via PayPal: you are redirected to PayPal, confirm the payment there and are brought back to your booking automatically. You only enter your login details at PayPal – Fiduxa does not store them.',
    holdTitle: 'Your slot is reserved',
    holdText: 'Complete the payment before the reservation runs out – after that the slot is released again.',
    button: (amount) => `Pay now · ${amount}`,
    redirecting: 'Redirecting to payment…',
    secure: 'Secure, encrypted payment',
    chooseMethod: 'Please choose a payment method.',
    aborted: 'The payment was cancelled – nothing has been charged. You can try again as long as your slot is reserved.',
    failed: 'The last payment failed. Please try again or choose a different payment method.',
    unavailableTitle: 'Online payment not possible right now',
    unavailableText: 'Online payment is currently unavailable. Please contact us – we will help you right away.',
    contact: 'Contact us',
  },
  paid: {
    title: 'Paid – thank you!',
    text: (amount, date) =>
      `We have received your payment of ${amount}${date ? ` on ${date}` : ''}. Your appointment is confirmed – the confirmation is on its way by email.`,
  },
  invoice: {
    title: 'Confirmed – payment by invoice',
    text: (amount) => `Your appointment is confirmed. You do not need to pay here: the invoice for ${amount} will follow by email.`,
  },
  processing: {
    title: 'Payment processing',
    text: 'Your payment has been submitted and is being confirmed by the bank (SEPA direct debit can take a few days). You do not need to do anything else – we will let you know by email.',
  },
  expired: {
    title: 'Reservation expired',
    text: 'The payment was not completed in time, so we have released the slot again. Nothing has been charged.',
    cta: 'Book a new slot',
  },
  cancelled: {
    title: 'Booking cancelled',
    text: 'This booking has been cancelled.',
    refunded: 'The amount paid has been refunded to your original payment method.',
    refundPending: 'We will refund the amount paid to your original payment method shortly.',
  },
  notPayable: {
    title: 'No payment needed',
    text: 'No online payment is currently required for this booking.',
  },
  summary: {
    title: 'Summary',
    booking: (reference) => `Booking ${reference}`,
    duration: (hours) => `${hours} cleaning`,
    city: 'Berlin',
    amount: 'Amount due',
    total: 'Price',
  },
  paypal: {
    confirmingTitle: 'Confirming payment …',
    confirmingText: 'We are completing your PayPal payment. Please do not close this window.',
    failedTitle: 'PayPal payment not completed',
    failedText: 'Nothing has been charged. As long as your slot is reserved you can try again – with another payment method too, if you like.',
    retry: 'Try again',
    expiredTitle: 'Reservation expired',
    expiredText: 'Your reservation is no longer valid. You have not been charged.',
    newSlot: 'Book a new slot',
    errorTitle: 'Payment could not be confirmed',
    missing: 'The link is incomplete – the payment could not be matched.',
    toBooking: 'Go to booking',
  },
  success: {
    missing: 'The booking could not be identified.',
    checkingTitle: 'Confirming payment…',
    checkingText: 'One moment please, we are waiting for confirmation from the payment provider.',
    paidTitle: 'Thank you – payment received!',
    paidText: (amount, reference) =>
      `${amount ? `${amount} has been paid. ` : ''}Your appointment${reference ? ` (${reference})` : ''} is confirmed. A confirmation is on its way by email. We assign your cleaner automatically – you will see them in your account shortly.`,
    processingTitle: 'Payment processing',
    processingText: 'Your payment has been submitted and is being confirmed by the bank. Depending on the payment method this can take a while.',
    slowText:
      'The confirmation is taking longer than usual. You do not need to pay again – you will receive an email as soon as the payment arrives.',
    errorTitle: 'Status could not be loaded',
  },
};

const pl: PaymentMessages = {
  meta: { pay: 'Płatność', status: 'Płatność' },
  progress: {
    label: 'Postęp',
    steps: ['Termin wybrany', 'Płatność', 'Potwierdzone'],
    done: ' (gotowe)',
  },
  loading: 'Przygotowujemy płatność…',
  reload: 'Odśwież',
  backToBooking: 'Wróć do rezerwacji',
  toBooking: 'Do rezerwacji',
  titlePay: 'Płatność',
  titlePaid: 'Płatność otrzymana',
  countdown: {
    label: 'Rezerwacja jeszcze przez',
    reservedUntil: (time) => `Twój termin jest zarezerwowany do godz. ${time}.`,
    minutesLeft: (n) =>
      n <= 1
        ? 'Rezerwacja wygaśnie za niecałą minutę.'
        : `Rezerwacja jeszcze przez ${n} ${n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'minuty' : 'minut'}.`,
    expired: 'Rezerwacja wygasła.',
  },
  pay: {
    cardTitle: 'Metoda płatności',
    cardText:
      'Płacisz bezpiecznie przez PayPal: zostaniesz przekierowany do PayPal, potwierdzisz tam płatność i automatycznie wrócisz do swojej rezerwacji. Dane logowania podajesz tylko w PayPal – Fiduxa ich nie przechowuje.',
    holdTitle: 'Twój termin jest zarezerwowany',
    holdText: 'Dokończ płatność, zanim rezerwacja wygaśnie – potem termin zostanie ponownie zwolniony.',
    button: (amount) => `Zapłać teraz · ${amount}`,
    redirecting: 'Przekierowanie do płatności…',
    secure: 'Bezpieczna, szyfrowana płatność',
    chooseMethod: 'Wybierz metodę płatności.',
    aborted: 'Płatność została przerwana – nic nie zostało pobrane. Możesz spróbować ponownie, dopóki termin jest zarezerwowany.',
    failed: 'Ostatnia płatność nie powiodła się. Spróbuj ponownie lub wybierz inną metodę płatności.',
    unavailableTitle: 'Płatność online chwilowo niemożliwa',
    unavailableText: 'Płatność online jest obecnie niedostępna. Skontaktuj się z nami – od razu pomożemy.',
    contact: 'Skontaktuj się',
  },
  paid: {
    title: 'Zapłacono – dziękujemy!',
    text: (amount, date) =>
      `Otrzymaliśmy Twoją płatność w wysokości ${amount}${date ? ` (${date})` : ''}. Twój termin jest potwierdzony – potwierdzenie wyślemy e-mailem.`,
  },
  invoice: {
    title: 'Potwierdzone – płatność na fakturę',
    text: (amount) => `Twój termin jest potwierdzony. Nie musisz tu nic płacić: faktura na kwotę ${amount} dotrze e-mailem.`,
  },
  processing: {
    title: 'Płatność w toku',
    text: 'Twoja płatność została przekazana i jest właśnie potwierdzana przez bank (polecenie zapłaty SEPA może potrwać kilka dni). Nie musisz nic więcej robić – poinformujemy Cię e-mailem.',
  },
  expired: {
    title: 'Rezerwacja wygasła',
    text: 'Płatność nie została dokończona na czas, dlatego zwolniliśmy termin. Nic nie zostało pobrane.',
    cta: 'Zarezerwuj nowy termin',
  },
  cancelled: {
    title: 'Rezerwacja anulowana',
    text: 'Ta rezerwacja została anulowana.',
    refunded: 'Zapłacona kwota została zwrócona na Twoją pierwotną metodę płatności.',
    refundPending: 'Wkrótce zwrócimy zapłaconą kwotę na Twoją pierwotną metodę płatności.',
  },
  notPayable: {
    title: 'Płatność nie jest potrzebna',
    text: 'Dla tej rezerwacji płatność online nie jest obecnie przewidziana.',
  },
  summary: {
    title: 'Podsumowanie',
    booking: (reference) => `Rezerwacja ${reference}`,
    duration: (hours) => `${hours} sprzątania`,
    city: 'Berlin',
    amount: 'Do zapłaty',
    total: 'Cena',
  },
  paypal: {
    confirmingTitle: 'Potwierdzamy płatność …',
    confirmingText: 'Finalizujemy Twoją płatność PayPal. Nie zamykaj tego okna.',
    failedTitle: 'Płatność PayPal nie została zakończona',
    failedText: 'Nic nie zostało pobrane. Dopóki termin jest zarezerwowany, możesz spróbować ponownie – także inną metodą płatności.',
    retry: 'Spróbuj ponownie',
    expiredTitle: 'Rezerwacja wygasła',
    expiredText: 'Twoja rezerwacja jest już nieważna. Nic nie zostało pobrane.',
    newSlot: 'Zarezerwuj nowy termin',
    errorTitle: 'Nie udało się potwierdzić płatności',
    missing: 'Link jest niekompletny – nie udało się przypisać płatności.',
    toBooking: 'Do rezerwacji',
  },
  success: {
    missing: 'Nie udało się przypisać rezerwacji.',
    checkingTitle: 'Potwierdzamy płatność…',
    checkingText: 'Chwileczkę, czekamy na potwierdzenie od operatora płatności.',
    paidTitle: 'Dziękujemy – płatność otrzymana!',
    paidText: (amount, reference) =>
      `${amount ? `Zapłacono ${amount}. ` : ''}Twój termin${reference ? ` (${reference})` : ''} jest potwierdzony. Potwierdzenie jest w drodze e-mailem. Osobę sprzątającą przydzielamy automatycznie – zobaczysz ją zaraz na swoim koncie.`,
    processingTitle: 'Płatność w toku',
    processingText: 'Twoja płatność została przekazana i jest potwierdzana przez bank. W zależności od metody płatności może to chwilę potrwać.',
    slowText:
      'Potwierdzenie trwa dłużej niż zwykle. Nie musisz płacić ponownie – gdy płatność dotrze, otrzymasz e-mail.',
    errorTitle: 'Nie udało się wczytać statusu',
  },
};

const messages = defineMessages({ de, en, pl });
export default messages;
