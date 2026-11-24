'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { useLocale, useMessages } from '@/lib/i18n/client';

import { DetailSkeleton, PageHeader } from '../../_components/states';
import { berlinToday } from '../../_components/use-api';
import promotionMessages from '../_messages';
import { TEMPLATES } from '../_templates';
import { PromotionForm, fromTemplate } from '../_components/promotion-form';
import { RulesInfo } from '../_components/promotion-parts';

function NewPromotion() {
  const t = useMessages(promotionMessages);
  const { locale } = useLocale();
  const key = useSearchParams().get('vorlage');
  const template = TEMPLATES.find((tpl) => tpl.key === key);
  return (
    <>
      <PageHeader
        backHref="/admin/aktionen"
        backLabel={t.detail.back}
        title={template ? `${t.form.createTitle}: ${t.templates[template.key]}` : t.form.createTitle}
        description={template ? t.templatesHint : undefined}
      />
      <RulesInfo />
      {/* key: switching templates remounts the form with fresh values */}
      <PromotionForm
        key={template?.key ?? 'blank'}
        initialDraft={template ? fromTemplate(template, berlinToday(), locale) : undefined}
      />
    </>
  );
}

export default function NewPromotionPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <NewPromotion />
    </Suspense>
  );
}
