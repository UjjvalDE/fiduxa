import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RequireRole } from '@/lib/auth';
import { getMessages } from '@/lib/i18n/server';
import messages from '../_messages';
import { PayPalReturn } from '../_components/paypal-return';

export function generateMetadata(): Metadata {
  const t = getMessages(messages);
  return { title: t.meta.status, robots: { index: false } };
}

// PayPal sends the customer back here: /zahlung/paypal?booking=<id>&token=<orderId>&PayerID=…
export default function PayPalReturnPage() {
  return (
    <RequireRole roles={['consumer']}>
      <Suspense>
        <PayPalReturn />
      </Suspense>
    </RequireRole>
  );
}
