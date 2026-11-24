'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, FileText, Gift, LogOut, Repeat, UserRound } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/lib/auth';
import { useMessages } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import messages from '../_messages';
import serviceMessages from '../_service-messages';
import { firstName } from './booking-helpers';

const LINKS = [
  { href: '/konto', key: 'bookings', icon: CalendarDays, match: (p: string) => p === '/konto' || p.startsWith('/konto/buchungen') },
  { href: '/konto/putzplan', key: 'putzplan', icon: Repeat, match: (p: string) => p.startsWith('/konto/putzplan') },
  { href: '/konto/rechnungen', key: 'invoices', icon: FileText, match: (p: string) => p.startsWith('/konto/rechnungen') },
  { href: '/konto/gutscheine', key: 'giftCards', icon: Gift, match: (p: string) => p.startsWith('/konto/gutscheine') },
  { href: '/konto/profil', key: 'profile', icon: UserRound, match: (p: string) => p.startsWith('/konto/profil') },
] as const;

export function AccountNav() {
  const pathname = usePathname() ?? '';
  const { user, logout } = useAuth();
  const t = { ...useMessages(messages).nav, ...useMessages(serviceMessages).nav };

  const onLogout = () => {
    logout();
    toast.success(t.loggedOut);
    // Full navigation so the account guard does not bounce to /login first
    window.location.assign('/');
  };

  return (
    <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="eyebrow">
          <span className="eyebrow-dot" aria-hidden="true" /> {t.eyebrow}
        </div>
        <p className="mb-0 mt-3 text-2xl font-bold tracking-tight text-pine-dark sm:text-3xl">{t.hello(firstName(user?.name))}</p>
      </div>
      <nav aria-label={t.label}>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {LINKS.map(({ href, key, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-[44px] items-center gap-2 rounded-[10px] border px-3.5 py-2.5 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine',
                    active ? 'border-pine bg-mint text-pine-dark' : 'border-border bg-white text-muted-grey hover:text-pine'
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {t[key]}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] border border-border bg-white px-3.5 py-2.5 text-sm font-bold text-muted-grey transition-colors hover:text-pine focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {t.logout}
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
