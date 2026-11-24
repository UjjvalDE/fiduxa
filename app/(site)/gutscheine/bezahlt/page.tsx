import { Suspense } from 'react';
import type { Metadata } from 'next';

import { RequireRole } from '@/lib/auth';
import { getMessages } from '@/lib/i18n/server';
import messages from '../_messages';
import { GiftCardReturn } from '../_components/gift-card-return';

export function generateMetadata(): Metadata {
  return { title: getMessages(messages).meta.paidTitle, robots: { index: false } };
}

// Provider return: /gutscheine/bezahlt?card=<id>&provider=paypal|stripe&token=<PayPal orderId>
export default function GiftCardPaidPage() {
  return (
    <RequireRole roles={['consumer']}>
      <Suspense>
        <GiftCardReturn />
      </Suspense>
    </RequireRole>
  );
}
