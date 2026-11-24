// Translate API messages (the Express API answers in English) into the UI language.
//
//   const { locale } = useLocale();
//   toast.error(translateApiError(error, locale));
//
// Unknown messages fall back to a generic text in the target language
// (never show raw English server text to German/Polish users).
import { ApiError } from '../api';
import type { Locale } from './config';

type Dict = Record<string, string>;

const DE: Dict = {
  // auth & account
  'Authentication required': 'Bitte melde dich an.',
  'Invalid or expired token': 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
  'Invalid or inactive account': 'Dieses Konto ist nicht aktiv.',
  'Session expired. Please log in again.': 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
  'Invalid email or password': 'E-Mail oder Passwort ist falsch.',
  'This account is inactive': 'Dieses Konto ist deaktiviert.',
  'Invalid login details': 'Bitte prüfe E-Mail und Passwort.',
  'Invalid registration details': 'Bitte prüfe deine Angaben.',
  'An account with this email already exists': 'Für diese E-Mail-Adresse gibt es bereits ein Konto.',
  'An account with this email already exists.': 'Für diese E-Mail-Adresse gibt es bereits ein Konto.',
  'Unable to create account': 'Das Konto konnte nicht erstellt werden.',
  'Unable to log in': 'Die Anmeldung ist fehlgeschlagen.',
  'Current password is incorrect.': 'Das aktuelle Passwort ist falsch.',
  'The reset link is invalid or has expired.': 'Der Link ist ungültig oder abgelaufen.',
  'You do not have permission to access this resource': 'Dafür fehlt dir die Berechtigung.',
  // booking
  'Please check the submitted information.': 'Bitte prüfe deine Angaben.',
  'This time slot is no longer available. Please choose another slot.':
    'Dieser Termin ist leider nicht mehr frei. Bitte wähle einen anderen.',
  'Bookings are possible from tomorrow onwards.': 'Buchungen sind ab morgen möglich.',
  'Please provide a valid date (YYYY-MM-DD).': 'Bitte wähle ein gültiges Datum.',
  'One or more selected extras are not available.': 'Eine Zusatzleistung ist nicht verfügbar.',
  'Duration must be in 30-minute steps.': 'Die Dauer muss in 30-Minuten-Schritten gewählt werden.',
  'Please confirm that the service may start before the withdrawal period ends.':
    'Bitte bestätige den Hinweis zum Leistungsbeginn.',
  'Booking not found.': 'Buchung nicht gefunden.',
  'Invalid booking ID.': 'Buchung nicht gefunden.',
  'This booking has already been paid.': 'Diese Buchung ist bereits bezahlt.',
  'A payment for this booking is already being processed.': 'Deine Zahlung wird bereits verarbeitet.',
  'Your reservation has expired. Please book a new slot.':
    'Deine Reservierung ist abgelaufen. Bitte buche einen neuen Termin.',
  'This booking cannot be paid online.': 'Diese Buchung kann nicht online bezahlt werden.',
  'There is no payable amount for this booking. Please contact us.':
    'Für diese Buchung gibt es keinen zahlbaren Betrag. Bitte kontaktiere uns.',
  'The payment provider is currently unavailable. Please try again later.':
    'Unser Zahlungsanbieter ist gerade nicht erreichbar. Bitte versuche es später erneut.',
  'Online payment is not configured yet. Please contact us to pay by invoice.':
    'Online-Zahlung ist noch nicht verfügbar. Du erhältst eine Rechnung.',
  'Please enter a valid 5-digit postcode.': 'Bitte gib eine gültige 5-stellige Postleitzahl ein.',
  'This postcode is not yet in our service area.': 'Diese Postleitzahl liegt noch nicht in unserem Servicegebiet.',
  'We are available in your area.': 'Gute Nachricht: Wir sind in deinem Gebiet verfügbar.',
  'This postcode is outside our current service area.': 'Diese Postleitzahl liegt außerhalb unseres Servicegebiets.',
  'Please choose a time slot.': 'Bitte wähle einen Termin.',
  'Please accept the privacy notice.': 'Bitte akzeptiere die Datenschutzhinweise.',
  'Too many requests. Please try again later.': 'Zu viele Anfragen. Bitte warte kurz.',
  // worker
  'Invitation is invalid or expired.': 'Die Einladung ist ungültig oder abgelaufen.',
  'Your account is waiting for admin approval.': 'Dein Konto wird noch geprüft.',
  'Please verify your email first.': 'Bitte bestätige zuerst deine E-Mail-Adresse.',
  'Your worker account cannot be updated at this stage.': 'Dein Konto kann gerade nicht bearbeitet werden.',
  'Only confirmed jobs can be started.': 'Nur bestätigte Einsätze können gestartet werden.',
  'Only jobs in progress can be completed.': 'Nur laufende Einsätze können abgeschlossen werden.',
  'This job is not scheduled for today.': 'Dieser Einsatz ist nicht für heute geplant.',
  'Job not found.': 'Einsatz nicht gefunden.',
  // admin
  'Worker must verify email and complete their profile and bank details before approval.':
    'Vor der Freigabe müssen E-Mail, Profil und Bankdaten vollständig sein.',
  'Only workers awaiting review can be reviewed.': 'Nur Reinigungskräfte in Prüfung können bewertet werden.',
  'Only approved workers can be suspended.': 'Nur freigegebene Reinigungskräfte können gesperrt werden.',
  'Only suspended workers can be reactivated.': 'Nur gesperrte Reinigungskräfte können reaktiviert werden.',
  'Approved, active worker not found.': 'Keine freigegebene, aktive Reinigungskraft gefunden.',
  'Workers can only be assigned to confirmed bookings.': 'Reinigungskräfte können nur bestätigten Buchungen zugewiesen werden.',
  'Worker invitation URL is not configured.': 'WORKER_INVITATION_URL ist im Server nicht gesetzt.',
  'No open invitation found for this worker.': 'Keine offene Einladung gefunden.',
  'Only paid payments can be refunded.': 'Nur bezahlte Zahlungen können erstattet werden.',
  'This slot has bookings. Deactivate it instead of deleting it.':
    'Dieser Termin hat Buchungen. Bitte deaktivieren statt löschen.',
  'Slots cannot be created in the past.': 'Termine können nicht in der Vergangenheit angelegt werden.',
  "'to' must be on or after 'from'.": 'Das Enddatum muss nach dem Startdatum liegen.',
  'No dates match the selected weekdays.': 'Im Zeitraum liegen keine der gewählten Wochentage.',
  'End time must be after start time.': 'Die Endzeit muss nach der Startzeit liegen.',
  'Slot not found.': 'Termin nicht gefunden.',
  // profiles, holidays, messages, reviews, payouts, PayPal
  'You are on holiday on that day.': 'An diesem Tag hast du Urlaub eingetragen.',
  'There are pets in this home and your profile says you do not work with pets.': 'In diesem Haushalt gibt es Haustiere – laut deinem Profil arbeitest du nicht mit Haustieren.',
  'This job is outside your working hours.': 'Dieser Auftrag liegt außerhalb deiner Arbeitszeiten.',
  'This worker is on holiday on that day.': 'Die Reinigungskraft hat an diesem Tag Urlaub.',
  'There are pets in this home and this worker does not work with pets.': 'In diesem Haushalt gibt es Haustiere – die Reinigungskraft arbeitet nicht mit Haustieren.',
  'Please upload a JPG, PNG or WebP image.': 'Bitte lade ein JPG-, PNG- oder WebP-Bild hoch.',
  'The image is too large (max. 400 KB).': 'Das Bild ist zu groß (max. 400 KB).',
  'Please choose a valid period.': 'Bitte wähle einen gültigen Zeitraum.',
  'Holidays cannot start in the past.': 'Urlaub kann nicht in der Vergangenheit beginnen.',
  'A holiday can be at most 120 days long.': 'Ein Urlaub kann höchstens 120 Tage lang sein.',
  'Holiday not found.': 'Urlaub nicht gefunden.',
  'This booking is closed. Please contact us.': 'Diese Buchung ist abgeschlossen. Bitte kontaktiere uns.',
  'This conversation is full. Please contact us by phone or email.': 'Dieser Verlauf ist voll. Bitte kontaktiere uns per Telefon oder E-Mail.',
  'You have already rated this cleaning.': 'Du hast diese Reinigung bereits bewertet.',
  'Thank you for your rating.': 'Vielen Dank für deine Bewertung!',
  'Cleaner not found.': 'Reinigungskraft nicht gefunden.',
  'There is nothing to pay out for this cleaner.': 'Für diese Reinigungskraft ist nichts auszuzahlen.',
  'This job has no open payout.': 'Für diesen Auftrag gibt es keine offene Auszahlung.',
  'Review not found.': 'Bewertung nicht gefunden.',
  'PayPal is not configured.': 'PayPal ist nicht eingerichtet.',
  'Payment not found.': 'Zahlung nicht gefunden.',
  'This reservation is no longer valid. You have not been charged.': 'Diese Reservierung ist nicht mehr gültig. Es wurde nichts abgebucht.',
  'Your reservation has expired. Please book a new slot. You have not been charged.': 'Deine Reservierung ist abgelaufen. Bitte buche einen neuen Termin. Es wurde nichts abgebucht.',
  'The payment could not be verified. Please contact us.': 'Die Zahlung konnte nicht bestätigt werden. Bitte kontaktiere uns.',
  'PayPal did not complete the payment. Please try again or choose another payment method.': 'PayPal hat die Zahlung nicht abgeschlossen. Bitte versuche es erneut oder wähle eine andere Zahlungsart.',
  // settings, cash, admins, availability windows
  'Cash payment is not available.': 'Barzahlung ist derzeit nicht möglich.',
  'Please enter the cash amount you received from the customer.': 'Bitte gib den Betrag ein, den du bar erhalten hast.',
  'This booking is not paid in cash.': 'Diese Buchung wird nicht bar bezahlt.',
  'Cash payment recorded.': 'Barzahlung erfasst.',
  'You cannot deactivate your own account.': 'Du kannst dein eigenes Konto nicht deaktivieren.',
  'At least one active admin is required.': 'Es muss mindestens ein aktiver Administrator bleiben.',
  'Admin not found.': 'Administrator nicht gefunden.',
  'This admin is deactivated.': 'Dieser Administrator ist deaktiviert.',
  'Admin added. We emailed a link to set the password.': 'Administrator hinzugefügt. Wir haben einen Link zum Festlegen des Passworts gesendet.',
  'Admin added, but the email could not be sent.': 'Administrator hinzugefügt, aber die E-Mail konnte nicht gesendet werden.',
  'Invitation sent again.': 'Einladung erneut gesendet.',
  'The email could not be sent.': 'Die E-Mail konnte nicht gesendet werden.',
  'Booking is busy right now. Please try again in a moment.': 'Gerade wird viel gebucht. Bitte versuche es gleich noch einmal.',
  'The window cannot end before a booked job ends.': 'Das Zeitfenster kann nicht vor dem Ende eines gebuchten Auftrags enden.',
  'Settings saved.': 'Einstellungen gespeichert.',
  'Minimum must be below maximum.': 'Das Minimum muss kleiner als das Maximum sein.',
  'Minimum and maximum must fit the time steps.': 'Minimum und Maximum müssen zu den Zeitschritten passen.',
  // promotions, gift cards, email verification
  'The confirmation link is invalid or has expired.': 'Der Bestätigungslink ist ungültig oder abgelaufen.',
  'Email address confirmed.': 'E-Mail-Adresse bestätigt.',
  'Your email address is already confirmed.': 'Deine E-Mail-Adresse ist bereits bestätigt.',
  'We have sent you a new confirmation link.': 'Wir haben dir einen neuen Bestätigungslink geschickt.',
  'This offer is no longer available. Please check the price again.': 'Dieses Angebot ist nicht mehr verfügbar. Bitte prüfe den Preis erneut.',
  'The gift card balance has changed. Please check the price again.': 'Das Gutscheinguthaben hat sich geändert. Bitte prüfe den Preis erneut.',
  'The price has changed. Please check the new price.': 'Der Preis hat sich geändert. Bitte prüfe den neuen Preis.',
  'This promotional code cannot be used.': 'Dieser Rabattcode kann nicht verwendet werden.',
  'This gift card cannot be used.': 'Dieser Gutschein kann nicht verwendet werden.',
  'Gift cards are not available at the moment.': 'Gutscheine sind gerade nicht verfügbar.',
  'Please choose a valid gift card amount.': 'Bitte wähle einen gültigen Gutscheinbetrag.',
  'Please choose a delivery date within the next 12 months.': 'Bitte wähle ein Versanddatum innerhalb der nächsten 12 Monate.',
  'Gift card not found.': 'Gutschein nicht gefunden.',
  'This gift card cannot be paid any more.': 'Dieser Gutschein kann nicht mehr bezahlt werden.',
  'This purchase has expired. You have not been charged.': 'Dieser Kauf ist abgelaufen. Es wurde nichts abgebucht.',
  'Promotion not found.': 'Aktion nicht gefunden.',
  'This code is already used by another promotion.': 'Dieser Code wird bereits von einer anderen Aktion verwendet.',
  'There is already an active welcome offer. Deactivate it first.': 'Es gibt bereits ein aktives Willkommensangebot. Bitte deaktiviere es zuerst.',
  'This promotion has already been used. Deactivate it instead of deleting it.': 'Diese Aktion wurde bereits genutzt. Deaktiviere sie, statt sie zu löschen.',
  'Promotion deleted.': 'Aktion gelöscht.',
  'Only active gift cards can be disabled.': 'Nur aktive Gutscheine können gesperrt werden.',
  'This gift card is not disabled.': 'Dieser Gutschein ist nicht gesperrt.',
  'The balance cannot go below zero.': 'Das Guthaben kann nicht unter null fallen.',
  'Unpaid gift cards cannot be adjusted.': 'Unbezahlte Gutscheine können nicht korrigiert werden.',
  'Only paid gift cards can be sent.': 'Nur bezahlte Gutscheine können versendet werden.',
  'Gift card sent.': 'Gutschein versendet.',
  'A percentage cannot be above 100.': 'Ein Prozentsatz kann nicht über 100 liegen.',
  'Fixed discounts are in cents.': 'Feste Rabatte werden in Cent angegeben.',
  'The end must be after the start.': 'Das Ende muss nach dem Start liegen.',
  'Coupons need a code.': 'Gutscheincodes brauchen einen Code.',
  'Use 3–30 letters, numbers, - or _.': 'Verwende 3–30 Buchstaben, Zahlen, - oder _.',
  'Use a path on this site, e.g. /buchung': 'Verwende einen Pfad dieser Website, z. B. /buchung',
  'Use an https image URL.': 'Verwende eine https-Bild-URL.',
  'Enter an amount.': 'Bitte gib einen Betrag ein.',
};

