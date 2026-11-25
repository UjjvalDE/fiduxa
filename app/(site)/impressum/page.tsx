import type { Metadata } from 'next';

import type { Locale } from '@/lib/i18n/config';
import { getLocale } from '@/lib/i18n/server';
import { COMPANY, CONTACT } from '../_shared/catalogue';
import { LegalPage, P, type LegalSection } from '../_shared/legal';

type Content = { title: string; intro: React.ReactNode; sections: LegalSection[] };

const CONTENT: Record<Locale, () => Content> = {
  de: () => ({
    title: 'Impressum',
    intro: <p className="m-0">Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG).</p>,
    sections: [
      {
        title: 'Anbieter',
        body: (
          <p>
            {COMPANY.name}
            <br />
            {COMPANY.street}
            <br />
            {COMPANY.postcode} {COMPANY.city}
            <br />
            Deutschland
          </p>
        ),
      },
      {
        title: 'Vertreten durch',
        body: (
          <p>
            Geschäftsführer: {COMPANY.representative}
          </p>
        ),
      },
      {
        title: 'Kontakt',
        body: (
          <p>
            Telefon: <a href={CONTACT.phoneHref}>{CONTACT.phoneDisplay}</a>
            <br />
            E-Mail: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
          </p>
        ),
      },
      {
        title: 'Registereintrag',
        body: (
          <p>
            Registergericht: <P>Amtsgericht</P>
            <br />
            Registernummer: <P>HRB-Nummer</P>
            <br />
            <span className="text-sm text-muted-grey">(Nur angeben, sofern eine Eintragung im Handelsregister besteht.)</span>
          </p>
        ),
      },
      {
        title: 'Umsatzsteuer-ID',
        body: (
          <p>
            Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: <P>USt-IdNr.</P>
            <br />
            <span className="text-sm text-muted-grey">(Nur angeben, sofern vorhanden.)</span>
          </p>
        ),
      },
      {
        title: 'Berufsrechtliche Angaben / Aufsichtsbehörde',
        body: (
          <p>
            <P>Zuständige Kammer bzw. Aufsichtsbehörde, sofern für die Tätigkeit erforderlich – andernfalls Abschnitt entfernen</P>
          </p>
        ),
      },
      {
        title: 'Verantwortlich für den Inhalt',
        body: (
          <p>
            {COMPANY.representative}, {COMPANY.street}, {COMPANY.postcode} {COMPANY.city}
          </p>
        ),
      },
      {
        title: 'Verbraucherstreitbeilegung',
        body: (
          <p>
            <P>
              Erklärung, ob das Unternehmen bereit oder verpflichtet ist, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
              teilzunehmen
            </P>
          </p>
        ),
      },
      {
        title: 'Haftung für Inhalte und Links',
        body: (
          <p>
            <P>Hinweise zur Haftung für eigene Inhalte und externe Links – Formulierung rechtlich prüfen lassen</P>
          </p>
        ),
      },
    ],
  }),
  en: () => ({
    title: 'Legal notice',
    intro: <p className="m-0">Information pursuant to Section 5 of the German Digital Services Act (Digitale-Dienste-Gesetz, DDG).</p>,
    sections: [
      {
        title: 'Provider',
        body: (
          <p>
            {COMPANY.name}
            <br />
            {COMPANY.street}
            <br />
            {COMPANY.postcode} {COMPANY.city}
            <br />
            Germany
          </p>
        ),
      },
      {
        title: 'Represented by',
        body: (
          <p>
            Managing director: {COMPANY.representative}
          </p>
        ),
      },
      {
        title: 'Contact',
        body: (
          <p>
            Phone: <a href={CONTACT.phoneHref}>{CONTACT.phoneDisplay}</a>
            <br />
            Email: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
          </p>
        ),
      },
      {
        title: 'Register entry',
        body: (
          <p>
            Register court: <P>local court (Amtsgericht)</P>
            <br />
            Registration number: <P>HRB number</P>
            <br />
            <span className="text-sm text-muted-grey">(Only if the company is entered in the commercial register.)</span>
          </p>
        ),
      },
      {
        title: 'VAT ID',
        body: (
          <p>
            VAT identification number pursuant to Section 27a of the German VAT Act: <P>VAT ID</P>
            <br />
            <span className="text-sm text-muted-grey">(Only if available.)</span>
          </p>
        ),
      },
      {
        title: 'Professional regulations / supervisory authority',
        body: (
          <p>
            <P>Competent chamber or supervisory authority, if required for the activity – otherwise remove this section</P>
          </p>
        ),
      },
      {
        title: 'Responsible for the content',
        body: (
          <p>
            {COMPANY.representative}, {COMPANY.street}, {COMPANY.postcode} {COMPANY.city}
          </p>
        ),
      },
      {
        title: 'Consumer dispute resolution',
        body: (
          <p>
            <P>Statement on whether the company is willing or obliged to take part in dispute resolution proceedings before a consumer arbitration board</P>
          </p>
        ),
      },
      {
        title: 'Liability for content and links',
        body: (
          <p>
            <P>Notes on liability for own content and external links – have the wording legally reviewed</P>
          </p>
        ),
      },
    ],
  }),
  pl: () => ({
    title: 'Nota prawna',
    intro: <p className="m-0">Informacje zgodnie z § 5 niemieckiej ustawy o usługach cyfrowych (Digitale-Dienste-Gesetz, DDG).</p>,
    sections: [
      {
        title: 'Usługodawca',
        body: (
          <p>
            {COMPANY.name}
            <br />
            {COMPANY.street}
            <br />
            {COMPANY.postcode} {COMPANY.city}
            <br />
            Niemcy
          </p>
        ),
      },
      {
        title: 'Reprezentowany przez',
        body: (
          <p>
            Dyrektor zarządzający: {COMPANY.representative}
          </p>
        ),
      },
      {
        title: 'Kontakt',
        body: (
          <p>
            Telefon: <a href={CONTACT.phoneHref}>{CONTACT.phoneDisplay}</a>
            <br />
            E-mail: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
          </p>
        ),
      },
      {
        title: 'Wpis do rejestru',
        body: (
          <p>
            Sąd rejestrowy: <P>sąd rejonowy (Amtsgericht)</P>
            <br />
            Numer rejestrowy: <P>numer HRB</P>
            <br />
            <span className="text-sm text-muted-grey">(Podać tylko, jeśli istnieje wpis do rejestru handlowego.)</span>
          </p>
        ),
      },
      {
        title: 'Numer identyfikacji VAT',
        body: (
          <p>
            Numer identyfikacji podatkowej VAT zgodnie z § 27a niemieckiej ustawy o VAT: <P>USt-IdNr.</P>
            <br />
            <span className="text-sm text-muted-grey">(Podać tylko, jeśli istnieje.)</span>
          </p>
        ),
      },
      {
        title: 'Informacje zawodowe / organ nadzorczy',
        body: (
          <p>
            <P>Właściwa izba lub organ nadzorczy, jeśli jest to wymagane dla działalności – w przeciwnym razie usunąć sekcję</P>
          </p>
        ),
      },
      {
        title: 'Odpowiedzialny za treść',
        body: (
          <p>
            {COMPANY.representative}, {COMPANY.street}, {COMPANY.postcode} {COMPANY.city}
          </p>
        ),
      },
      {
        title: 'Pozasądowe rozstrzyganie sporów konsumenckich',
        body: (
          <p>
            <P>Oświadczenie, czy firma jest gotowa lub zobowiązana do udziału w postępowaniu przed konsumenckim organem rozstrzygania sporów</P>
          </p>
        ),
      },
      {
        title: 'Odpowiedzialność za treści i linki',
        body: (
          <p>
            <P>Informacje o odpowiedzialności za własne treści i linki zewnętrzne – sformułowanie wymaga weryfikacji prawnej</P>
          </p>
        ),
      },
    ],
  }),
};

export function generateMetadata(): Metadata {
  return { title: CONTENT[getLocale()]().title };
}

export default function ImpressumPage() {
  const content = CONTENT[getLocale()]();
  return <LegalPage title={content.title} intro={content.intro} sections={content.sections} />;
}
