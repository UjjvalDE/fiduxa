import type { GiftCardConfig } from '@/lib/types';
import { serverApiGet } from '../../_shared/server-api';

/** GET /gift-cards/config on the server (FAQ numbers) – null if the API is unreachable */
export const fetchGiftCardConfig = () => serverApiGet<GiftCardConfig>('/gift-cards/config', { revalidate: 300 });
