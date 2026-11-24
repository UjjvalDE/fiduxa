'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

import { LanguageSwitcher } from '@/componets/site/language-switcher';
import { Logo } from '@/componets/site/logo';
import { Button } from '@/componets/ui/button';
import { useAuth } from '@/lib/auth';
import { useMessages } from '@/lib/i18n/client';

import messages from '../_messages';
import { WorkerNavTabs } from './worker-nav';

export function WorkerHeader() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const t = useMessages(messages);
  const isWorker = user?.role === 'worker';

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
      <a
        href="#worker-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        {t.header.skipToContent}
      </a>
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Logo href={isWorker ? '/worker' : '/'} />
        <div className="flex min-w-0 items-center gap-2">
          <LanguageSwitcher />
          {isWorker && (
            <>
              <span className="hidden truncate text-sm font-medium text-charcoal sm:inline">{user.name}</span>
              <Button
                type="button"
                variant="ghost"
                className="h-11 px-3 text-muted-grey"
                onClick={() => {
                  logout();
                  router.push('/login');
                }}
              >
                <LogOut className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{t.header.logout}</span>
              </Button>
            </>
          )}
        </div>
      </div>
      <WorkerNavTabs />
    </header>
  );
}
