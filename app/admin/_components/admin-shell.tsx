'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  FileCheck2,
  Banknote,
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarClock,
  ChevronDown,
  CreditCard,
  Gift,
  LayoutDashboard,
  LogOut,
  Mail,
  MailCheck,
  Menu,
  MessageSquareText,
  MessageSquareWarning,
  Percent,
  PiggyBank,
  Repeat,
  Route,
  ScrollText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  UserPlus,
  Users,
  X,
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
  { href: '/admin/dokumente', key: 'documents', icon: FileCheck2 },
  { href: '/admin/bewerbungen', key: 'applications', icon: UserPlus },
  { href: '/admin/bewertungen', key: 'reviews', icon: Star },
  { href: '/admin/feedback', key: 'feedback', icon: MessageSquareText },
  { href: '/admin/beschwerden', key: 'complaints', icon: MessageSquareWarning },
  { href: '/admin/anfragen', key: 'business', icon: Building2 },
  { href: '/admin/nachrichten', key: 'messages', icon: Mail },
  { href: '/admin/administratoren', key: 'admins', icon: ShieldCheck },
  { href: '/admin/protokoll', key: 'audit', icon: ScrollText },
  { href: '/admin/emails', key: 'emails', icon: MailCheck },
  // [slot-A-nav]
  { href: '/admin/putzplaene', key: 'series', icon: Repeat },
  { href: '/admin/disposition', key: 'dispatch', icon: Route },
  // [slot-B-nav]
  // [slot-C-nav]
  // [slot-D-nav]
  // [slot-E-nav]
  // [slot-F-nav]
];

type GroupKey = keyof AdminMessages['shell']['groups'];

// Sidebar groups (desktop-first). Every NAV entry must appear in exactly one group;
// entries missing here are shown under "System" so nothing becomes unreachable.
const GROUPS: { key: GroupKey; items: string[] }[] = [
  { key: 'start', items: ['/admin', '/admin/auswertungen'] },
  { key: 'bookings', items: ['/admin/buchungen', '/admin/termine', '/admin/putzplaene', '/admin/disposition'] },
  { key: 'team', items: ['/admin/reinigungskraefte', '/admin/dokumente', '/admin/bewerbungen', '/admin/bewertungen'] },
  { key: 'customers', items: ['/admin/kunden', '/admin/beschwerden', '/admin/feedback', '/admin/anfragen', '/admin/nachrichten'] },
  { key: 'finance', items: ['/admin/zahlungen', '/admin/auszahlungen', '/admin/provision', '/admin/finanzen'] },
  { key: 'marketing', items: ['/admin/aktionen', '/admin/gutscheine'] },
  { key: 'system', items: ['/admin/einstellungen', '/admin/administratoren', '/admin/protokoll', '/admin/emails'] },
];

// Search keywords (all languages) that jump straight to a section of Einstellungen.
const SETTINGS_KEYWORDS: { section: string; keywords: string[] }[] = [
  { section: 'preise', keywords: ['preis', 'stundenpreis', 'stundensatz', 'mwst', 'ust', 'umsatzsteuer', 'vat', 'price', 'hourly', 'rate', 'tax', 'cena', 'stawka', 'podatek', 'minimum', 'mindest'] },
  { section: 'zusatzleistungen', keywords: ['extra', 'zusatz', 'fenster', 'kühlschrank', 'ofen', 'bügeln', 'window', 'fridge', 'oven', 'ironing', 'dodatk', 'okna'] },
  { section: 'buchungsregeln', keywords: ['buchung', 'vorlauf', 'puffer', 'fahrzeit', 'dauer', 'stunden', 'booking', 'lead time', 'buffer', 'travel', 'duration', 'slot', 'kapazität', 'capacity', 'rezerwac', 'bufor'] },
  { section: 'zahlungsarten', keywords: ['zahlung', 'paypal', 'bar', 'cash', 'karte', 'stripe', 'rechnung', 'payment', 'card', 'invoice', 'płatno', 'gotówka', 'faktura'] },
  { section: 'gutscheine', keywords: ['gutschein', 'geschenk', 'gift', 'voucher', 'bon', 'prezent'] },
  { section: 'verguetung', keywords: ['vergütung', 'lohn', 'gehalt', 'stundenlohn', 'pay', 'wage', 'salary', 'wynagrodz', 'pensja'] },
  { section: 'provision', keywords: ['provision', 'kommission', 'stufe', 'bronze', 'silber', 'gold', 'commission', 'tier', 'silver', 'prowizj', 'poziom'] },
  { section: 'richtlinien', keywords: ['richtlinie', 'storno', 'stornogebühr', 'absage', 'kündigung', 'auszahlung', 'erstattung', 'rückerstattung', 'bargeld', 'limit', 'policy', 'cancel', 'cancellation', 'fee', 'payout', 'refund', 'anulow', 'opłata', 'wypłat', 'zwrot', 'zasady'] },
];

