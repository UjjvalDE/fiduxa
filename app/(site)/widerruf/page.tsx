import type { Metadata } from 'next';

import type { Locale } from '@/lib/i18n/config';
import { getLocale } from '@/lib/i18n/server';
import { COMPANY, CONTACT } from '../_shared/catalogue';
import { LegalPage, P, type LegalSection } from '../_shared/legal';

type Content = { title: string; intro: React.ReactNode; sections: LegalSection[] };

const CONTENT: Record<Locale, () => Content> = {
  de: () => ({
    title: 'Widerrufsbelehrung',
    intro: (
      <p className="m-0">
        Allgemeine Struktur einer Widerrufsbelehrung für Dienstleistungsverträge mit Verbraucherinnen und Verbrauchern (14 Tage). Der verbindliche
        Wortlaut – insbesondere zum vorzeitigen Leistungsbeginn – muss rechtlich geprüft werden.
      </p>
    ),
    sections: [
      {
        title: 'Widerrufsrecht',
        body: (
          <>
            <p>
              Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn
              Tage ab dem Tag des Vertragsabschlusses.
            </p>
            <p>
              Um Ihr Widerrufsrecht auszuüben, müssen Sie uns ({COMPANY.name}, {COMPANY.street}, {COMPANY.postcode} {COMPANY.city}, E-Mail: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>,
              Telefon: <a href={CONTACT.phoneHref}>{CONTACT.phoneDisplay}</a>) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über
              Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das unten stehende Muster-Widerrufsformular verwenden,
              das jedoch nicht vorgeschrieben ist.
            </p>
            <p>
              Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der
              Widerrufsfrist absenden.
            </p>
          </>
        ),
      },
      {
        title: 'Folgen des Widerrufs',
        body: (
          <>
            <p>
              Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens
              binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist.{' '}
              Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben (PayPal), es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.
            </p>
            <p>
              Haben Sie verlangt, dass die Dienstleistung während der Widerrufsfrist beginnen soll, so haben Sie uns einen angemessenen Betrag zu
              zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags
              unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen
              entspricht.
            </p>
          </>
        ),
      },
      {
        title: 'Vorzeitiges Erlöschen des Widerrufsrechts',
        body: (
          <p>
            Im Buchungsablauf wird die ausdrückliche Zustimmung abgefragt, dass die Leistung vor Ablauf der Widerrufsfrist beginnen darf.{' '}
            <P>Hinweis zum Erlöschen des Widerrufsrechts bei vollständiger Erbringung der Dienstleistung – rechtlich prüfen lassen</P>
          </p>
        ),
      },
      {
        title: 'Muster-Widerrufsformular',
        body: (
          <div className="rounded-xl border border-border bg-cream p-5 text-sm">
            <p>(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)</p>
            <ul className="!mt-3">
              <li>
                An {COMPANY.name}, {COMPANY.street}, {COMPANY.postcode} {COMPANY.city}, {CONTACT.email}
              </li>
              <li>
                Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung (*)
              </li>
              <li>Bestellt am (*) / erhalten am (*)</li>
              <li>Name des/der Verbraucher(s)</li>
              <li>Anschrift des/der Verbraucher(s)</li>
              <li>Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)</li>
              <li>Datum</li>
            </ul>
            <p className="!mt-3 text-muted-grey">(*) Unzutreffendes streichen.</p>
          </div>
        ),
      },
    ],
  }),
  en: () => ({
    title: 'Withdrawal policy',
    intro: (
      <p className="m-0">
        General structure of a withdrawal policy for service contracts with consumers (14 days). The binding wording – in particular on the early
        start of the service – must be legally reviewed.
      </p>
    ),
    sections: [
      {
        title: 'Right of withdrawal',
        body: (
          <>
            <p>
              You have the right to withdraw from this contract within fourteen days without giving any reason. The withdrawal period is fourteen
              days from the day the contract is concluded.
            </p>
            <p>
              To exercise your right of withdrawal, you must inform us ({COMPANY.name}, {COMPANY.street}, {COMPANY.postcode} {COMPANY.city}, email: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>, phone: <a href={CONTACT.phoneHref}>{CONTACT.phoneDisplay}</a>) of your decision to withdraw from this contract by means of a clear statement
              (e.g. a letter sent by post or an email). You may use the model withdrawal form below, but this is not mandatory.
            </p>
            <p>
              To meet the withdrawal deadline, it is sufficient for you to send your notice of exercising the right of withdrawal before the
              withdrawal period has expired.
            </p>
          </>
        ),
      },
      {
        title: 'Consequences of withdrawal',
        body: (
          <>
            <p>
              If you withdraw from this contract, we shall reimburse all payments received from you without undue delay and at the latest within
              fourteen days from the day on which we receive notice of your withdrawal from this contract. We will use the same means of payment that you used for the original transaction (PayPal), unless expressly agreed otherwise with you; in no event will you be charged any fees for this reimbursement.
            </p>
            <p>
              If you requested that the service begin during the withdrawal period, you shall pay us a reasonable amount corresponding to the
              proportion of the services already provided up to the time you inform us of the exercise of the right of withdrawal, compared with the
              full scope of services provided for in the contract.
            </p>
          </>
        ),
      },
      {
        title: 'Early expiry of the right of withdrawal',
        body: (
          <p>
            During booking, you are asked to expressly agree that the service may begin before the withdrawal period ends.{' '}
            <P>note on the expiry of the right of withdrawal once the service has been fully provided – have it legally reviewed</P>
          </p>
        ),
      },
      {
        title: 'Model withdrawal form',
        body: (
          <div className="rounded-xl border border-border bg-cream p-5 text-sm">
            <p>(If you wish to withdraw from the contract, please complete and return this form.)</p>
            <ul className="!mt-3">
              <li>
                To {COMPANY.name}, {COMPANY.street}, {COMPANY.postcode} {COMPANY.city}, {CONTACT.email}
              </li>
              <li>I/We (*) hereby give notice that I/we (*) withdraw from my/our (*) contract for the provision of the following service (*)</li>
              <li>Ordered on (*) / received on (*)</li>
              <li>Name of consumer(s)</li>
              <li>Address of consumer(s)</li>
              <li>Signature of consumer(s) (only if this form is notified on paper)</li>
              <li>Date</li>
            </ul>
            <p className="!mt-3 text-muted-grey">(*) Delete as appropriate.</p>
          </div>
        ),
      },
    ],
  }),
  pl: () => ({
    title: 'Pouczenie o prawie odstąpienia od umowy',
    intro: (
      <p className="m-0">
        Ogólna struktura pouczenia o prawie odstąpienia od umów o świadczenie usług zawieranych z konsumentami (14 dni). Wiążące brzmienie – w
        szczególności dotyczące wcześniejszego rozpoczęcia usługi – wymaga weryfikacji prawnej.
      </p>
    ),
    sections: [
      {
        title: 'Prawo odstąpienia od umowy',
        body: (
          <>
            <p>
              Mają Państwo prawo odstąpić od niniejszej umowy w terminie czternastu dni bez podania przyczyny. Termin na odstąpienie wynosi
              czternaście dni od dnia zawarcia umowy.
            </p>
            <p>
              Aby skorzystać z prawa odstąpienia, muszą Państwo poinformować nas ({COMPANY.name}, {COMPANY.street}, {COMPANY.postcode} {COMPANY.city}, e-mail: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>, telefon: <a href={CONTACT.phoneHref}>{CONTACT.phoneDisplay}</a>) o swojej decyzji w drodze jednoznacznego oświadczenia (np. listem wysłanym
              pocztą lub e-mailem). Mogą Państwo skorzystać z poniższego wzoru formularza odstąpienia, nie jest to jednak obowiązkowe.
            </p>
            <p>Aby zachować termin, wystarczy wysłać informację o skorzystaniu z prawa odstąpienia przed jego upływem.</p>
          </>
        ),
      },
      {
        title: 'Skutki odstąpienia od umowy',
        body: (
          <>
            <p>
              W przypadku odstąpienia od umowy zwrócimy Państwu wszystkie otrzymane płatności niezwłocznie, nie później niż w ciągu czternastu dni od
              dnia, w którym otrzymaliśmy informację o odstąpieniu od umowy. Zwrotu dokonamy przy użyciu takiego samego sposobu płatności, jakiego użyli Państwo w pierwotnej transakcji (PayPal), chyba że wyraźnie uzgodniono inaczej; w żadnym przypadku nie poniosą Państwo opłat w związku z tym zwrotem.
            </p>
            <p>
              Jeżeli zażądali Państwo rozpoczęcia świadczenia usługi przed upływem terminu na odstąpienie, zapłacą nam Państwo kwotę proporcjonalną
              do zakresu usług spełnionych do chwili poinformowania nas o odstąpieniu od umowy, w stosunku do pełnego zakresu usług przewidzianych
              w umowie.
            </p>
          </>
        ),
      },
      {
        title: 'Wcześniejsze wygaśnięcie prawa odstąpienia',
        body: (
          <p>
            Podczas rezerwacji prosimy o wyraźną zgodę na rozpoczęcie usługi przed upływem terminu na odstąpienie od umowy.{' '}
            <P>informacja o wygaśnięciu prawa odstąpienia po pełnym wykonaniu usługi – wymaga weryfikacji prawnej</P>
          </p>
        ),
      },
      {
        title: 'Wzór formularza odstąpienia od umowy',
        body: (
          <div className="rounded-xl border border-border bg-cream p-5 text-sm">
            <p>(Formularz ten należy wypełnić i odesłać tylko w przypadku chęci odstąpienia od umowy.)</p>
            <ul className="!mt-3">
              <li>
                Adresat: {COMPANY.name}, {COMPANY.street}, {COMPANY.postcode} {COMPANY.city}, {CONTACT.email}
              </li>
              <li>Ja/My (*) niniejszym informuję/informujemy (*) o moim/naszym (*) odstąpieniu od umowy o świadczenie następującej usługi (*)</li>
              <li>Data zawarcia umowy (*) / odbioru (*)</li>
              <li>Imię i nazwisko konsumenta(-ów)</li>
              <li>Adres konsumenta(-ów)</li>
              <li>Podpis konsumenta(-ów) (tylko jeżeli formularz jest przesyłany w wersji papierowej)</li>
              <li>Data</li>
            </ul>
            <p className="!mt-3 text-muted-grey">(*) Niepotrzebne skreślić.</p>
          </div>
        ),
      },
    ],
  }),
};

export function generateMetadata(): Metadata {
  return { title: CONTENT[getLocale()]().title };
}

export default function WiderrufPage() {
  const content = CONTENT[getLocale()]();
  return <LegalPage title={content.title} intro={content.intro} sections={content.sections} />;
}
