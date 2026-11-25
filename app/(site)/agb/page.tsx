import type { Metadata } from 'next';
import Link from 'next/link';

import type { Locale } from '@/lib/i18n/config';
import { getLocale } from '@/lib/i18n/server';
import { COMPANY, CONTACT } from '../_shared/catalogue';
import { LegalPage, P, type LegalSection } from '../_shared/legal';

type Content = { metaTitle: string; title: string; intro: React.ReactNode; sections: LegalSection[] };

const linkClass = 'font-semibold text-pine underline underline-offset-2';

const CONTENT: Record<Locale, () => Content> = {
  de: () => ({
    metaTitle: 'Allgemeine Geschäftsbedingungen',
    title: 'Allgemeine Geschäftsbedingungen (AGB)',
    intro: (
      <p className="m-0">
        Gliederung der AGB für Reinigungsleistungen. Die Inhalte unten beschreiben den tatsächlichen Ablauf der Plattform und müssen rechtlich
        ausformuliert und geprüft werden.
      </p>
    ),
    sections: [
      {
        title: '§ 1 Geltungsbereich',
        body: (
          <p>
            Diese AGB gelten für alle Verträge über Reinigungsleistungen zwischen {COMPANY.name}, {COMPANY.street}, {COMPANY.postcode} {COMPANY.city} und ihren
            Kundinnen und Kunden. <P>Abgrenzung Verbraucher/Unternehmer, Vorrang individueller Vereinbarungen</P>
          </p>
        ),
      },
      {
        title: '§ 2 Leistungsumfang',
        body: (
          <p>
            Der Umfang ergibt sich aus der jeweiligen Leistungsbeschreibung auf der Website und den bei der Buchung gewählten Angaben (Leistung,
            Extras, gebuchte Stunden), bei Gewerbekunden aus dem angenommenen Angebot. Nicht umfasst sind insbesondere Schimmel-, Schädlings- und
            Gefahrstoffbeseitigung, Arbeiten in unsicherer Höhe sowie das Bewegen schwerer Möbel. <P>Vollständige Ausschlüsse je Leistung</P>
          </p>
        ),
      },
      {
        title: '§ 3 Buchung und Vertragsschluss',
        body: (
          <ul>
            <li>
              Haushaltsreinigungen werden online gebucht: Die Kundin bzw. der Kunde wählt Leistung, Angaben zur Wohnung, Extras, die Anzahl der
              Stunden sowie einen freien Termin und sieht vor dem Absenden den Festpreis.
            </li>
            <li>
              Mit dem Absenden der Buchung wird der Termin für eine begrenzte Zeit (derzeit 35 Minuten) reserviert, damit die Zahlung abgeschlossen
              werden kann. Wird die Zahlung in dieser Zeit nicht abgeschlossen, verfällt die Reservierung.
            </li>
            <li>
              Nach erfolgreicher Zahlung wird die Buchung automatisch bestätigt. Ist die Online-Zahlung nicht verfügbar, wird die Buchung direkt
              bestätigt und per Rechnung abgerechnet.
            </li>
            <li>
              Der Vertrag kommt zustande mit <P>rechtlich maßgeblicher Zeitpunkt, z. B. Absenden der Buchung bzw. Buchungsbestätigung</P>.
            </li>
            <li>
              Büro- und Gewerbereinigungen werden über eine Angebotsanfrage vereinbart. <P>Vertragsschluss bei Gewerbekunden, z. B. mit Annahme
              des Angebots</P>
            </li>
          </ul>
        ),
      },
      {
        title: '§ 4 Preise und Zahlung',
        body: (
          <p>
            Es gilt der bei der Buchung angezeigte Festpreis (gebuchte Stunden × Stundensatz einschließlich gewählter Extras, abzüglich etwaiger
            Rabatte), bei Gewerbekunden der im angenommenen Angebot genannte Preis. Die Zahlung erfolgt bei der Buchung online über den
            Zahlungsdienstleister PayPal; ist die Online-Zahlung nicht verfügbar, per Rechnung.{' '}
            Alle angegebenen Preise sind Endpreise und enthalten die gesetzliche Umsatzsteuer von 19 %. Der Preis ist bei der Buchung fällig und wird online über PayPal bezahlt.
          </p>
        ),
      },
      {
        title: '§ 5 Termine, Zugang und Mitwirkung',
        body: (
          <p>
            Die Kundin bzw. der Kunde stellt sicher, dass die Räume zum gebuchten Termin zugänglich sind und Wasser sowie Strom zur Verfügung
            stehen. <P>Regelungen zu Schlüsselübergabe, Material und Folgen bei fehlendem Zugang</P>
          </p>
        ),
      },
      {
        title: '§ 6 Stornierung und Erstattung',
        body: (
          <p>
            Buchungen, deren Zahlung noch aussteht, können jederzeit im Kundenkonto storniert werden. Bestätigte Buchungen können bis 24 Stunden vor
            dem Termin online storniert werden; bereits geleistete Zahlungen werden in diesem Fall automatisch erstattet.{' '}
            Bei einer späteren Stornierung, also innerhalb von 24 Stunden vor dem vereinbarten Beginn, fällt eine Stornogebühr von 20 % des Preises an; der übrige bereits gezahlte Betrag wird erstattet. Dasselbe gilt, wenn die Reinigungskraft zum Termin keinen Zugang zu den Räumen erhält. Weitere Gebühren fallen nicht an. Erstattungen – nach einer Stornierung ebenso wie nach einem Widerruf – erhält die Kundin bzw. der Kunde innerhalb von 7 Werktagen über PayPal zurück.
          </p>
        ),
      },
      {
        title: '§ 7 Mängel und Reklamationen',
        body: (
          <p>
            Ist die Kundin bzw. der Kunde mit einer Reinigung nicht zufrieden, kann sie bzw. er über das Kundenkonto bei der betreffenden Buchung eine Beschwerde einreichen (zum Beispiel zu Qualität, Schäden, Verspätung oder Verhalten), bitte möglichst zeitnah nach dem Termin. Fiduxa prüft jede Beschwerde und informiert über das Ergebnis per E-Mail und im Kundenkonto. Je nach Fall bietet Fiduxa eine kostenlose Nachreinigung, eine teilweise oder vollständige Erstattung oder einen Gutschein an. Gesetzliche Rechte bleiben unberührt.
          </p>
        ),
      },
      {
        title: '§ 8 Haftung',
        body: (
          <p>
            <P>Haftungsregelung – rechtlich prüfen lassen</P>
          </p>
        ),
      },
      {
        title: '§ 9 Widerrufsrecht für Verbraucher',
        body: (
          <p>
            Verbraucherinnen und Verbrauchern steht ein gesetzliches Widerrufsrecht zu. Einzelheiten ergeben sich aus der{' '}
            <Link href="/widerruf" className={linkClass}>
              Widerrufsbelehrung
            </Link>
            .
          </p>
        ),
      },
      {
        title: '§ 10 Schlussbestimmungen',
        body: (
          <p>
            <P>Anwendbares Recht, Gerichtsstand (soweit zulässig), salvatorische Klausel</P>
          </p>
        ),
      },
    ],
  }),
  en: () => ({
    metaTitle: 'Terms and conditions',
    title: 'General terms and conditions',
    intro: (
      <p className="m-0">
        Outline of the terms and conditions for cleaning services. The content below describes how the platform actually works and must be
        legally drafted and reviewed.
      </p>
    ),
    sections: [
      {
        title: '§ 1 Scope',
        body: (
          <p>
            These terms apply to all contracts for cleaning services between {COMPANY.name}, {COMPANY.street}, {COMPANY.postcode} {COMPANY.city} and its customers.{' '}
            <P>distinction between consumers and businesses, precedence of individual agreements</P>
          </p>
        ),
      },
      {
        title: '§ 2 Scope of services',
        body: (
          <p>
            The scope results from the respective service description on the website and the details chosen when booking (service, extras, hours
            booked), and for business customers from the accepted quotation. In particular, mould, pest and hazardous substance removal, work at
            unsafe heights and moving heavy furniture are not included. <P>complete exclusions per service</P>
          </p>
        ),
      },
      {
        title: '§ 3 Booking and conclusion of contract',
        body: (
          <ul>
            <li>
              Household cleaning is booked online: the customer chooses the service, details of the home, extras, the number of hours and a free
              slot, and sees the fixed price before submitting.
            </li>
            <li>
              When the booking is submitted, the slot is reserved for a limited time (currently 35 minutes) so that payment can be completed. If
              payment is not completed within this time, the reservation lapses.
            </li>
            <li>
              Once payment has been completed, the booking is confirmed automatically. If online payment is unavailable, the booking is confirmed
              straight away and invoiced.
            </li>
            <li>
              The contract is concluded upon <P>legally relevant point in time, e.g. submission of the booking or booking confirmation</P>.
            </li>
            <li>
              Office and commercial cleaning is agreed via a quotation request. <P>conclusion of contract for business customers, e.g. upon
              acceptance of the quotation</P>
            </li>
          </ul>
        ),
      },
      {
        title: '§ 4 Prices and payment',
        body: (
          <p>
            The fixed price shown when booking applies (hours booked × hourly rate including selected extras, less any discounts); for business
            customers, the price stated in the accepted quotation. Payment is made online when booking via the payment service provider PayPal; if
            online payment is unavailable, by invoice. All prices shown are final prices and include the statutory VAT of 19 %. The price is due when booking and is paid online via PayPal.
          </p>
        ),
      },
      {
        title: '§ 5 Appointments, access and cooperation',
        body: (
          <p>
            The customer ensures that the premises are accessible at the booked time and that water and electricity are available.{' '}
            <P>rules on key handover, materials and consequences of no access</P>
          </p>
        ),
      },
      {
        title: '§ 6 Cancellation and refund',
        body: (
          <p>
            Bookings whose payment is still pending can be cancelled in the customer account at any time. Confirmed bookings can be cancelled online
            up to 24 hours before the appointment; in this case, any payments already made are refunded automatically.{' '}
            For a later cancellation, i.e. within 24 hours before the agreed start, a cancellation fee of 20 % of the price applies; the rest of any amount already paid is refunded. The same applies if the cleaner cannot access the premises at the appointment. No other fees apply. Refunds – after a cancellation as well as after a withdrawal – are paid back to the customer via PayPal within 7 working days.
          </p>
        ),
      },
      {
        title: '§ 7 Defects and complaints',
        body: (
          <p>
            If the customer is not satisfied with a cleaning, they can submit a complaint for the booking concerned in their customer account (for example about quality, damage, lateness or behaviour), ideally soon after the appointment. Fiduxa reviews every complaint and informs the customer of the outcome by e-mail and in the customer account. Depending on the case, Fiduxa offers a free re-clean, a partial or full refund or a voucher. Statutory rights remain unaffected.
          </p>
        ),
      },
      {
        title: '§ 8 Liability',
        body: (
          <p>
            <P>liability provisions – have them legally reviewed</P>
          </p>
        ),
      },
      {
        title: '§ 9 Right of withdrawal for consumers',
        body: (
          <p>
            Consumers have a statutory right of withdrawal. Details can be found in the{' '}
            <Link href="/widerruf" className={linkClass}>
              withdrawal policy
            </Link>
            .
          </p>
        ),
      },
      {
        title: '§ 10 Final provisions',
        body: (
          <p>
            <P>applicable law, place of jurisdiction (where permitted), severability clause</P>
          </p>
        ),
      },
    ],
  }),
  pl: () => ({
    metaTitle: 'Regulamin',
    title: 'Ogólne warunki handlowe (regulamin)',
    intro: (
      <p className="m-0">
        Struktura ogólnych warunków świadczenia usług sprzątania. Poniższe treści opisują faktyczny przebieg korzystania z platformy i muszą
        zostać prawnie opracowane oraz sprawdzone.
      </p>
    ),
    sections: [
      {
        title: '§ 1 Zakres obowiązywania',
        body: (
          <p>
            Niniejsze warunki obowiązują w odniesieniu do wszystkich umów o usługi sprzątania zawieranych między{' '}
            {COMPANY.name}, {COMPANY.street}, {COMPANY.postcode} {COMPANY.city} a jej klientami. <P>rozróżnienie konsument/przedsiębiorca, pierwszeństwo
            indywidualnych ustaleń</P>
          </p>
        ),
      },
      {
        title: '§ 2 Zakres usług',
        body: (
          <p>
            Zakres wynika z opisu danej usługi na stronie oraz z danych wybranych przy rezerwacji (usługa, dodatki, zarezerwowane godziny), a w
            przypadku klientów biznesowych – z przyjętej oferty. Usługi nie obejmują w szczególności usuwania pleśni, szkodników i substancji
            niebezpiecznych, prac na niebezpiecznej wysokości ani przesuwania ciężkich mebli. <P>pełne wyłączenia dla każdej usługi</P>
          </p>
        ),
      },
      {
        title: '§ 3 Rezerwacja i zawarcie umowy',
        body: (
          <ul>
            <li>
              Sprzątanie domów rezerwuje się online: klient wybiera usługę, dane mieszkania, dodatki, liczbę godzin oraz wolny termin i przed
              wysłaniem widzi stałą cenę.
            </li>
            <li>
              Po wysłaniu rezerwacji termin jest zarezerwowany na ograniczony czas (obecnie 35 minut), aby można było dokończyć płatność. Jeśli
              płatność nie zostanie zakończona w tym czasie, rezerwacja wygasa.
            </li>
            <li>
              Po udanej płatności rezerwacja zostaje automatycznie potwierdzona. Jeśli płatność online jest niedostępna, rezerwacja zostaje od
              razu potwierdzona i rozliczona fakturą.
            </li>
            <li>
              Umowa zostaje zawarta z chwilą <P>prawnie decydujący moment, np. wysłanie rezerwacji lub potwierdzenie rezerwacji</P>.
            </li>
            <li>
              Sprzątanie biur i lokali uzgadnia się na podstawie zapytania ofertowego. <P>zawarcie umowy z klientami biznesowymi, np. z chwilą
              przyjęcia oferty</P>
            </li>
          </ul>
        ),
      },
      {
        title: '§ 4 Ceny i płatność',
        body: (
          <p>
            Obowiązuje stała cena wyświetlona przy rezerwacji (zarezerwowane godziny × stawka godzinowa wraz z wybranymi dodatkami, pomniejszona o
            ewentualne rabaty), a w przypadku klientów biznesowych – cena podana w przyjętej ofercie. Płatność następuje przy rezerwacji online za
            pośrednictwem operatora płatności PayPal; jeśli płatność online jest niedostępna – na podstawie faktury.{' '}
            Wszystkie podane ceny są cenami końcowymi i zawierają ustawowy podatek VAT w wysokości 19 %. Cena jest płatna przy rezerwacji online przez PayPal.
          </p>
        ),
      },
      {
        title: '§ 5 Terminy, dostęp i współdziałanie',
        body: (
          <p>
            Klient zapewnia dostęp do pomieszczeń w zarezerwowanym terminie oraz dostęp do wody i prądu.{' '}
            <P>zasady przekazywania kluczy, materiałów i skutki braku dostępu</P>
          </p>
        ),
      },
      {
        title: '§ 6 Anulowanie i zwrot',
        body: (
          <p>
            Rezerwacje, których płatność jest jeszcze w toku, można w każdej chwili anulować na koncie klienta. Potwierdzone rezerwacje można
            anulować online do 24 godzin przed terminem; w takim przypadku już dokonane płatności są zwracane automatycznie.{' '}
            W przypadku późniejszego anulowania, tj. w ciągu 24 godzin przed uzgodnionym rozpoczęciem, pobierana jest opłata za anulowanie w wysokości 20 % ceny; pozostała część zapłaconej kwoty zostaje zwrócona. To samo dotyczy sytuacji, gdy osoba sprzątająca nie uzyska dostępu do pomieszczeń w terminie. Innych opłat nie ma. Zwroty – zarówno po anulowaniu, jak i po odstąpieniu od umowy – klient otrzymuje przez PayPal w ciągu 7 dni roboczych.
          </p>
        ),
      },
      {
        title: '§ 7 Wady i reklamacje',
        body: (
          <p>
            Jeśli klient nie jest zadowolony ze sprzątania, może złożyć reklamację na swoim koncie klienta przy danej rezerwacji (np. dotyczącą jakości, szkód, spóźnienia lub zachowania), najlepiej niezwłocznie po terminie. Fiduxa rozpatruje każdą reklamację i informuje o wyniku e-mailem oraz na koncie klienta. W zależności od przypadku Fiduxa oferuje bezpłatne ponowne sprzątanie, częściowy lub pełny zwrot albo bon. Ustawowe prawa pozostają nienaruszone.
          </p>
        ),
      },
      {
        title: '§ 8 Odpowiedzialność',
        body: (
          <p>
            <P>zasady odpowiedzialności – wymagają weryfikacji prawnej</P>
          </p>
        ),
      },
      {
        title: '§ 9 Prawo odstąpienia dla konsumentów',
        body: (
          <p>
            Konsumentom przysługuje ustawowe prawo odstąpienia od umowy. Szczegóły zawiera{' '}
            <Link href="/widerruf" className={linkClass}>
              pouczenie o prawie odstąpienia
            </Link>
            .
          </p>
        ),
      },
      {
        title: '§ 10 Postanowienia końcowe',
        body: (
          <p>
            <P>prawo właściwe, sąd właściwy (w zakresie dopuszczalnym), klauzula salwatoryjna</P>
          </p>
        ),
      },
    ],
  }),
};

export function generateMetadata(): Metadata {
  return { title: CONTENT[getLocale()]().metaTitle };
}

export default function AgbPage() {
  const content = CONTENT[getLocale()]();
  return <LegalPage title={content.title} intro={content.intro} sections={content.sections} />;
}
