import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';
import messages from './_messages';
import { BookingsList } from './_components/bookings-list';

export function generateMetadata(): Metadata {
  return { title: getMessages(messages).meta.bookings };
}

export default function AccountPage() {
  return <BookingsList />;
}
