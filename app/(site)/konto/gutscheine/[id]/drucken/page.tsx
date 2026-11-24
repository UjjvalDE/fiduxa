import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';
import giftMessages from '../../../../gutscheine/_messages';
import { GiftCardPrintView } from './print-view';

export function generateMetadata(): Metadata {
  return { title: getMessages(giftMessages).print.title, robots: { index: false } };
}

export default function GiftCardPrintPage({ params }: { params: { id: string } }) {
  return <GiftCardPrintView id={params.id} />;
}
