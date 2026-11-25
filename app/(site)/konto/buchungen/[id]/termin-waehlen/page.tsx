import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';
import messages from '../../../_alternatives-messages';
import { ChooseAlternative } from '../../../_components/choose-alternative';

export function generateMetadata(): Metadata {
  return { title: getMessages(messages).metaTitle };
}

export default function ChooseAlternativePage({ params }: { params: { id: string } }) {
  return <ChooseAlternative id={params.id} />;
}
