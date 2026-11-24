import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n/server';
import { HomePage } from './_home/home-page';
import homeMessages from './_home/messages';
import { fetchActivePromotions, fetchGiftConfig } from './_home/promotions';
import { fetchHomeTrust } from './_home/trust';

export function generateMetadata(): Metadata {
  const t = getMessages(homeMessages);
  return {
    title: { absolute: t.metaTitle },
    description: t.metaDescription,
    openGraph: { title: t.metaTitle, description: t.metaDescription, type: 'website', images: ['/images/home-hero.jpg'] },
  };
}

export default async function Home() {
  const [promotions, giftConfig, trust] = await Promise.all([fetchActivePromotions(), fetchGiftConfig(), fetchHomeTrust()]);
  return <HomePage promotions={promotions} giftConfig={giftConfig} trust={trust} />;
}
