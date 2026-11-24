'use client';

// Live countdown until a payment_pending reservation (holdExpiresAt) runs out.
// Used on /zahlung/[id] and in the customer account.
import { useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';

import { useFormat, useMessages } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import messages from '../_messages';

/** Remaining milliseconds until `expiresAt` (ticks every second); null without a deadline */
export function useCountdown(expiresAt: string | null | undefined) {
  const target = expiresAt ? new Date(expiresAt).getTime() : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (target == null || Number.isNaN(target)) return;
    setNow(Date.now());
    const id = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= target) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  if (target == null || Number.isNaN(target)) return null;
  const remainingMs = Math.max(0, target - now);
  return { remainingMs, expired: remainingMs <= 0 };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "34:59" (or "1:02:03" for long holds) */
export const formatRemaining = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

/**
 * Visual mm:ss countdown. Screen readers get a polite update once per minute
 * (not every second) plus the absolute end time.
 */
export function HoldCountdown({
  expiresAt,
  onExpire,
  tone = 'default',
  compact = false,
}: {
  expiresAt: string;
  onExpire?: () => void;
  tone?: 'default' | 'light';
  compact?: boolean;
}) {
  const t = useMessages(messages).countdown;
  const f = useFormat();
  const countdown = useCountdown(expiresAt);
  const fired = useRef(false);

  const expired = countdown?.expired ?? false;
  useEffect(() => {
    if (expired && !fired.current) {
      fired.current = true;
      onExpire?.();
    }
  }, [expired, onExpire]);

  if (!countdown) return null;
  const minutesLeft = Math.ceil(countdown.remainingMs / 60000);
  const endTime = new Date(expiresAt).toLocaleTimeString(f.tag, { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  const urgent = !expired && countdown.remainingMs < 5 * 60 * 1000;

  return (
    <div className={cn('flex items-center gap-3', compact && 'gap-2')}>
      <Timer className={cn('shrink-0', compact ? 'h-4 w-4' : 'h-6 w-6', tone === 'light' ? 'text-lime' : urgent ? 'text-red-700' : 'text-pine')} aria-hidden="true" />
      <div className="min-w-0">
        {!compact && (
          <p className={cn('m-0 text-xs font-bold uppercase tracking-wider', tone === 'light' ? 'text-white/70' : 'text-muted-grey')}>{t.label}</p>
        )}
        <p
          className={cn(
            'm-0 font-bold tabular-nums',
            compact ? 'text-sm' : 'text-2xl',
            tone === 'light' ? 'text-white' : urgent ? 'text-red-700' : 'text-pine-dark'
          )}
          aria-hidden="true"
        >
          {compact && <span className="mr-1 font-semibold">{t.label}</span>}
          {expired ? '00:00' : formatRemaining(countdown.remainingMs)}
        </p>
        {!compact && (
          <p className={cn('m-0 mt-0.5 text-xs', tone === 'light' ? 'text-white/75' : 'text-muted-grey')}>{t.reservedUntil(endTime)}</p>
        )}
        {/* Announced once per minute (compact lists stay silent to avoid chatter) */}
        <span className="sr-only" role={compact ? undefined : 'timer'} aria-live={compact ? 'off' : 'polite'} aria-atomic="true">
          {expired ? t.expired : `${t.minutesLeft(minutesLeft)} ${t.reservedUntil(endTime)}`}
        </span>
      </div>
    </div>
  );
}
