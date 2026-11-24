'use client';

import Link from 'next/link';

import { Logo } from './logo';
import { LanguageSwitcher } from './language-switcher';
import { useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';

export function SiteFooter() {
  const t = useMessages(common);

  const footerLinks = [
    { href: '/leistungen', label: t.nav.services },
    { href: '/preise', label: t.nav.prices },
    { href: '/gutscheine', label: t.nav.giftCards },
    { href: '/fuer-unternehmen', label: t.nav.business },
    { href: '/faq', label: t.nav.faq },
    { href: '/kontakt', label: t.nav.contact },
    { href: '/ueber-uns', label: t.nav.about },
  ];

  const legalLinks = [
    { href: '/impressum', label: t.legal.imprint },
    { href: '/datenschutz', label: t.legal.privacy },
    { href: '/agb', label: t.legal.terms },
    { href: '/widerruf', label: t.legal.withdrawal },
  ];

  return (
    <footer className="footer">
      <div className="shell">
        <div className="footer-top">
          <Logo light label={t.nav.homeLabel} />
          <p>
            {t.brandTagline}
            <br />
            {t.footerClaim}
          </p>
          <nav className="footer-links" aria-label={t.nav.footer}>
            {footerLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Fiduxa · Berlin</span>
          <div className="items-center">
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
            <LanguageSwitcher tone="light" />
          </div>
        </div>
      </div>
    </footer>
  );
}
