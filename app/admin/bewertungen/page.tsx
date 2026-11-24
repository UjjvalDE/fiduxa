'use client';

import { Suspense } from 'react';
import { Star } from 'lucide-react';

import { Tabs, TabsList, TabsTrigger } from '@/componets/ui/tabs';
import { useMessages } from '@/lib/i18n/client';
import type { AdminReview } from '@/lib/types';

import { ReviewList } from '../_components/review-list';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '../_components/states';
import { useApi, useQueryParams } from '../_components/use-api';
import messages from './_messages';

const KEYS = ['filter'] as const;

function ReviewsInner() {
  const t = useMessages(messages);
  const { values, setParams } = useQueryParams(KEYS);
  const filter = values.filter === 'visible' || values.filter === 'hidden' ? values.filter : '';
  const { data, error, loading, reload, setData } = useApi<{ reviews: AdminReview[] }>('/admin/reviews');

  const reviews = (data?.reviews ?? []).filter((r) => (filter === 'hidden' ? r.hidden : filter === 'visible' ? !r.hidden : true));
  const update = (next: AdminReview) =>
    setData((prev) => (prev ? { reviews: prev.reviews.map((r) => (r._id === next._id ? next : r)) } : prev));

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(value) => setParams({ filter: value })}>
          <TabsList aria-label={t.tabsLabel}>
            <TabsTrigger value="">{t.tabAll}</TabsTrigger>
            <TabsTrigger value="visible">{t.tabVisible}</TabsTrigger>
            <TabsTrigger value="hidden">{t.tabHidden}</TabsTrigger>
          </TabsList>
        </Tabs>
        {data && <p className="text-xs text-muted-grey">{t.shownOf(reviews.length, data.reviews.length)}</p>}
      </div>
      <p className="mb-4 text-sm text-muted-grey">{t.hint}</p>

      {loading && !data ? (
        <ListSkeleton label={t.loading} />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : reviews.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyText} icon={Star} />
      ) : (
        <ReviewList reviews={reviews} onChanged={update} />
      )}
    </>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ReviewsInner />
    </Suspense>
  );
}
