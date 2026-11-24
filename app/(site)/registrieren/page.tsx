import { Suspense } from 'react';
import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';
import authMessages from '../buchung/_auth-messages';
import { AuthPending } from '../buchung/_components/auth-shell';
import { RegisterView } from './_components/register-view';

export function generateMetadata(): Metadata {
  const t = getMessages(authMessages).register;
  return { title: t.metaTitle, description: t.metaDescription };
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthPending />}>
      <RegisterView />
    </Suspense>
  );
}
