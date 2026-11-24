import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';
import messages from '../_messages';
import { ProfileView } from '../_components/profile-view';
import { WelcomeCodeCard } from '../_components/welcome-code-card';

export function generateMetadata(): Metadata {
  return { title: getMessages(messages).meta.profile };
}

export default function ProfilePage() {
  return (
    <>
      <WelcomeCodeCard />
      <ProfileView />
    </>
  );
}
