// Live promotions for the homepage (GET /promotions/active, fetched on the
// server, cached 60 s). A campaign disappears automatically once the API stops
// returning it – nothing campaign-related is hardcoded in the frontend.
import type { GiftCardConfig, PromotionBanner } from '@/lib/types';
import { serverApiGet } from '../(site)/_shared/server-api';

export async function fetchActivePromotions(): Promise<PromotionBanner[]> {
  const res = await serverApiGet<{ promotions?: PromotionBanner[] }>('/promotions/active', { revalidate: 60 });
  const now = Date.now();
  // Belt and braces: never show an ended campaign from a stale cache
  return (res?.promotions ?? []).filter((p) => !p.endsAt || new Date(p.endsAt).getTime() > now);
}

export const fetchGiftConfig = () => serverApiGet<GiftCardConfig>('/gift-cards/config', { revalidate: 300 });

/** Split by placement; the API already sorts by priority (highest first) */
export function groupPromotions(promotions: PromotionBanner[]) {
  const heroes = promotions.filter((p) => p.placement === 'hero');
  return {
    hero: heroes[0] ?? null,
    banners: promotions.filter((p) => p.placement === 'banner'),
    // Further hero campaigns are shown as cards
    cards: [...promotions.filter((p) => p.placement === 'card'), ...heroes.slice(1)],
  };
}
