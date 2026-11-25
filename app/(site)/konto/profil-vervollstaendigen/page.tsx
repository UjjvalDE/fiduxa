import { Suspense } from 'react';
import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';
import { AuthPending } from '../../buchung/_components/auth-shell';
import messages from './_messages';
import { CompleteProfileView } from './_components/complete-profile-view';

export function generateMetadata(): Metadata {
  return { title: getMessages(messages).metaTitle };
}

export default function CompleteProfilePage() {
  return (
    <Suspense fallback={<AuthPending />}>
      <CompleteProfileView />
    </Suspense>
  );
}
