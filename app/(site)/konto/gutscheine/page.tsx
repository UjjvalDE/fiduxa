import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';
import giftMessages from '../../gutscheine/_messages';
import { GiftCardsList } from '../_components/gift-cards-list';

export function generateMetadata(): Metadata {
  return { title: getMessages(giftMessages).meta.accountTitle };
}

export default function AccountGiftCardsPage() {
  return <GiftCardsList />;
}
