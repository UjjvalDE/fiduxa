import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequireRole } from '@/lib/auth';
import { getMessages } from '@/lib/i18n/server';
import messages from '../_messages';
import { PaymentSuccess } from '../_components/payment-success';

export function generateMetadata(): Metadata {
  const t = getMessages(messages);
  return { title: t.meta.status, robots: { index: false } };
}

export default function PaymentSuccessPage() {
  return (
    <RequireRole roles={['consumer']}>
      <Suspense>
        <PaymentSuccess />
      </Suspense>
    </RequireRole>
  );
}
