'use client';

// Friendly error screen used by the Next.js error boundaries (app/error.tsx
// and the segment error.tsx files). Never shows raw error text; "Try again"
// re-renders the segment (form drafts live in sessionStorage, so they survive).
import { useEffect } from 'react';
import Link from 'next/link';
import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';

import { useMessages } from '@/lib/i18n/client';
import messages from './messages';
import { useNetworkStatus, useOnRecovered } from './network-status';

export function ErrorView({ error, reset, homeHref = '/' }: { error: Error & { digest?: string }; reset: () => void; homeHref?: string }) {
  const t = useMessages(messages);
  const { online } = useNetworkStatus();

  useEffect(() => {
    // Visible in the browser console / monitoring, never on the page
    console.error(error);
  }, [error]);

  // Came back online → try again automatically
  useOnRecovered(reset);

  return (
    <div className="shell grid min-h-[60vh] place-items-center py-16">
      <section className="max-w-lg rounded-2xl border border-border bg-white p-8 text-center" role="alert">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-50 text-amber-700">
          {online ? <TriangleAlert className="h-7 w-7" aria-hidden="true" /> : <CloudOff className="h-7 w-7" aria-hidden="true" />}
        </span>
        <p className="mb-0 mt-4 text-xs font-bold uppercase tracking-wider text-muted-grey">{t.errorEyebrow}</p>
        <h1 className="mb-0 mt-1 text-2xl font-extrabold text-pine-dark">{t.errorTitle}</h1>
        <p className="mb-0 mt-3 text-sm leading-relaxed text-muted-grey">{online ? t.errorText : t.errorOffline}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" className="button" onClick={reset}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t.tryAgain}
          </button>
          <Link href={homeHref} className="button button-quiet">
            {t.home}
          </Link>
        </div>
        {error.digest && (
          <p className="mb-0 mt-5 text-xs text-muted-grey">
            {t.errorRef}: <code>{error.digest}</code>
          </p>
        )}
      </section>
    </div>
  );
}
