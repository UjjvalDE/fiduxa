'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { toast } from 'sonner';

import { Switch } from '@/componets/ui/switch';
import { api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminPromotion } from '@/lib/types';
import { cn } from '@/lib/utils';

import { PROMO_STATE_CLASSES } from '../../_components/promo-utils';
import { useErrorText } from '../../_components/use-api';
import promotionMessages from '../_messages';

export function RulesInfo() {
  const t = useMessages(promotionMessages);
  return (
    <div className="mb-6 flex gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900" role="note">
      <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{t.rules.title}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>{t.rules.one}</li>
          <li>{t.rules.giftCards}</li>
          <li>{t.rules.welcome}</li>
        </ul>
      </div>
    </div>
  );
}

export function PromotionStateBadge({ state }: { state: AdminPromotion['state'] }) {
  const t = useMessages(promotionMessages);
  return (
    <span className={cn('inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', PROMO_STATE_CLASSES[state])}>
      {t.states[state]}
    </span>
  );
}

/** "01.12.2026 – 24.12.2026" / "ab …" / "bis …" / "Unbegrenzt" */
export function usePeriodLabel() {
  const t = useMessages(promotionMessages);
  const f = useFormat();
  return (p: Pick<AdminPromotion, 'startsAt' | 'endsAt'>) => {
    if (p.startsAt && p.endsAt) return `${f.dateTime(p.startsAt)} – ${f.dateTime(p.endsAt)}`;
    if (p.startsAt) return t.from(f.dateTime(p.startsAt));
    if (p.endsAt) return t.until(f.dateTime(p.endsAt));
    return t.always;
  };
}

export function ActiveToggle({ promo, onChanged }: { promo: AdminPromotion; onChanged: (p: AdminPromotion) => void }) {
  const t = useMessages(promotionMessages);
  const errorText = useErrorText();
  const [pending, setPending] = useState(false);
  const toggle = async (active: boolean) => {
    setPending(true);
    try {
      const res = await api.patch<{ promotion: AdminPromotion }>(`/admin/promotions/${promo._id}/active`, { active });
      onChanged({ ...promo, ...res.promotion, stats: promo.stats });
      toast.success(active ? t.activated(promo.name) : t.deactivated(promo.name));
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setPending(false);
    }
  };
  return <Switch checked={promo.active} onCheckedChange={toggle} disabled={pending} aria-label={t.activeLabel(promo.name)} />;
}
