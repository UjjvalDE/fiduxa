'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, ClipboardList, Clock, Home, UserRound, Wallet } from 'lucide-react';

import { useAuth } from '@/lib/auth';
import { useMessages } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import portalMessages from '../_portal-messages';
import { canEditProfile, setupComplete, useWorkerOverview } from './worker-context';

type Item = { href: string; label: string; short?: string; icon: typeof Home; badge?: boolean };

function useNavItems(): Item[] | null {
  const { user } = useAuth();
  const { data } = useWorkerOverview();
  const t = useMessages(portalMessages).nav;
  if (user?.role !== 'worker' || !data) return null;

  const approved = data.worker.workerStatus === 'approved';
  const complete = setupComplete(data);
  const items: Item[] = [{ href: '/worker', label: t.home, icon: Home }];
  if (!approved || !complete) items.push({ href: '/worker/einrichtung', label: t.setup, icon: ClipboardList, badge: !complete });
  if (approved) {
    items.push({ href: '/worker/kalender', label: t.calendar, icon: CalendarDays });
    items.push({ href: '/worker/verdienst', label: t.earnings, icon: Wallet });
  }
  if (canEditProfile(data)) {
    items.push({ href: '/worker/profil', label: t.profile, icon: UserRound });
    items.push({ href: '/worker/verfuegbarkeit', label: t.availability, short: t.availabilityShort, icon: Clock });
  }
  return items;
}

const isActive = (pathname: string, href: string) =>
  href === '/worker' ? pathname === '/worker' || pathname.startsWith('/worker/jobs') : pathname.startsWith(href);

/** Tab row under the header (≥ sm) */
export function WorkerNavTabs() {
  const items = useNavItems();
  const pathname = usePathname() ?? '';
  const t = useMessages(portalMessages).nav;
  if (!items || items.length < 2) return null;
  return (
    <nav aria-label={t.label} className="hidden border-t border-border sm:block">
      <ul className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-4">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[44px] items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-pine text-pine-dark' : 'border-transparent text-muted-grey hover:text-pine-dark'
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
                {item.badge && (
                  <>
                    <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                    <span className="sr-only">{t.setupOpen}</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Fixed bottom bar on phones (< sm) */
export function WorkerNavBottom() {
  const items = useNavItems();
  const pathname = usePathname() ?? '';
  const t = useMessages(portalMessages).nav;
  if (!items || items.length < 2) return null;
  return (
    <nav
      aria-label={t.label}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="flex">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-medium leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  active ? 'text-pine-dark' : 'text-muted-grey'
                )}
              >
                <span className={cn('relative rounded-full px-3 py-1', active && 'bg-mint')}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {item.badge && (
                    <span className="absolute right-1.5 top-0.5 h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                  )}
                </span>
                <span className="w-full truncate text-center">{item.short ?? item.label}</span>
                {item.badge && <span className="sr-only">{t.setupOpen}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

