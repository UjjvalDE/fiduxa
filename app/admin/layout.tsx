import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';

import adminMessages from './_messages';
import { AdminShell } from './_components/admin-shell';

export function generateMetadata(): Metadata {
  const t = getMessages(adminMessages);
  return {
    title: t.meta.title,
    robots: { index: false, follow: false },
  };
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
