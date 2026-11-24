import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';
import messages from '../_putzplan-messages';
import { PutzplanList } from '../_components/putzplan-list';

export function generateMetadata(): Metadata {
  return { title: getMessages(messages).meta.title };
}

export default function AccountPutzplanPage() {
  return <PutzplanList />;
}
