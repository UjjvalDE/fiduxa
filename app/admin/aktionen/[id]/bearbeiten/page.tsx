'use client';

import { useMessages } from '@/lib/i18n/client';
import type { AdminPromotion } from '@/lib/types';

import { DetailSkeleton, ErrorState, PageHeader } from '../../../_components/states';
import { useApi } from '../../../_components/use-api';
import promotionMessages from '../../_messages';
import { PromotionForm } from '../../_components/promotion-form';

export default function EditPromotionPage({ params }: { params: { id: string } }) {
  const t = useMessages(promotionMessages);
  // limit=1: only the promotion is needed here, not the redemptions
  const { data, error, errorStatus, reload } = useApi<{ promotion: AdminPromotion }>(`/admin/promotions/${params.id}?limit=1`);

  if (error && !data) {
    return (
      <>
        <PageHeader title={t.form.createTitle} backHref="/admin/aktionen" backLabel={t.detail.back} />
        <ErrorState message={error} onRetry={errorStatus === 404 || errorStatus === 400 ? undefined : reload} />
      </>
    );
  }
  if (!data) return <DetailSkeleton />;

  return (
    <>
      <PageHeader
        backHref={`/admin/aktionen/${params.id}`}
        backLabel={data.promotion.name}
        title={t.form.editTitle(data.promotion.name)}
      />
      <PromotionForm promotion={data.promotion} />
    </>
  );
}
