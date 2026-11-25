import type { Metadata } from 'next';

import type { Locale } from '@/lib/i18n/config';
import { getLocale } from '@/lib/i18n/server';
import { COMPANY, CONTACT } from '../_shared/catalogue';
import { LegalPage, P, type LegalSection } from '../_shared/legal';

type Content = { title: string; intro: React.ReactNode; sections: LegalSection[] };

const CONTENT: Record<Locale, () => Content> = {
  de: () => ({
    title: 'Datenschutzerklärung',
    intro: (
      <p className="m-0">
        Mit dieser Erklärung informieren wir darüber, welche personenbezogenen Daten wir bei der Nutzung dieser Website und unserer Leistungen
        verarbeiten. Die folgenden Abschnitte bilden die Struktur ab und sind vor Livegang vollständig auszuformulieren.
      </p>
    ),
    sections: [
      {
        title: 'Verantwortliche Stelle',
        body: (
          <p>
            {COMPANY.name}, {COMPANY.street}, {COMPANY.postcode} {COMPANY.city}, E-Mail: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>, Telefon: <a href={CONTACT.phoneHref}>{CONTACT.phoneDisplay}</a>
          </p>
        ),
      },
      {
        title: 'Datenschutzbeauftragte/r',
        body: (
          <p>
            <P>Kontaktdaten der/des Datenschutzbeauftragten, sofern eine Benennungspflicht besteht – andernfalls Abschnitt entfernen</P>
          </p>
        ),
      },
      {
        title: 'Welche Daten wir verarbeiten',
        body: (
          <>
            <p>Je nach Nutzung verarbeiten wir insbesondere:</p>
            <ul>
              <li>Kontodaten: Name, E-Mail-Adresse, Telefonnummer, Passwort (verschlüsselt gespeichert), gewählte Sprache</li>
              <li>Buchungsdaten: Adresse, Postleitzahl, Fläche, Zustand, Extras, gebuchte Stunden, Termin, Zugangshinweise, Anmerkungen</li>
              <li>Preis-, Zahlungs- und Statusdaten zu deinen Buchungen (z. B. Festpreis, Zahlungsstatus, Stornierungen und Erstattungen)</li>
              <li>Kontaktanfragen: Name, E-Mail, optional Telefon und Betreff, Nachricht</li>
              <li>Gewerbeanfragen: Unternehmens-, Kontakt- und Objektdaten</li>
              <li>Bewerbungen als Reinigungskraft: Kontaktdaten, Antworten im Bewerbungsformular, optional Lebenslauf</li>
              <li>Technische Daten beim Aufruf der Website (z. B. Server-Logfiles)</li>
            </ul>
            <p>
              <P>Vollständigkeit der Aufzählung prüfen</P>
            </p>
          </>
        ),
      },
      {
        title: 'Zwecke und Rechtsgrundlagen',
        body: (
          <p>
            <P>
              Zuordnung der Verarbeitungszwecke (Vertragsanbahnung und -durchführung inkl. Zahlungsabwicklung, Beantwortung von Anfragen, Betrieb
              und Sicherheit der Website, ggf. Werbung mit Einwilligung) zu den jeweiligen Rechtsgrundlagen nach Art. 6 Abs. 1 DSGVO
            </P>
          </p>
        ),
      },
      {
        title: 'Online-Zahlung',
        body: (
          <p>
            Online-Zahlungen werden über den Zahlungsdienstleister PayPal (Europe) S.à r.l. et Cie, S.C.A. abgewickelt. Die Eingabe der Zahlungsdaten erfolgt auf der Bezahlseite von
            PayPal. Wir erhalten von PayPal Informationen zum Zahlungsstatus (z. B. bezahlt, erstattet). <P>Anbieterangaben, Rechtsgrundlage und
            ggf. Drittlandübermittlung ergänzen</P>
          </p>
        ),
      },
      {
        title: 'Weitergabe an Reinigungskräfte',
        body: (
          <p>
            Für die Durchführung eines Auftrags erhalten eingesetzte Reinigungskräfte nur die dafür erforderlichen Angaben (z. B. Name, Adresse,
            Telefonnummer, Zugangshinweise, Leistungsumfang) – keine Preise und keine E-Mail-Adresse. <P>Rechtliche Einordnung ergänzen</P>
          </p>
        ),
      },
      {
        title: 'Bewerbungen als Reinigungskraft',
        body: (
          <>
            <p>
              Wenn du dich über unser Bewerbungsformular als Reinigungskraft bewirbst, verarbeiten wir deine Kontaktdaten (Name, E-Mail-Adresse,
              Telefonnummer, Postleitzahl), deine Antworten im Formular (z. B. Sprachen, Arbeitserlaubnis, gewünschte Wochenstunden, Erfahrung,
              Fahrzeug, wie du von uns erfahren hast, deine Nachricht) sowie – falls du ihn hochlädst – deinen Lebenslauf.
            </p>
            <p>
              Wir nutzen diese Daten ausschließlich für das Bewerbungsverfahren, also um deine Bewerbung zu prüfen, Kontakt mit dir aufzunehmen und
              gegebenenfalls ein Konto für eine Zusammenarbeit anzulegen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Durchführung
              vorvertraglicher Maßnahmen) bzw. § 26 BDSG.
            </p>
            <p>
              Die Daten werden in unserer Datenbank gespeichert und sind nur für unser Team zugänglich. Kommt keine Zusammenarbeit zustande, löschen
              wir deine Bewerbung einschließlich Lebenslauf spätestens 6 Monate nach Eingang. Du kannst jederzeit eine frühere Löschung verlangen –
              eine kurze Nachricht an <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> genügt.
            </p>
          </>
        ),
      },
      {
        title: 'Empfänger und Auftragsverarbeiter',
        body: (
          <p>
            <P>Hosting-Anbieter, E-Mail-Versanddienstleister, Datenbank-Anbieter, Zahlungsdienstleister und weitere Dienstleister mit Sitz und
            Rechtsgrundlage</P>
          </p>
        ),
      },
      {
        title: 'Übermittlung in Drittländer',
        body: (
          <p>
            <P>Angaben zu etwaigen Übermittlungen außerhalb der EU/des EWR und den Garantien – andernfalls Abschnitt entfernen</P>
          </p>
        ),
      },
      {
        title: 'Speicherdauer',
        body: (
          <p>
            <P>Löschfristen je Datenkategorie, insbesondere unter Berücksichtigung gesetzlicher Aufbewahrungspflichten</P>
          </p>
        ),
      },
      {
        title: 'Cookies und lokale Speicherung',
        body: (
          <p>
            Für die Anmeldung speichert die Website ein Sitzungs-Token im lokalen Speicher deines Browsers. Deine Sprachauswahl wird in einem Cookie
            (fiduxa_locale) für bis zu ein Jahr gespeichert. <P>Weitere eingesetzte Technologien, ggf. Einwilligungsverwaltung, ergänzen</P>
          </p>
        ),
      },
      {
        title: 'Deine Rechte',
        body: (
          <>
            <p>Du hast nach Maßgabe der DSGVO insbesondere das Recht auf:</p>
            <ul>
              <li>Auskunft (Art. 15 DSGVO)</li>
              <li>Berichtigung (Art. 16 DSGVO)</li>
              <li>Löschung (Art. 17 DSGVO)</li>
              <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
              <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
              <li>Widerspruch (Art. 21 DSGVO)</li>
              <li>Widerruf erteilter Einwilligungen mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO)</li>
              <li>Beschwerde bei einer Datenschutz-Aufsichtsbehörde (Art. 77 DSGVO)</li>
            </ul>
            <p>
              Zuständige Aufsichtsbehörde: Berliner Beauftragte für Datenschutz und Informationsfreiheit, Alt-Moabit 59–61, 10555 Berlin
            </p>
          </>
        ),
      },
      {
        title: 'Änderungen dieser Erklärung',
        body: (
          <p>
            <P>Hinweis zur Aktualisierung der Datenschutzerklärung</P>
          </p>
        ),
      },
    ],
  }),
  en: () => ({
    title: 'Privacy policy',
    intro: (
      <p className="m-0">
        This policy explains which personal data we process when you use this website and our services. The following sections set out the
        structure and must be fully drafted before launch.
      </p>
    ),
    sections: [
      {
        title: 'Controller',
        body: (
          <p>
            {COMPANY.name}, {COMPANY.street}, {COMPANY.postcode} {COMPANY.city}, email: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>, phone: <a href={CONTACT.phoneHref}>{CONTACT.phoneDisplay}</a>
          </p>
        ),
      },
      {
        title: 'Data protection officer',
        body: (
          <p>
            <P>Contact details of the data protection officer, if one must be appointed – otherwise remove this section</P>
          </p>
        ),
      },
      {
        title: 'What data we process',
        body: (
          <>
            <p>Depending on how you use our services, we process in particular:</p>
            <ul>
              <li>Account data: name, email address, phone number, password (stored encrypted), selected language</li>
              <li>Booking data: address, postcode, floor space, condition, extras, hours booked, appointment, access notes, comments</li>
              <li>Price, payment and status data for your bookings (e.g. fixed price, payment status, cancellations and refunds)</li>
              <li>Contact enquiries: name, email, optionally phone and subject, message</li>
              <li>Business requests: company, contact and premises data</li>
              <li>Cleaner applications: contact details, answers in the application form, optional CV</li>
              <li>Technical data when accessing the website (e.g. server log files)</li>
            </ul>
            <p>
              <P>check that this list is complete</P>
            </p>
          </>
        ),
      },
      {
        title: 'Purposes and legal bases',
        body: (
          <p>
            <P>
              Assignment of the processing purposes (pre-contractual steps and performance of the contract incl. payment processing, answering
              enquiries, operation and security of the website, advertising with consent where applicable) to the respective legal bases under
              Art. 6(1) GDPR
            </P>
          </p>
        ),
      },
      {
        title: 'Online payment',
        body: (
          <p>
            Online payments are processed by the payment service provider PayPal (Europe) S.à r.l. et Cie, S.C.A.. Payment details are entered on PayPal&apos;s payment page. We
            receive information on the payment status from PayPal (e.g. paid, refunded). <P>add provider details, legal basis and any transfer to
            third countries</P>
          </p>
        ),
      },
      {
        title: 'Sharing with cleaners',
        body: (
          <p>
            To carry out a job, the assigned cleaners only receive the information they need (e.g. name, address, phone number, access notes,
            scope of services) – no prices and no email address. <P>add legal classification</P>
          </p>
        ),
      },
      {
        title: 'Applications as a cleaner',
        body: (
          <>
            <p>
              If you apply as a cleaner via our application form, we process your contact details (name, email address, phone number, postcode),
              your answers in the form (e.g. languages, work permit, preferred weekly hours, experience, vehicle, how you heard about us, your
              message) and – if you upload it – your CV.
            </p>
            <p>
              We use this data solely for the application process, i.e. to review your application, contact you and, where applicable, set up an
              account for working together. The legal basis is Art. 6(1)(b) GDPR (steps prior to entering into a contract) and Section 26 BDSG.
            </p>
            <p>
              The data is stored in our database and is only accessible to our team. If no collaboration comes about, we delete your application
              including your CV no later than 6 months after we receive it. You can request earlier deletion at any time – a short message to{' '}
              <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> is enough.
            </p>
          </>
        ),
      },
      {
        title: 'Recipients and processors',
        body: (
          <p>
            <P>Hosting provider, email delivery service, database provider, payment service provider and other service providers with their
            location and legal basis</P>
          </p>
        ),
      },
      {
        title: 'Transfers to third countries',
        body: (
          <p>
            <P>Details of any transfers outside the EU/EEA and the safeguards – otherwise remove this section</P>
          </p>
        ),
      },
      {
        title: 'Storage period',
        body: (
          <p>
            <P>Deletion periods per data category, in particular taking statutory retention obligations into account</P>
          </p>
        ),
      },
      {
        title: 'Cookies and local storage',
        body: (
          <p>
            For logging in, the website stores a session token in your browser&apos;s local storage. Your language choice is stored in a cookie
            (fiduxa_locale) for up to one year. <P>add any other technologies used and consent management, if applicable</P>
          </p>
        ),
      },
      {
        title: 'Your rights',
        body: (
          <>
            <p>Under the GDPR you have in particular the right to:</p>
            <ul>
              <li>access (Art. 15 GDPR)</li>
              <li>rectification (Art. 16 GDPR)</li>
              <li>erasure (Art. 17 GDPR)</li>
              <li>restriction of processing (Art. 18 GDPR)</li>
              <li>data portability (Art. 20 GDPR)</li>
              <li>object (Art. 21 GDPR)</li>
              <li>withdraw consent with effect for the future (Art. 7(3) GDPR)</li>
              <li>lodge a complaint with a data protection supervisory authority (Art. 77 GDPR)</li>
            </ul>
            <p>
              Competent supervisory authority: Berliner Beauftragte für Datenschutz und Informationsfreiheit, Alt-Moabit 59–61, 10555 Berlin
            </p>
          </>
        ),
      },
      {
        title: 'Changes to this policy',
        body: (
          <p>
            <P>note on updates to the privacy policy</P>
          </p>
        ),
      },
    ],
  }),
  pl: () => ({
    title: 'Polityka prywatności',
    intro: (
      <p className="m-0">
        W niniejszej informacji wyjaśniamy, jakie dane osobowe przetwarzamy podczas korzystania z tej strony i naszych usług. Poniższe sekcje
        przedstawiają strukturę i przed uruchomieniem muszą zostać w pełni opracowane.
      </p>
    ),
    sections: [
      {
        title: 'Administrator danych',
        body: (
          <p>
            {COMPANY.name}, {COMPANY.street}, {COMPANY.postcode} {COMPANY.city}, e-mail: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>, telefon: <a href={CONTACT.phoneHref}>{CONTACT.phoneDisplay}</a>
          </p>
        ),
      },
      {
        title: 'Inspektor ochrony danych',
        body: (
          <p>
            <P>dane kontaktowe inspektora ochrony danych, jeśli istnieje obowiązek jego wyznaczenia – w przeciwnym razie usunąć sekcję</P>
          </p>
        ),
      },
      {
        title: 'Jakie dane przetwarzamy',
        body: (
          <>
            <p>W zależności od sposobu korzystania przetwarzamy w szczególności:</p>
            <ul>
              <li>Dane konta: imię i nazwisko, adres e-mail, numer telefonu, hasło (przechowywane w formie zaszyfrowanej), wybrany język</li>
              <li>Dane rezerwacji: adres, kod pocztowy, metraż, stan, dodatki, zarezerwowane godziny, termin, informacje o dostępie, uwagi</li>
              <li>Dane dotyczące ceny, płatności i statusu rezerwacji (np. stała cena, status płatności, anulowania i zwroty)</li>
              <li>Zapytania kontaktowe: imię, e-mail, opcjonalnie telefon i temat, wiadomość</li>
              <li>Zapytania firmowe: dane firmy, kontaktowe i dotyczące obiektu</li>
              <li>Aplikacje osób sprzątających: dane kontaktowe, odpowiedzi w formularzu aplikacyjnym, opcjonalnie CV</li>
              <li>Dane techniczne przy odwiedzaniu strony (np. logi serwera)</li>
            </ul>
            <p>
              <P>sprawdzić kompletność listy</P>
            </p>
          </>
        ),
      },
      {
        title: 'Cele i podstawy prawne',
        body: (
          <p>
            <P>
              przyporządkowanie celów przetwarzania (działania przed zawarciem umowy i jej wykonanie wraz z obsługą płatności, odpowiadanie na
              zapytania, działanie i bezpieczeństwo strony, ewentualnie marketing za zgodą) do podstaw prawnych z art. 6 ust. 1 RODO
            </P>
          </p>
        ),
      },
      {
        title: 'Płatność online',
        body: (
          <p>
            Płatności online obsługuje operator płatności PayPal (Europe) S.à r.l. et Cie, S.C.A.. Dane płatnicze wprowadza się na stronie płatności PayPal. Od PayPal otrzymujemy
            informacje o statusie płatności (np. zapłacono, zwrócono). <P>uzupełnić dane operatora, podstawę prawną i ewentualne przekazywanie do
            państw trzecich</P>
          </p>
        ),
      },
      {
        title: 'Przekazywanie danych osobom sprzątającym',
        body: (
          <p>
            Do realizacji zlecenia osoby sprzątające otrzymują wyłącznie niezbędne informacje (np. imię i nazwisko, adres, numer telefonu,
            informacje o dostępie, zakres usług) – bez cen i adresu e-mail. <P>uzupełnić kwalifikację prawną</P>
          </p>
        ),
      },
      {
        title: 'Aplikacje na stanowisko osoby sprzątającej',
        body: (
          <>
            <p>
              Jeśli aplikujesz jako osoba sprzątająca przez nasz formularz, przetwarzamy Twoje dane kontaktowe (imię i nazwisko, adres e-mail, numer
              telefonu, kod pocztowy), Twoje odpowiedzi w formularzu (np. języki, zezwolenie na pracę, preferowana liczba godzin tygodniowo,
              doświadczenie, pojazd, skąd o nas wiesz, Twoja wiadomość) oraz – jeśli go prześlesz – Twoje CV.
            </p>
            <p>
              Wykorzystujemy te dane wyłącznie w procesie rekrutacji, tj. aby rozpatrzyć Twoją aplikację, skontaktować się z Tobą i w razie potrzeby
              założyć konto do współpracy. Podstawą prawną jest art. 6 ust. 1 lit. b RODO (działania przed zawarciem umowy) oraz § 26 BDSG.
            </p>
            <p>
              Dane są przechowywane w naszej bazie danych i dostępne wyłącznie dla naszego zespołu. Jeśli nie dojdzie do współpracy, usuniemy Twoją
              aplikację wraz z CV najpóźniej 6 miesięcy po jej otrzymaniu. W każdej chwili możesz zażądać wcześniejszego usunięcia – wystarczy krótka
              wiadomość na adres <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>.
            </p>
          </>
        ),
      },
      {
        title: 'Odbiorcy i podmioty przetwarzające',
        body: (
          <p>
            <P>dostawca hostingu, usługa wysyłki e-maili, dostawca bazy danych, operator płatności i inni usługodawcy wraz z siedzibą i podstawą
            prawną</P>
          </p>
        ),
      },
      {
        title: 'Przekazywanie do państw trzecich',
        body: (
          <p>
            <P>informacje o ewentualnym przekazywaniu danych poza UE/EOG i zabezpieczeniach – w przeciwnym razie usunąć sekcję</P>
          </p>
        ),
      },
      {
        title: 'Okres przechowywania',
        body: (
          <p>
            <P>terminy usuwania dla poszczególnych kategorii danych, w szczególności z uwzględnieniem ustawowych obowiązków przechowywania</P>
          </p>
        ),
      },
      {
        title: 'Pliki cookie i pamięć lokalna',
        body: (
          <p>
            Na potrzeby logowania strona zapisuje token sesji w pamięci lokalnej Twojej przeglądarki. Wybrany język jest zapisywany w pliku cookie
            (fiduxa_locale) na okres do jednego roku. <P>uzupełnić inne stosowane technologie, ewentualnie zarządzanie zgodami</P>
          </p>
        ),
      },
      {
        title: 'Twoje prawa',
        body: (
          <>
            <p>Zgodnie z RODO przysługuje Ci w szczególności prawo do:</p>
            <ul>
              <li>dostępu do danych (art. 15 RODO)</li>
              <li>sprostowania (art. 16 RODO)</li>
              <li>usunięcia (art. 17 RODO)</li>
              <li>ograniczenia przetwarzania (art. 18 RODO)</li>
              <li>przenoszenia danych (art. 20 RODO)</li>
              <li>sprzeciwu (art. 21 RODO)</li>
              <li>wycofania udzielonej zgody ze skutkiem na przyszłość (art. 7 ust. 3 RODO)</li>
              <li>wniesienia skargi do organu nadzorczego ds. ochrony danych (art. 77 RODO)</li>
            </ul>
            <p>
              Właściwy organ nadzorczy: Berliner Beauftragte für Datenschutz und Informationsfreiheit, Alt-Moabit 59–61, 10555 Berlin
            </p>
          </>
        ),
      },
      {
        title: 'Zmiany niniejszej informacji',
        body: (
          <p>
            <P>informacja o aktualizacji polityki prywatności</P>
          </p>
        ),
      },
    ],
  }),
};

export function generateMetadata(): Metadata {
  return { title: CONTENT[getLocale()]().title };
}

export default function DatenschutzPage() {
  const content = CONTENT[getLocale()]();
  return <LegalPage title={content.title} intro={content.intro} sections={content.sections} />;
}
