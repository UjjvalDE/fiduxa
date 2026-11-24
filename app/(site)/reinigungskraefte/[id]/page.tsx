import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';
import messages from '../_messages';
import { CleanerProfileView } from '../_components/cleaner-profile-view';

export function generateMetadata(): Metadata {
  const t = getMessages(messages);
  // Reached from the booking details only – not part of the public site index
  return { title: t.meta.profileTitle, description: t.meta.profileDescription, robots: { index: false } };
}

export default function CleanerProfilePage({ params }: { params: { id: string } }) {
  return <CleanerProfileView id={params.id} />;
}
