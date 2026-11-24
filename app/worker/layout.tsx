import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';

import messages from './_messages';
import { WorkerProvider } from './_components/worker-context';
import { WorkerHeader } from './_components/worker-header';
import { WorkerNavBottom } from './_components/worker-nav';

export function generateMetadata(): Metadata {
  const t = getMessages(messages);
  return {
    title: t.meta.title,
    robots: { index: false, follow: false },
  };
}

// No role guard here: /worker/einladung must stay public.
// Protected pages wrap themselves in <RequireRole roles={['worker']}>.
export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkerProvider>
      <div className="min-h-screen bg-cream">
        <WorkerHeader />
        <main id="worker-main" tabIndex={-1} className="mx-auto max-w-3xl px-4 pb-28 pt-6 focus:outline-none sm:pb-16">
          {children}
        </main>
        <WorkerNavBottom />
      </div>
    </WorkerProvider>
  );
}
