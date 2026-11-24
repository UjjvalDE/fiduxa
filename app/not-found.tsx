import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import { SiteFooter } from '@/componets/site/site-footer';
import { SiteHeader } from '@/componets/site/site-header';
import { defineMessages } from '@/lib/i18n/config';
import { getMessages } from '@/lib/i18n/server';

const de = {
  title: 'Seite nicht gefunden',
  eyebrow: 'Fehler 404',
  headingBefore: 'Hier ist es',
  headingEm: 'blitzblank',
  headingAfter: '– aber leer.',
  text: 'Die Seite, die du suchst, gibt es nicht (mehr). Vielleicht hat sich ein Tippfehler eingeschlichen, oder der Link ist veraltet.',
  home: 'Zur Startseite',
  services: 'Leistungen ansehen',
  helpBefore: 'Du findest nicht, was du brauchst?',
  helpLink: 'Schreib uns',
};
const en: typeof de = {
  title: 'Page not found',
  eyebrow: 'Error 404',
  headingBefore: "It's",
  headingEm: 'spotless',
  headingAfter: 'here – but empty.',
  text: 'The page you are looking for does not exist (anymore). Perhaps there is a typo, or the link is out of date.',
  home: 'Go to the home page',
  services: 'View our services',
  helpBefore: "Can't find what you need?",
  helpLink: 'Write to us',
};
const pl: typeof de = {
  title: 'Nie znaleziono strony',
  eyebrow: 'Błąd 404',
  headingBefore: 'Tu jest',
  headingEm: 'lśniąco czysto',
  headingAfter: '– ale pusto.',
  text: 'Strona, której szukasz, nie istnieje (już). Być może wkradła się literówka albo link jest nieaktualny.',
  home: 'Strona główna',
  services: 'Zobacz usługi',
  helpBefore: 'Nie możesz znaleźć tego, czego szukasz?',
  helpLink: 'Napisz do nas',
};
const messages = defineMessages({ de, en, pl });

export function generateMetadata(): Metadata {
  return { title: getMessages(messages).title };
}

export default function NotFound() {
  const t = getMessages(messages);
  return (
    <div className="flex min-h-screen flex-col bg-cream text-charcoal">
      <SiteHeader />
      <main id="inhalt" className="flex flex-1 items-center">
        <div className="shell py-20 lg:py-28">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> {t.eyebrow}
          </div>
          <h1>
            {t.headingBefore} <em>{t.headingEm}</em> {t.headingAfter}
          </h1>
          <p className="hero-lead">{t.text}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/" className="button">
              <ArrowLeft size={17} aria-hidden="true" /> {t.home}
            </Link>
            <Link href="/leistungen" className="button button-quiet">
              {t.services} <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <p className="mt-10 text-sm text-muted-grey">
            {t.helpBefore}{' '}
            <Link href="/kontakt" className="font-bold text-pine underline underline-offset-2">
              {t.helpLink}
            </Link>
            .
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
