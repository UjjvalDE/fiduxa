'use client';

// Fiduxa gift card artwork (pure CSS, no external assets): live preview in the
// shop, the purchased card on the return page and in the account.
import { Flower2, Gift, HeartHandshake, Sparkles, Star } from 'lucide-react';

import { useFormat, useMessages } from '@/lib/i18n/client';
import type { GiftCardDesign } from '@/lib/types';
import { cn } from '@/lib/utils';
import messages from '../_messages';

interface Theme {
  background: string;
  text: string;
  muted: string;
  accent: string;
  chip: string;
  Icon: typeof Gift;
}

export const GIFT_THEMES: Record<GiftCardDesign, Theme> = {
  classic: {
    background: 'radial-gradient(circle at 85% 15%, rgba(215,231,168,.28), transparent 45%), linear-gradient(135deg, #174D3A 0%, #103729 100%)',
    text: '#ffffff',
    muted: 'rgba(255,255,255,.72)',
    accent: '#D7E7A8',
    chip: 'rgba(255,255,255,.12)',
    Icon: Sparkles,
  },
  festive: {
    background:
      'radial-gradient(circle at 12% 20%, rgba(212,175,55,.35) 0 2px, transparent 3px), radial-gradient(circle at 78% 70%, rgba(255,255,255,.35) 0 1.5px, transparent 2.5px), radial-gradient(circle at 60% 18%, rgba(255,255,255,.3) 0 1.5px, transparent 2.5px), radial-gradient(circle at 30% 85%, rgba(212,175,55,.3) 0 2px, transparent 3px), linear-gradient(140deg, #0E3B2C 0%, #0A2A20 55%, #5E1219 100%)',
    text: '#FFF8E6',
    muted: 'rgba(255,248,230,.75)',
    accent: '#D9B44A',
    chip: 'rgba(217,180,74,.16)',
    Icon: Star,
  },
  spring: {
    background: 'radial-gradient(circle at 88% 12%, rgba(244,198,208,.85), transparent 40%), radial-gradient(circle at 8% 92%, rgba(215,231,168,.9), transparent 45%), linear-gradient(135deg, #F3F8F2 0%, #E4EFE7 100%)',
    text: '#103729',
    muted: '#4B5E54',
    accent: '#C2577A',
    chip: 'rgba(23,77,58,.08)',
    Icon: Flower2,
  },
  thanks: {
    background: 'radial-gradient(circle at 90% 10%, rgba(201,111,74,.25), transparent 42%), linear-gradient(135deg, #FBF6EC 0%, #F1E6D2 100%)',
    text: '#3D2A1E',
    muted: '#6E5A4B',
    accent: '#B25E3B',
    chip: 'rgba(61,42,30,.07)',
    Icon: HeartHandshake,
  },
};

export function GiftCardVisual({
  design,
  amountCents,
  recipientName,
  senderName,
  message,
  code,
  validUntil,
  size = 'lg',
  className,
}: {
  design: GiftCardDesign;
  amountCents: number | null;
  recipientName?: string;
  senderName?: string;
  message?: string;
  /** Real code once paid; placeholder otherwise */
  code?: string | null;
  validUntil?: string | null;
  size?: 'lg' | 'sm';
  className?: string;
}) {
  const t = useMessages(messages).preview;
  const f = useFormat();
  const theme = GIFT_THEMES[design] ?? GIFT_THEMES.classic;
  const { Icon } = theme;
  const small = size === 'sm';

  return (
    <div
      className={cn('relative isolate overflow-hidden rounded-[22px] shadow-[0_22px_45px_rgba(16,55,41,0.22)]', small ? 'p-4' : 'p-6 sm:p-7', className)}
      style={{ background: theme.background, color: theme.text }}
    >
      {/* Decorative ribbon */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 top-0 h-full w-24 rotate-12 opacity-60"
        style={{ background: `linear-gradient(180deg, transparent, ${theme.chip}, transparent)` }}
      />
      {design === 'festive' && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1.5" style={{ background: 'linear-gradient(90deg, #D9B44A, #B3262E, #D9B44A)' }} />
      )}
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className={cn('m-0 font-extrabold tracking-[-0.04em]', small ? 'text-lg' : 'text-2xl')}>
            fiduxa<span style={{ color: theme.accent }}>.</span>
          </p>
          <p className="m-0 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: theme.muted }}>
            {t.title}
          </p>
        </div>
        <span className={cn('grid place-items-center rounded-full', small ? 'h-9 w-9' : 'h-11 w-11')} style={{ background: theme.chip, color: theme.accent }} aria-hidden="true">
          <Icon className={small ? 'h-4 w-4' : 'h-5 w-5'} />
        </span>
      </div>

      <p className={cn('relative m-0 font-bold tabular-nums tracking-tight', small ? 'mt-4 text-3xl' : 'mt-7 text-5xl')} style={{ fontFamily: 'Georgia, serif' }}>
        {amountCents != null ? f.euro(amountCents) : '–'}
      </p>

      {!small && (
        <div className="relative mt-6 grid gap-1 text-sm">
          <p className="m-0 break-words">
            <span style={{ color: theme.muted }}>{t.for} </span>
            <strong>{recipientName?.trim() || t.recipientFallback}</strong>
          </p>
          <p className="m-0 break-words">
            <span style={{ color: theme.muted }}>{t.from} </span>
            <strong>{senderName?.trim() || t.senderFallback}</strong>
          </p>
          <p className="mb-0 mt-3 line-clamp-4 whitespace-pre-line break-words text-[13px] italic leading-relaxed" style={{ color: theme.muted }}>
            {message?.trim() ? `„${message.trim()}“` : t.messageFallback}
          </p>
        </div>
      )}

      <div className={cn('relative flex flex-wrap items-end justify-between gap-2', small ? 'mt-3' : 'mt-6')}>
        <span className="rounded-md px-2 py-1 font-mono text-xs tracking-wider" style={{ background: theme.chip }}>
          {code || t.code}
        </span>
        <span className="text-[10px] font-semibold" style={{ color: theme.muted }}>
          {validUntil ?? t.redeem}
        </span>
      </div>
    </div>
  );
}
