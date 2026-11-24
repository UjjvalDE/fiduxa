import { Suspense } from 'react';
import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';
import messages from './_messages';
import { VerifyEmailView } from './_components/verify-email-view';

export function generateMetadata(): Metadata {
  return { title: getMessages(messages).meta.title, robots: { index: false } };
}

// Link from the confirmation email: /email-bestaetigen?token=…
export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailView />
    </Suspense>
  );
}
