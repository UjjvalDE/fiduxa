import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';
import authMessages from '../buchung/_auth-messages';
import { ForgotPasswordView } from './_components/forgot-password-view';

export function generateMetadata(): Metadata {
  const t = getMessages(authMessages).forgot;
  return { title: t.metaTitle, description: t.metaDescription };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordView />;
}
