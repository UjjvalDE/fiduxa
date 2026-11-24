'use client';

// Commission-tier badge, shared by the performance page and the earnings page.
import { Award } from 'lucide-react';

import { useMessages } from '@/lib/i18n/client';
import type { CommissionTierKey } from '@/lib/types';
import { cn } from '@/lib/utils';

import messages from '../_messages';

/** Subtle badge colors per commission tier */
export const TIER_BADGE_CLASSES: Record<CommissionTierKey, string> = {
  new: 'border-gray-200 bg-gray-100 text-muted-grey',
  bronze: 'border-amber-300 bg-amber-50 text-amber-700',
  silver: 'border-slate-300 bg-slate-100 text-slate-500',
  gold: 'border-yellow-400 bg-yellow-50 text-yellow-600',
  platinum: 'border-violet-300 bg-violet-50 text-violet-700',
  diamond: 'border-cyan-300 bg-cyan-50 text-cyan-700',
};

export function TierBadge({ tier, big, className }: { tier: CommissionTierKey; big?: boolean; className?: string }) {
  const t = useMessages(messages);
  return (
    <span
      data-testid="tier-badge"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold',
        big ? 'px-4 py-1.5 text-base' : 'px-2.5 py-0.5 text-xs',
        TIER_BADGE_CLASSES[tier],
        className
      )}
    >
      <Award className={big ? 'h-5 w-5' : 'h-3.5 w-3.5'} aria-hidden="true" />
      {t.tierNames[tier]}
    </span>
  );
}
