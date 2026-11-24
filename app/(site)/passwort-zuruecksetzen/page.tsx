import { Suspense } from 'react';
import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';
import authMessages from '../buchung/_auth-messages';
import { AuthPending } from '../buchung/_components/auth-shell';
import { ResetPasswordView } from './_components/reset-password-view';

export function generateMetadata({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }): Metadata {
  const t = getMessages(authMessages).reset;
  // Never let the one-time token leak via the Referer header
  return {
    title: searchParams.neu === '1' ? t.titleNew : t.metaTitle,
    description: t.metaDescription,
    robots: { index: false },
    referrer: 'no-referrer',
  };
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthPending />}>
      <ResetPasswordView />
    </Suspense>
  );
}
