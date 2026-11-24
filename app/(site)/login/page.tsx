import { Suspense } from 'react';
import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';
import authMessages from '../buchung/_auth-messages';
import { AuthPending } from '../buchung/_components/auth-shell';
import { LoginView } from './_components/login-view';

export function generateMetadata(): Metadata {
  const t = getMessages(authMessages).login;
  return { title: t.metaTitle, description: t.metaDescription };
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthPending />}>
      <LoginView />
    </Suspense>
  );
}
