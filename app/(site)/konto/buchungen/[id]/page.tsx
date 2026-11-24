import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';
import messages from '../../_messages';
import { BookingDetail } from '../../_components/booking-detail';

export function generateMetadata(): Metadata {
  return { title: getMessages(messages).meta.detail };
}

export default function BookingDetailPage({ params }: { params: { id: string } }) {
  return <BookingDetail id={params.id} />;
}
