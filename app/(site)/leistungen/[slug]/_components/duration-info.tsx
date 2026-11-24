'use client';

import { useFormat, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { Condition } from '@/lib/types';
import { usePricing } from '../../../_shared/use-pricing';
import messages from '../../_messages';

// Fallbacks mirror server/src/config/pricing.js until GET /pricing has loaded.
const FALLBACK = { areaM2PerHour: 30, minimumMinutes: 120, maximumMinutes: 720, durationStepMinutes: 30 };

/** Recommended duration explanation + example table, using the live pricing parameters. */
export function DurationInfo({ variant }: { variant: 'end-of-tenancy' | 'deep' | 'standard' }) {
  const { pricing } = usePricing();
  const t = useMessages(messages).duration;
  const c = useMessages(common);
  const f = useFormat();

  const perHour = pricing?.areaM2PerHour ?? FALLBACK.areaM2PerHour;
  const minimum = pricing?.minimumMinutes ?? FALLBACK.minimumMinutes;
  const maximum = pricing?.maximumMinutes ?? FALLBACK.maximumMinutes;
  const step = pricing?.durationStepMinutes ?? FALLBACK.durationStepMinutes;

  const isDeep = variant === 'deep';
  const condition: Condition = isDeep ? 'moderate' : 'normal';
  const factor = pricing?.conditionFactor[condition] ?? (isDeep ? 1.25 : 1);
  const recommended = (areaM2: number) =>
    Math.min(maximum, Math.max(minimum, Math.ceil(((areaM2 / perHour) * 60 * factor) / step) * step));

  if (variant === 'end-of-tenancy') {
    return (
      <>
        <p className="section-lead">{t.endOfTenancy1}</p>
        <p className="text-sm leading-relaxed text-muted-grey">{t.endOfTenancy2(f.number(perHour), f.hours(minimum))}</p>
      </>
    );
  }

  return (
    <>
      <p className="section-lead">
        {t.normal(f.number(perHour), f.hours(minimum), step)}
        {isDeep && t.deepNote(c.conditions.moderate.label)}
      </p>
      <table className="w-full max-w-md border-collapse text-sm">
        <caption className="mb-3 text-left text-xs font-bold uppercase tracking-wider text-muted-grey">
          {t.caption(c.conditions[condition].label, isDeep ? f.number(factor, { maximumFractionDigits: 2 }) : null)}
        </caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-grey">
            <th scope="col" className="py-2 font-semibold">
              {t.area}
            </th>
            <th scope="col" className="py-2 font-semibold">
              {t.estimated}
            </th>
          </tr>
        </thead>
        <tbody>
          {[40, 60, 90].map((area) => (
            <tr key={area} className="border-b border-border">
              <td className="py-2.5">{area} m²</td>
              <td className="py-2.5 font-bold text-pine-dark">{f.hours(recommended(area))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
