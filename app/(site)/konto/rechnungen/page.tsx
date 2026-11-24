import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';
import messages from '../_service-messages';
import { InvoicesList } from '../_components/invoices-list';

export function generateMetadata(): Metadata {
  return { title: getMessages(messages).invoices.metaTitle };
}

export default function InvoicesPage() {
  return <InvoicesList />;
}
