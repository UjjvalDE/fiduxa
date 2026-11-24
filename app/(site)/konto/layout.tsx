import type { Metadata } from 'next';

import { RequireRole } from '@/lib/auth';
import { getMessages } from '@/lib/i18n/server';
import messages from './_messages';
import { AccountNav } from './_components/account-nav';
import { VerifyEmailBanner } from './_components/verify-email-banner';
import { AccountPrompts } from './_components/account-prompts';

export function generateMetadata(): Metadata {
  const t = getMessages(messages);
  return {
    title: { default: t.meta.account, template: t.meta.template },
    robots: { index: false },
  };
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="bg-cream py-8 sm:py-12">
      <div className="shell">
        <RequireRole roles={['consumer']}>
          <AccountNav />
          <VerifyEmailBanner />
          <AccountPrompts />
          <div className="mt-6 sm:mt-8">{children}</div>
        </RequireRole>
      </div>
    </section>
  );
}
