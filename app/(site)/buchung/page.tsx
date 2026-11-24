import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoaderCircle } from 'lucide-react';

import { getMessages } from '@/lib/i18n/server';
import messages from './_messages';
import { BookingWizard } from './_components/booking-wizard';

export function generateMetadata(): Metadata {
  const t = getMessages(messages);
  return { title: t.meta.title, description: t.meta.description };
}

export default function BookingPage() {
  const t = getMessages(messages);
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-grey" role="status">
          <LoaderCircle className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> {t.preparing}
        </div>
      }
    >
      <BookingWizard />
    </Suspense>
  );
}