const COLLAPSED_KEY = 'fiduxa_admin_nav_collapsed';

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const t = useMessages(adminMessages);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [shortcut, setShortcut] = useState('Ctrl K');

  // Cmd+K (Mac) / Ctrl+K (Windows) focuses the menu search
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut('⌘K');
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && inputRef.current?.offsetParent) {
        e.preventDefault();
        inputRef.current.focus();
        inputRef.current.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      setCollapsed(JSON.parse(window.localStorage.getItem(COLLAPSED_KEY) || '{}'));
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  const grouped = new Set(GROUPS.flatMap((g) => g.items));
  const groups = GROUPS.map((g) => ({
    key: g.key,
    items: [...g.items.map((h) => NAV.find((n) => n.href === h)), ...(g.key === 'system' ? NAV.filter((n) => !grouped.has(n.href)) : [])].filter(
      (n): n is (typeof NAV)[number] => Boolean(n)
    ),
  }));

  const q = query.trim().toLowerCase();
  const matches = (item: (typeof NAV)[number], groupKey: GroupKey) =>
    !q || t.nav[item.key].toLowerCase().includes(q) || t.shell.groups[groupKey].toLowerCase().includes(q) || item.href.includes(q);
  const visible = groups.map((g) => ({ ...g, items: g.items.filter((i) => matches(i, g.key)) })).filter((g) => g.items.length > 0);
  const settingsHits =
    q.length < 2
      ? []
      : SETTINGS_KEYWORDS.filter(
          (s) => s.keywords.some((k) => k.includes(q) || q.includes(k)) || (t.shell.settingsSections[s.section] ?? '').toLowerCase().includes(q)
        );
  const firstHref = visible[0]?.items[0]?.href ?? (settingsHits[0] && `/admin/einstellungen#${settingsHits[0].section}`);

  return (
    <nav aria-label={t.shell.navLabel}>
      <div className="group relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-grey transition-colors group-focus-within:text-pine"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="searchbox"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && firstHref) {
              router.push(firstHref);
              setQuery('');
              onNavigate?.();
            }
            if (e.key === 'Escape') {
              setQuery('');
              e.currentTarget.blur();
            }
          }}
          placeholder={t.shell.searchPlaceholder}
          aria-label={t.shell.searchPlaceholder}
          autoComplete="off"
          spellCheck={false}
          className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-12 text-sm text-charcoal shadow-sm outline-none transition placeholder:text-muted-grey/80 hover:border-pine/30 focus:border-pine/50 focus:ring-4 focus:ring-mint"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-grey hover:bg-cream hover:text-pine"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-border bg-cream px-1.5 py-0.5 font-sans text-[10px] font-semibold text-muted-grey">
            {shortcut}
          </kbd>
        )}
      </div>
      {visible.length === 0 && settingsHits.length === 0 && <p className="px-3 text-sm text-muted-grey">{t.shell.searchEmpty}</p>}
      {settingsHits.length > 0 && (
        <div className="mb-2">
          <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-grey">{t.nav.settings}</p>
          <ul className="space-y-0.5">
            {settingsHits.map((hit) => (
              <li key={hit.section}>
                <Link
                  href={`/admin/einstellungen#${hit.section}`}
                  onClick={onNavigate}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-grey transition-colors hover:bg-cream hover:text-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t.shell.settingsSections[hit.section]}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-2">
        {visible.map((g) => {
          const hasActive = g.items.some((i) => isActive(i.href, i.exact));
          const open = Boolean(q) || hasActive || !collapsed[g.key];
          return (
            <div key={g.key}>
              <button
                type="button"
                onClick={() => toggle(g.key)}
                aria-expanded={open}
                className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-grey hover:text-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t.shell.groups[g.key]}
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open ? '' : '-rotate-90')} aria-hidden="true" />
              </button>
              {open && (
                <ul className="mt-0.5 space-y-0.5">
                  {g.items.map(({ href, key, icon: Icon, exact }) => {
                    const active = isActive(href, exact);
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          onClick={onNavigate}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
              )}
            </div>
          );
        })}
      </div>
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
