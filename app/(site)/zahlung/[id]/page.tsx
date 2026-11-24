import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequireRole } from '@/lib/auth';
import { getMessages } from '@/lib/i18n/server';
import messages from '../_messages';
import { PaymentView } from '../_components/payment-view';

export function generateMetadata(): Metadata {
  const t = getMessages(messages);
  return { title: t.meta.pay, robots: { index: false } };
}

export default function PaymentPage({ params }: { params: { id: string } }) {
  return (
    <RequireRole roles={['consumer']}>
      <Suspense>
        <PaymentView bookingId={params.id} />
      </Suspense>
    </RequireRole>
  );
}
