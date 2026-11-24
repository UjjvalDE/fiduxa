'use client';

import { ArrowRight, Tag } from 'lucide-react';

import type { PromotionPlacement, PromotionTheme } from '@/lib/types';
import { cn } from '@/lib/utils';

import { THEME_CLASSES } from '../../_components/promo-utils';

export interface PreviewContent {
  placement: PromotionPlacement;
  theme: PromotionTheme;
  title: string;
  text: string;
  ctaText: string;
  badge: string;
  imageUrl: string;
  code: string;
  codeLabel: string;
}

/** Approximate look of the public banner for the chosen placement and theme */
export function PromotionPreview({ content }: { content: PreviewContent }) {
  const theme = THEME_CLASSES[content.theme] ?? THEME_CLASSES.pine;
  // Only show safe image URLs in the preview
  const image = /^(https:\/\/|\/)[^\s"'()]*$/.test(content.imageUrl) ? content.imageUrl : '';

  const badge = content.badge && (
    <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide', theme.badge)}>
      {content.badge}
    </span>
  );
  const code = content.code && (
    <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-current px-2 py-0.5 font-mono text-xs font-semibold">
      <Tag className="h-3 w-3" aria-hidden="true" />
      {content.codeLabel}
    </span>
  );
  const cta = content.ctaText && (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold shadow-sm', theme.cta)}>
      {content.ctaText}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </span>
  );

  if (content.placement === 'banner') {
    return (
      <div className={cn('flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl px-4 py-3 text-center', theme.box)}>
        {badge}
        <span className="text-sm font-semibold">{content.title}</span>
        {content.text && <span className={cn('hidden text-sm sm:inline', theme.muted)}>{content.text}</span>}
        {code}
        {content.ctaText && <span className="text-sm font-semibold underline underline-offset-4">{content.ctaText}</span>}
      </div>
    );
  }

  if (content.placement === 'card') {
    return (
      <div className={cn('mx-auto max-w-xs overflow-hidden rounded-2xl shadow-sm', theme.box)}>
        {image && (
          <div className="h-28 bg-cover bg-center" style={{ backgroundImage: `url("${image}")` }} role="img" aria-hidden="true" />
        )}
        <div className="space-y-2 p-4">
          {badge}
          <p className="text-lg font-bold leading-tight">{content.title}</p>
          {content.text && <p className={cn('text-sm', theme.muted)}>{content.text}</p>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {cta}
            {code}
          </div>
        </div>
      </div>
    );
  }

  // hero (also used for "none" in a dimmed state)
  return (
    <div className={cn('relative overflow-hidden rounded-2xl', theme.box)}>
      <div className="grid gap-4 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
        <div className="space-y-3">
          {badge}
          <p className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{content.title}</p>
          {content.text && <p className={cn('max-w-prose text-sm sm:text-base', theme.muted)}>{content.text}</p>}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {cta}
            {code}
          </div>
        </div>
        {image && (
          <div
            className="h-32 w-full rounded-xl bg-cover bg-center sm:h-36 sm:w-48"
            style={{ backgroundImage: `url("${image}")` }}
            role="img"
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}
