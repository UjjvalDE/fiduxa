'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Menu, UserRound, X } from 'lucide-react';

import { Logo } from './logo';
import { LanguageSwitcher } from './language-switcher';
import { homeForRole, useAuth } from '@/lib/auth';
import { useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const { user, status } = useAuth();
  const t = useMessages(common);

  const navLinks = [
    { href: '/leistungen', label: t.nav.services },
    { href: '/preise', label: t.nav.prices },
    { href: '/so-funktioniert-es', label: t.nav.howItWorks },
    { href: '/gutscheine', label: t.nav.giftCards },
    { href: '/fuer-unternehmen', label: t.nav.business },
    { href: '/faq', label: t.nav.faq },
  ];

  const accountHref = user ? homeForRole(user.role) : '/login';
  const accountLabel = user
    ? user.role === 'admin'
      ? t.nav.admin
      : user.role === 'worker'
        ? t.nav.cleanerPortal
        : t.nav.myAccount
    : t.nav.login;

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <>
      <div className="topline">
        <div className="shell flex items-center justify-between gap-4 py-2 text-[11px] font-semibold tracking-[0.08em] text-white/80">
          <span>{t.topline}</span>
          <div className="flex items-center gap-4">
            <span className="hidden md:inline">{t.toplineRight}</span>
            <LanguageSwitcher tone="light" />
          </div>
        </div>
      </div>

      <header className="site-header">
        <div className="shell flex h-[78px] items-center justify-between">
          <Logo label={t.nav.homeLabel} />

          <nav className="hidden items-center gap-5 lg:flex xl:gap-7" aria-label={t.nav.mainNavigation}>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link ${isActive(link.href) ? '!text-pine' : ''}`}
                aria-current={isActive(link.href) ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-5 lg:flex">
            {status !== 'loading' && (
              <Link href={accountHref} className="nav-link flex items-center gap-2">
                <UserRound size={15} aria-hidden="true" /> {accountLabel}
              </Link>
            )}
            <Link href="/buchung" className="button button-small">
              {t.nav.bookNow} <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>

          <button
            type="button"
            className="menu-button lg:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? t.nav.closeMenu : t.nav.openMenu}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={23} /> : <Menu size={23} />}
          </button>
        </div>

        {menuOpen && (
          <nav className="mobile-nav lg:hidden" aria-label={t.nav.mobileNavigation}>
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>
                {link.label}
              </Link>
            ))}
            <Link href="/kontakt" onClick={() => setMenuOpen(false)}>
              {t.nav.contact}
            </Link>
            <Link href={accountHref} onClick={() => setMenuOpen(false)}>
              {accountLabel}
            </Link>
            <Link className="button justify-center" href="/buchung" onClick={() => setMenuOpen(false)}>
              {t.nav.bookNow} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </nav>
        )}
      </header>
    </>
  );
}
