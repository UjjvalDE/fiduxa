// Live trust data for the homepage (GET /home/trust, fetched on the server,
// cached 5 min): rating summary, latest reviews with text, the cleaner's pay
// share and the free cancellation window. Null when the API is unreachable –
// the sections that depend on it are then simply not rendered.
import type { HomeTrust } from '@/lib/types';
import { serverApiGet } from '../(site)/_shared/server-api';

/** Below this many reviews the rating is not meaningful enough to show */
export const MIN_REVIEWS_FOR_RATING = 5;

export const fetchHomeTrust = () => serverApiGet<HomeTrust>('/home/trust', { revalidate: 300 });

/** Rating summary to display, or null when it must stay hidden */
export function visibleRating(trust: HomeTrust | null) {
  const rating = trust?.rating;
  if (!rating || rating.average == null || rating.count < MIN_REVIEWS_FOR_RATING) return null;
  return { average: rating.average, count: rating.count };
}