const PL: Dict = {
  'Authentication required': 'Zaloguj się.',
  'Invalid or expired token': 'Sesja wygasła. Zaloguj się ponownie.',
  'Invalid or inactive account': 'To konto jest nieaktywne.',
  'Session expired. Please log in again.': 'Sesja wygasła. Zaloguj się ponownie.',
  'Invalid email or password': 'Nieprawidłowy e-mail lub hasło.',
  'This account is inactive': 'To konto jest dezaktywowane.',
  'Invalid login details': 'Sprawdź e-mail i hasło.',
  'Invalid registration details': 'Sprawdź swoje dane.',
  'An account with this email already exists': 'Konto z tym adresem e-mail już istnieje.',
  'An account with this email already exists.': 'Konto z tym adresem e-mail już istnieje.',
  'Unable to create account': 'Nie udało się utworzyć konta.',
  'Unable to log in': 'Logowanie nie powiodło się.',
  'Current password is incorrect.': 'Obecne hasło jest nieprawidłowe.',
  'The reset link is invalid or has expired.': 'Link jest nieprawidłowy lub wygasł.',
  'You do not have permission to access this resource': 'Brak uprawnień.',
  'Please check the submitted information.': 'Sprawdź wprowadzone dane.',
  'This time slot is no longer available. Please choose another slot.':
    'Ten termin nie jest już dostępny. Wybierz inny.',
  'Bookings are possible from tomorrow onwards.': 'Rezerwacje są możliwe od jutra.',
  'Please provide a valid date (YYYY-MM-DD).': 'Wybierz prawidłową datę.',
  'One or more selected extras are not available.': 'Jedna z usług dodatkowych jest niedostępna.',
  'Duration must be in 30-minute steps.': 'Czas trwania musi być w krokach co 30 minut.',
  'Please confirm that the service may start before the withdrawal period ends.':
    'Potwierdź informację o rozpoczęciu usługi.',
  'Booking not found.': 'Nie znaleziono rezerwacji.',
  'Invalid booking ID.': 'Nie znaleziono rezerwacji.',
  'This booking has already been paid.': 'Ta rezerwacja jest już opłacona.',
  'A payment for this booking is already being processed.': 'Płatność jest już przetwarzana.',
  'Your reservation has expired. Please book a new slot.': 'Rezerwacja wygasła. Zarezerwuj nowy termin.',
  'This booking cannot be paid online.': 'Tej rezerwacji nie można opłacić online.',
  'There is no payable amount for this booking. Please contact us.':
    'Brak kwoty do zapłaty. Skontaktuj się z nami.',
  'The payment provider is currently unavailable. Please try again later.':
    'Operator płatności jest chwilowo niedostępny. Spróbuj później.',
  'Online payment is not configured yet. Please contact us to pay by invoice.':
    'Płatność online nie jest jeszcze dostępna. Otrzymasz fakturę.',
  'Please enter a valid 5-digit postcode.': 'Podaj prawidłowy 5-cyfrowy kod pocztowy.',
  'This postcode is not yet in our service area.': 'Ten kod pocztowy nie jest jeszcze w naszym obszarze działania.',
  'We are available in your area.': 'Dobra wiadomość: działamy w Twojej okolicy.',
  'This postcode is outside our current service area.': 'Ten kod pocztowy jest poza naszym obszarem działania.',
  'Please choose a time slot.': 'Wybierz termin.',
  'Please accept the privacy notice.': 'Zaakceptuj informację o ochronie danych.',
  'Too many requests. Please try again later.': 'Zbyt wiele żądań. Poczekaj chwilę.',
  'Invitation is invalid or expired.': 'Zaproszenie jest nieprawidłowe lub wygasło.',
  'Your account is waiting for admin approval.': 'Twoje konto czeka na zatwierdzenie.',
  'Please verify your email first.': 'Najpierw potwierdź swój adres e-mail.',
  'Your worker account cannot be updated at this stage.': 'Twojego konta nie można teraz edytować.',
  'Only confirmed jobs can be started.': 'Można rozpocząć tylko potwierdzone zlecenia.',
  'Only jobs in progress can be completed.': 'Można zakończyć tylko trwające zlecenia.',
  'This job is not scheduled for today.': 'To zlecenie nie jest zaplanowane na dziś.',
  'Job not found.': 'Nie znaleziono zlecenia.',
  'Worker must verify email and complete their profile and bank details before approval.':
    'Przed zatwierdzeniem e-mail, profil i dane bankowe muszą być kompletne.',
  'Only workers awaiting review can be reviewed.': 'Ocenić można tylko osoby oczekujące na weryfikację.',
  'Only approved workers can be suspended.': 'Zablokować można tylko zatwierdzone osoby.',
  'Only suspended workers can be reactivated.': 'Reaktywować można tylko zablokowane osoby.',
  'Approved, active worker not found.': 'Nie znaleziono zatwierdzonej, aktywnej osoby.',
  'Workers can only be assigned to confirmed bookings.': 'Osoby można przypisać tylko do potwierdzonych rezerwacji.',
  'Worker invitation URL is not configured.': 'WORKER_INVITATION_URL nie jest ustawiony na serwerze.',
  'No open invitation found for this worker.': 'Brak otwartego zaproszenia.',
  'Only paid payments can be refunded.': 'Zwrócić można tylko opłacone płatności.',
  'This slot has bookings. Deactivate it instead of deleting it.':
    'Ten termin ma rezerwacje. Dezaktywuj go zamiast usuwać.',
  'Slots cannot be created in the past.': 'Nie można tworzyć terminów w przeszłości.',
  "'to' must be on or after 'from'.": 'Data końcowa musi być po dacie początkowej.',
  'No dates match the selected weekdays.': 'W wybranym okresie nie ma wybranych dni tygodnia.',
  'End time must be after start time.': 'Godzina zakończenia musi być po godzinie rozpoczęcia.',
  'Slot not found.': 'Nie znaleziono terminu.',
  // profiles, holidays, messages, reviews, payouts, PayPal
  'You are on holiday on that day.': 'W tym dniu masz zaplanowany urlop.',
  'There are pets in this home and your profile says you do not work with pets.': 'W tym domu są zwierzęta – według Twojego profilu nie pracujesz ze zwierzętami.',
  'This job is outside your working hours.': 'To zlecenie jest poza Twoimi godzinami pracy.',
  'This worker is on holiday on that day.': 'Ta osoba ma w tym dniu urlop.',
  'There are pets in this home and this worker does not work with pets.': 'W tym domu są zwierzęta – ta osoba nie pracuje ze zwierzętami.',
  'Please upload a JPG, PNG or WebP image.': 'Prześlij obraz JPG, PNG lub WebP.',
  'The image is too large (max. 400 KB).': 'Obraz jest za duży (maks. 400 KB).',
  'Please choose a valid period.': 'Wybierz prawidłowy okres.',
  'Holidays cannot start in the past.': 'Urlop nie może zaczynać się w przeszłości.',
  'A holiday can be at most 120 days long.': 'Urlop może trwać maksymalnie 120 dni.',
  'Holiday not found.': 'Nie znaleziono urlopu.',
  'This booking is closed. Please contact us.': 'Ta rezerwacja jest zamknięta. Skontaktuj się z nami.',
  'This conversation is full. Please contact us by phone or email.': 'Ta rozmowa jest pełna. Skontaktuj się z nami telefonicznie lub e-mailem.',
  'You have already rated this cleaning.': 'To sprzątanie zostało już ocenione.',
  'Thank you for your rating.': 'Dziękujemy za ocenę!',
  'Cleaner not found.': 'Nie znaleziono osoby sprzątającej.',
  'There is nothing to pay out for this cleaner.': 'Brak kwot do wypłaty dla tej osoby.',
  'This job has no open payout.': 'To zlecenie nie ma otwartej wypłaty.',
  'Review not found.': 'Nie znaleziono opinii.',
  'PayPal is not configured.': 'PayPal nie jest skonfigurowany.',
  'Payment not found.': 'Nie znaleziono płatności.',
  'This reservation is no longer valid. You have not been charged.': 'Ta rezerwacja jest już nieważna. Nie pobrano żadnej opłaty.',
  'Your reservation has expired. Please book a new slot. You have not been charged.': 'Rezerwacja wygasła. Zarezerwuj nowy termin. Nie pobrano żadnej opłaty.',
  'The payment could not be verified. Please contact us.': 'Nie udało się potwierdzić płatności. Skontaktuj się z nami.',
  'PayPal did not complete the payment. Please try again or choose another payment method.': 'PayPal nie zakończył płatności. Spróbuj ponownie lub wybierz inną metodę płatności.',
  // settings, cash, admins, availability windows
  'Cash payment is not available.': 'Płatność gotówką jest obecnie niedostępna.',
  'Please enter the cash amount you received from the customer.': 'Wpisz kwotę otrzymaną w gotówce od klienta.',
  'This booking is not paid in cash.': 'Ta rezerwacja nie jest opłacana gotówką.',
  'Cash payment recorded.': 'Płatność gotówką zapisana.',
  'You cannot deactivate your own account.': 'Nie możesz dezaktywować własnego konta.',
  'At least one active admin is required.': 'Musi pozostać co najmniej jeden aktywny administrator.',
  'Admin not found.': 'Nie znaleziono administratora.',
  'This admin is deactivated.': 'Ten administrator jest dezaktywowany.',
  'Admin added. We emailed a link to set the password.': 'Dodano administratora. Wysłaliśmy link do ustawienia hasła.',
  'Admin added, but the email could not be sent.': 'Dodano administratora, ale nie udało się wysłać e-maila.',
  'Invitation sent again.': 'Zaproszenie wysłane ponownie.',
  'The email could not be sent.': 'Nie udało się wysłać e-maila.',
  'Booking is busy right now. Please try again in a moment.': 'Trwa wiele rezerwacji. Spróbuj ponownie za chwilę.',
  'The window cannot end before a booked job ends.': 'Okno czasowe nie może kończyć się przed końcem zarezerwowanego zlecenia.',
  'Settings saved.': 'Ustawienia zapisane.',
  'Minimum must be below maximum.': 'Minimum musi być mniejsze niż maksimum.',
  'Minimum and maximum must fit the time steps.': 'Minimum i maksimum muszą pasować do kroków czasowych.',
  // promotions, gift cards, email verification
  'The confirmation link is invalid or has expired.': 'Link potwierdzający jest nieprawidłowy lub wygasł.',
  'Email address confirmed.': 'Adres e-mail potwierdzony.',
  'Your email address is already confirmed.': 'Twój adres e-mail jest już potwierdzony.',
  'We have sent you a new confirmation link.': 'Wysłaliśmy nowy link potwierdzający.',
  'This offer is no longer available. Please check the price again.': 'Ta oferta nie jest już dostępna. Sprawdź ponownie cenę.',
  'The gift card balance has changed. Please check the price again.': 'Saldo karty podarunkowej się zmieniło. Sprawdź ponownie cenę.',
  'The price has changed. Please check the new price.': 'Cena się zmieniła. Sprawdź nową cenę.',
  'This promotional code cannot be used.': 'Tego kodu rabatowego nie można użyć.',
  'This gift card cannot be used.': 'Tej karty podarunkowej nie można użyć.',
  'Gift cards are not available at the moment.': 'Karty podarunkowe są obecnie niedostępne.',
  'Please choose a valid gift card amount.': 'Wybierz prawidłową kwotę karty.',
  'Please choose a delivery date within the next 12 months.': 'Wybierz datę wysyłki w ciągu najbliższych 12 miesięcy.',
  'Gift card not found.': 'Nie znaleziono karty podarunkowej.',
  'This gift card cannot be paid any more.': 'Tej karty nie można już opłacić.',
  'This purchase has expired. You have not been charged.': 'Ten zakup wygasł. Nie pobrano opłaty.',
  'Promotion not found.': 'Nie znaleziono promocji.',
  'This code is already used by another promotion.': 'Ten kod jest już używany w innej promocji.',
  'There is already an active welcome offer. Deactivate it first.': 'Istnieje już aktywna oferta powitalna. Najpierw ją dezaktywuj.',
  'This promotion has already been used. Deactivate it instead of deleting it.': 'Ta promocja była już używana. Dezaktywuj ją zamiast usuwać.',
  'Promotion deleted.': 'Promocja usunięta.',
  'Only active gift cards can be disabled.': 'Zablokować można tylko aktywne karty.',
  'This gift card is not disabled.': 'Ta karta nie jest zablokowana.',
  'The balance cannot go below zero.': 'Saldo nie może spaść poniżej zera.',
  'Unpaid gift cards cannot be adjusted.': 'Nieopłaconych kart nie można korygować.',
  'Only paid gift cards can be sent.': 'Wysłać można tylko opłacone karty.',
  'Gift card sent.': 'Karta wysłana.',
  'A percentage cannot be above 100.': 'Procent nie może przekraczać 100.',
  'Fixed discounts are in cents.': 'Stałe rabaty podaje się w centach.',
  'The end must be after the start.': 'Koniec musi być po początku.',
  'Coupons need a code.': 'Kupony wymagają kodu.',
  'Use 3–30 letters, numbers, - or _.': 'Użyj 3–30 liter, cyfr, - lub _.',
  'Use a path on this site, e.g. /buchung': 'Użyj ścieżki tej strony, np. /buchung',
  'Use an https image URL.': 'Użyj adresu obrazu https.',
  'Enter an amount.': 'Wpisz kwotę.',
};

