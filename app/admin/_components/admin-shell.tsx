'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Banknote,
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarClock,
  CreditCard,
  Gift,
  LayoutDashboard,
  LogOut,
  Mail,
  MailCheck,
  Menu,
  Percent,
  PiggyBank,
  Repeat,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  UserPlus,
  Users,
} from 'lucide-react';

import { LanguageSwitcher } from '@/componets/site/language-switcher';
import { Logo } from '@/componets/site/logo';
import { Button } from '@/componets/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/componets/ui/sheet';
import { RequireRole, useAuth } from '@/lib/auth';
import { useMessages } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import adminMessages, { type AdminMessages } from '../_messages';

const NAV: { href: string; key: keyof AdminMessages['nav']; icon: typeof LayoutDashboard; exact?: boolean }[] = [
  { href: '/admin', key: 'overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/termine', key: 'slots', icon: CalendarClock },
  { href: '/admin/einstellungen', key: 'settings', icon: SlidersHorizontal },
  { href: '/admin/buchungen', key: 'bookings', icon: CalendarCheck },
  { href: '/admin/zahlungen', key: 'payments', icon: CreditCard },
  { href: '/admin/auszahlungen', key: 'payouts', icon: Banknote },
  { href: '/admin/provision', key: 'commission', icon: Percent },
  { href: '/admin/finanzen', key: 'finance', icon: PiggyBank },
  { href: '/admin/aktionen', key: 'promotions', icon: Tag },
  { href: '/admin/gutscheine', key: 'giftCards', icon: Gift },
  { href: '/admin/auswertungen', key: 'analytics', icon: BarChart3 },
  { href: '/admin/kunden', key: 'customers', icon: Users },
  { href: '/admin/reinigungskraefte', key: 'workers', icon: Sparkles },
  { href: '/admin/bewerbungen', key: 'applications', icon: UserPlus },
  { href: '/admin/bewertungen', key: 'reviews', icon: Star },
  { href: '/admin/anfragen', key: 'business', icon: Building2 },
  { href: '/admin/nachrichten', key: 'messages', icon: Mail },
  { href: '/admin/administratoren', key: 'admins', icon: ShieldCheck },
  { href: '/admin/protokoll', key: 'audit', icon: ScrollText },
  { href: '/admin/emails', key: 'emails', icon: MailCheck },
  // [slot-A-nav]
  { href: '/admin/putzplaene', key: 'series', icon: Repeat },
  // [slot-B-nav]
  // [slot-C-nav]
  // [slot-D-nav]
  // [slot-E-nav]
  // [slot-F-nav]
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() || '';
  const t = useMessages(adminMessages);
  return (
    <nav aria-label={t.shell.navLabel}>
      <ul className="space-y-1">
        {NAV.map(({ href, key, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'bg-mint text-pine-dark' : 'text-muted-grey hover:bg-cream hover:text-pine'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-pine' : '')} aria-hidden="true" />
                {t.nav[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function UserBox() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const t = useMessages(adminMessages);
  return (
    <div className="border-t border-border pt-4">
      <LanguageSwitcher className="mb-3" />
      <p className="truncate text-sm font-semibold text-charcoal">{user?.name}</p>
      <p className="truncate text-xs text-muted-grey">{user?.email}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 w-full justify-start px-2 text-muted-grey"
        onClick={() => {
          logout();
          router.push('/login');
        }}
      >
        <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
        {t.shell.logout}
      </Button>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const t = useMessages(adminMessages);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <RequireRole roles={['admin']}>
      <div className="min-h-screen bg-cream">
        <a
          href="#admin-main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow"
        >
          {t.shell.skipToContent}
        </a>

        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-white px-4 py-6 lg:flex">
          <div className="mb-8 flex items-center gap-2 px-2">
            <Logo href="/admin" />
            <span className="rounded-full bg-mint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-pine">
              {t.shell.badge}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <NavLinks />
          </div>
          <UserBox />
        </aside>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <Logo href="/admin" />
          <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={t.shell.openMenu}>
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col bg-white">
              <SheetTitle className="mb-4 text-base text-pine-dark">{t.shell.menuTitle}</SheetTitle>
              <div className="flex-1 overflow-y-auto">
                <NavLinks onNavigate={() => setOpen(false)} />
              </div>
              <UserBox />
            </SheetContent>
          </Sheet>
          </div>
        </header>

        <main id="admin-main" tabIndex={-1} className="focus:outline-none px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </RequireRole>
  );
}
