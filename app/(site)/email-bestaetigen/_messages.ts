// Texts of the email confirmation page (/email-bestaetigen?token=…) and the
// "please confirm" banner in the customer account.
import { defineMessages } from '@/lib/i18n/config';

const de = {
  meta: { title: 'E-Mail-Adresse bestätigen' },
  confirming: 'Deine E-Mail-Adresse wird bestätigt…',
  successTitle: 'E-Mail bestätigt',
  successWelcome: (pct: string) => `E-Mail bestätigt – dein persönlicher ${pct}-Code ist unterwegs`,
  successText: 'Danke! Deine E-Mail-Adresse ist jetzt bestätigt.',
  successWelcomeText: 'Wir haben dir deinen persönlichen Code per E-Mail geschickt. Du findest ihn auch in deinem Konto. Gib ihn bei deiner ersten Buchung im Feld „Rabattcode“ ein – er gilt nur für dich und einmalig.',
  bookNow: 'Jetzt buchen',
  toAccount: 'Zu meinem Konto',
  errorTitle: 'Link ungültig oder abgelaufen',
  errorText: 'Dieser Bestätigungslink funktioniert leider nicht mehr. Fordere einfach einen neuen an.',
  missing: 'Der Link ist unvollständig. Bitte öffne ihn direkt aus der E-Mail.',
  resend: 'Neuen Link senden',
  resending: 'Wird gesendet…',
  resent: 'Wir haben dir einen neuen Bestätigungslink geschickt. Schau in dein Postfach.',
  resendFailed: 'Die E-Mail konnte gerade nicht gesendet werden. Bitte versuche es später erneut.',
  alreadyVerified: 'Deine E-Mail-Adresse ist bereits bestätigt.',
  loginForResend: 'Melde dich an, um einen neuen Link anzufordern.',
  login: 'Anmelden',
  banner: {
    title: 'Bitte bestätige deine E-Mail-Adresse',
    textWelcome: (pct: string) => `Dann sparst du ${pct} auf deine erste Reinigung. Den Link haben wir dir per E-Mail geschickt.`,
    text: 'Den Bestätigungslink haben wir dir per E-Mail geschickt.',
    dismiss: 'Hinweis ausblenden',
  },
};

export type VerifyMessages = typeof de;

const en: VerifyMessages = {
  meta: { title: 'Confirm your email address' },
  confirming: 'Confirming your email address…',
  successTitle: 'Email confirmed',
  successWelcome: (pct) => `Email confirmed – your personal ${pct} code is on its way`,
  successText: 'Thank you! Your email address is now confirmed.',
  successWelcomeText: 'We have emailed you your personal code. You also find it in your account. Enter it in the "Promo code" field on your first booking – it only works for you and once.',
  bookNow: 'Book now',
  toAccount: 'Go to my account',
  errorTitle: 'Link invalid or expired',
  errorText: 'This confirmation link no longer works. Simply request a new one.',
  missing: 'The link is incomplete. Please open it directly from the email.',
  resend: 'Send new link',
  resending: 'Sending…',
  resent: 'We have sent you a new confirmation link. Please check your inbox.',
  resendFailed: 'The email could not be sent right now. Please try again later.',
  alreadyVerified: 'Your email address is already confirmed.',
  loginForResend: 'Log in to request a new link.',
  login: 'Log in',
  banner: {
    title: 'Please confirm your email address',
    textWelcome: (pct) => `Then you save ${pct} on your first cleaning. We have sent you the link by email.`,
    text: 'We have sent you the confirmation link by email.',
    dismiss: 'Hide notice',
  },
};

const pl: VerifyMessages = {
  meta: { title: 'Potwierdź adres e-mail' },
  confirming: 'Potwierdzamy Twój adres e-mail…',
  successTitle: 'E-mail potwierdzony',
  successWelcome: (pct) => `E-mail potwierdzony – Twój osobisty kod ${pct} jest w drodze`,
  successText: 'Dziękujemy! Twój adres e-mail jest już potwierdzony.',
  successWelcomeText: 'Wysłaliśmy Ci osobisty kod e-mailem. Znajdziesz go też w swoim koncie. Wpisz go przy pierwszej rezerwacji w polu „Kod rabatowy” – działa tylko dla Ciebie i jednorazowo.',
  bookNow: 'Zarezerwuj teraz',
  toAccount: 'Do mojego konta',
  errorTitle: 'Link nieprawidłowy lub wygasł',
  errorText: 'Ten link potwierdzający już nie działa. Po prostu poproś o nowy.',
  missing: 'Link jest niekompletny. Otwórz go bezpośrednio z e-maila.',
  resend: 'Wyślij nowy link',
  resending: 'Wysyłamy…',
  resent: 'Wysłaliśmy nowy link potwierdzający. Sprawdź skrzynkę.',
  resendFailed: 'Nie udało się teraz wysłać e-maila. Spróbuj ponownie później.',
  alreadyVerified: 'Twój adres e-mail jest już potwierdzony.',
  loginForResend: 'Zaloguj się, aby poprosić o nowy link.',
  login: 'Zaloguj się',
  banner: {
    title: 'Potwierdź swój adres e-mail',
    textWelcome: (pct) => `Wtedy oszczędzisz ${pct} na pierwszym sprzątaniu. Link wysłaliśmy e-mailem.`,
    text: 'Link potwierdzający wysłaliśmy e-mailem.',
    dismiss: 'Ukryj komunikat',
  },
};

export default defineMessages({ de, en, pl });