type PatternRule = [RegExp, Record<Locale, (m: RegExpMatchArray) => string>];

const PATTERNS: PatternRule[] = [
  [
    /^Duration must be between (\d+) and (\d+) minutes\./,
    {
      de: (m) => `Die Dauer muss zwischen ${Number(m[1]) / 60} und ${Number(m[2]) / 60} Stunden liegen.`,
      en: (m) => `The duration must be between ${Number(m[1]) / 60} and ${Number(m[2]) / 60} hours.`,
      pl: (m) => `Czas trwania musi wynosić od ${Number(m[1]) / 60} do ${Number(m[2]) / 60} godzin.`,
    },
  ],
  [
    /^Duration must be in (\d+)-minute steps\./,
    {
      de: (m) => `Die Dauer muss in ${m[1]}-Minuten-Schritten gewählt werden.`,
      en: (m) => `The duration must be in ${m[1]}-minute steps.`,
      pl: (m) => `Czas trwania należy wybierać w krokach co ${m[1]} minut.`,
    },
  ],
  [
    /^You have job (\S+) in this period\./,
    {
      de: (m) => `In diesem Zeitraum hast du den Auftrag ${m[1]}. Bitte gib ihn zuerst zurück oder kontaktiere das Büro.`,
      en: (m) => `You have job ${m[1]} in this period. Please hand it back or contact the office first.`,
      pl: (m) => `W tym okresie masz zlecenie ${m[1]}. Najpierw je oddaj lub skontaktuj się z biurem.`,
    },
  ],
  [
    /^Completed cleanings can be rated within (\d+) days\./,
    {
      de: (m) => `Abgeschlossene Reinigungen können innerhalb von ${m[1]} Tagen bewertet werden.`,
      en: (m) => `Completed cleanings can be rated within ${m[1]} days.`,
      pl: (m) => `Zakończone sprzątanie można ocenić w ciągu ${m[1]} dni.`,
    },
  ],
  [
    /^Confirmed bookings can be cancelled online up to (\d+) hours/,
    {
      de: (m) => `Bestätigte Buchungen können bis ${m[1]} Stunden vorher online storniert werden. Bitte kontaktiere uns.`,
      en: (m) => `Confirmed bookings can be cancelled online up to ${m[1]} hours before the appointment. Please contact us.`,
      pl: (m) => `Potwierdzone rezerwacje można anulować online do ${m[1]} godzin przed terminem. Skontaktuj się z nami.`,
    },
  ],
  [
    /^A booking with status "([^"]+)" cannot be cancelled/,
    {
      de: () => 'Diese Buchung kann nicht mehr storniert werden.',
      en: () => 'This booking can no longer be cancelled.',
      pl: () => 'Tej rezerwacji nie można już anulować.',
    },
  ],
  [
    /^Cannot change booking from (\S+) to (\S+)\./,
    {
      de: () => 'Dieser Statuswechsel ist nicht möglich.',
      en: (m) => `Cannot change booking from ${m[1]} to ${m[2]}.`,
      pl: () => 'Ta zmiana statusu nie jest możliwa.',
    },
  ],
  [
    /^This worker is already assigned to (\S+) in the same slot\./,
    {
      de: (m) => `Diese Reinigungskraft ist zur selben Zeit bereits ${m[1]} zugewiesen.`,
      en: (m) => `This cleaner is already assigned to ${m[1]} at the same time.`,
      pl: (m) => `Ta osoba jest już przypisana do ${m[1]} w tym samym czasie.`,
    },
  ],
  [
    /^Capacity cannot be lower than the (\d+) place/,
    {
      de: (m) => `Die Kapazität kann nicht unter ${m[1]} gebuchte Plätze sinken.`,
      en: (m) => `Capacity cannot be lower than the ${m[1]} place(s) already booked.`,
      pl: (m) => `Pojemność nie może być mniejsza niż ${m[1]} zarezerwowanych miejsc.`,
    },
  ],
  [
    /^Too many slots at once \((\d+)\)\. Maximum is (\d+)\./,
    {
      de: (m) => `Zu viele Termine auf einmal (${m[1]}). Maximal ${m[2]}.`,
      en: (m) => `Too many slots at once (${m[1]}). Maximum is ${m[2]}.`,
      pl: (m) => `Za dużo terminów naraz (${m[1]}). Maksymalnie ${m[2]}.`,
    },
  ],
  [
    /^The range can be at most (\d+) days\./,
    {
      de: (m) => `Der Zeitraum darf höchstens ${m[1]} Tage umfassen.`,
      en: (m) => `The range can be at most ${m[1]} days.`,
      pl: (m) => `Okres może obejmować maksymalnie ${m[1]} dni.`,
    },
  ],
  [
    /^Bookings are possible up to (\d+) days in advance\./,
    {
      de: (m) => `Buchungen sind bis zu ${m[1]} Tage im Voraus möglich.`,
      en: (m) => `Bookings are possible up to ${m[1]} days in advance.`,
      pl: (m) => `Rezerwacje są możliwe do ${m[1]} dni wcześniej.`,
    },
  ],
  [
    /^Refund failed: (.*)$/,
    {
      de: (m) => `Erstattung fehlgeschlagen: ${m[1]}`,
      en: (m) => `Refund failed: ${m[1]}`,
      pl: (m) => `Zwrot nie powiódł się: ${m[1]}`,
    },
  ],
];

