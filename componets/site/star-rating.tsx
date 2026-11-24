'use client';

import { Star } from 'lucide-react';

import { useMessages } from '@/lib/i18n/client';
import profileMessages from '@/lib/i18n/messages/profile';
import { cn } from '@/lib/utils';

/** Read-only stars (supports halves visually by rounding to the nearest half) */
export function StarDisplay({ value, className, size = 16 }: { value: number; className?: string; size?: number }) {
  const t = useMessages(profileMessages);
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} role="img" aria-label={t.stars(value)}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = rounded >= i ? 1 : rounded >= i - 0.5 ? 0.5 : 0;
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }} aria-hidden="true">
            <Star className="absolute inset-0 text-sage" style={{ width: size, height: size }} />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: fill === 1 ? size : size / 2 }}>
                <Star className="fill-amber-400 text-amber-400" style={{ width: size, height: size }} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Interactive 1–5 star input (radio group, keyboard accessible) */
export function StarInput({
  value,
  onChange,
  label,
  size = 32,
  name,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  size?: number;
  name: string;
}) {
  const t = useMessages(profileMessages);
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-charcoal">{label}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <label key={i} className="cursor-pointer rounded-md p-0.5 focus-within:ring-2 focus-within:ring-ring">
            <input
              type="radio"
              name={name}
              value={i}
              checked={value === i}
              onChange={() => onChange(i)}
              className="sr-only"
            />
            <Star
              aria-hidden="true"
              className={cn('transition-colors', i <= value ? 'fill-amber-400 text-amber-400' : 'text-sage hover:text-amber-300')}
              style={{ width: size, height: size }}
            />
            <span className="sr-only">{t.stars(i)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** "★ 4.8 (12)" compact badge, or "New" when there are no ratings */
export function RatingBadge({ avg, count, className }: { avg?: number | null; count?: number; className?: string }) {
  const t = useMessages(profileMessages);
  if (!avg || !count) {
    return <span className={cn('rounded-full bg-mint px-2 py-0.5 text-xs font-medium text-pine-dark', className)}>{t.newCleaner}</span>;
  }
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm font-semibold text-charcoal', className)}>
      <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
      {avg.toFixed(1)}
      <span className="font-normal text-muted-grey">({t.ratingsCount(count)})</span>
    </span>
  );
}