const GENERIC: Record<Locale, { offline: string; rateLimit: string; server: string; fallback: string }> = {
  de: {
    offline: 'Der Server ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.',
    rateLimit: 'Zu viele Anfragen. Bitte warte kurz und versuche es erneut.',
    server: 'Ein Serverfehler ist aufgetreten. Bitte versuche es später erneut.',
    fallback: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
  },
  en: {
    offline: 'The server cannot be reached right now. Please try again in a moment.',
    rateLimit: 'Too many requests. Please wait a moment and try again.',
    server: 'A server error occurred. Please try again later.',
    fallback: 'Something went wrong. Please try again.',
  },
  pl: {
    offline: 'Serwer jest chwilowo niedostępny. Spróbuj ponownie za chwilę.',
    rateLimit: 'Zbyt wiele żądań. Poczekaj chwilę i spróbuj ponownie.',
    server: 'Wystąpił błąd serwera. Spróbuj ponownie później.',
    fallback: 'Coś poszło nie tak. Spróbuj ponownie.',
  },
};

/** Translate a raw API message (English) into the given language */
export function translateApiMessage(message: string, locale: Locale): string {
  const exact = locale === 'de' ? DE[message] : locale === 'pl' ? PL[message] : undefined;
  if (exact) return exact;
  for (const [pattern, builders] of PATTERNS) {
    const match = message.match(pattern);
    if (match) return builders[locale](match);
  }
  if (locale === 'en') return message;
  return GENERIC[locale].fallback;
}

/** User-facing message for any thrown value, in the given language */
export function translateApiError(error: unknown, locale: Locale): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return GENERIC[locale].offline;
    if (error.status === 429) return GENERIC[locale].rateLimit;
    if (error.status >= 500 && error.status !== 502 && error.status !== 503) return GENERIC[locale].server;
    return translateApiMessage(error.message, locale);
  }
  return GENERIC[locale].fallback;
}
