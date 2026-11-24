'use client';

import { Check } from 'lucide-react';

import { useMessages } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import messages from '../_messages';
import { STEPS } from '../_lib/wizard';

/** 3-step progress bar: 1 Postleitzahl → 2 Reinigungsdetails → 3 Kasse */
export function WizardProgress({ step, onSelect, locked }: { step: number; onSelect: (index: number) => void; locked?: boolean }) {
  const t = useMessages(messages);
  return (
    <nav aria-label={t.progress.label} className="mb-6 sm:mb-8">
      <ol className="m-0 flex list-none items-center gap-2 p-0 sm:gap-3">
        {STEPS.map((key, index) => {
          const done = index < step;
          const isCurrent = index === step;
          const badge = (
            <span
              className={cn(
                'grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-bold transition-[color,background-color,border-color,box-shadow] duration-200 ease-out',
                done && 'border-pine bg-pine text-white',
                isCurrent && 'border-pine bg-white text-pine ring-4 ring-mint',
                !done && !isCurrent && 'border-border bg-white text-muted-grey'
              )}
              aria-hidden="true"
            >
              {done ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
            </span>
          );
          const label = (
            <span
              className={cn(
                'text-xs font-bold transition-colors duration-200 sm:text-sm',
                isCurrent ? 'text-pine-dark' : 'text-muted-grey',
                // On narrow phones only the current label is shown
                !isCurrent && 'sr-only sm:not-sr-only'
              )}
            >
              <span className="sr-only">{t.progress.step(index + 1)}</span>
              {t.steps[key]}
              {done && <span className="sr-only">{t.progress.done}</span>}
            </span>
          );
          return (
            <li key={key} className={cn('flex min-w-0 items-center gap-2 sm:gap-3', index < STEPS.length - 1 && 'flex-1')} aria-current={isCurrent ? 'step' : undefined}>
              {done && !locked ? (
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  className="flex min-w-0 items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
                >
                  {badge}
                  {label}
                </button>
              ) : (
                <span className="flex min-w-0 items-center gap-2 p-0.5">
                  {badge}
                  {label}
                </span>
              )}
              {index < STEPS.length - 1 && (
                <span className={cn('h-0.5 min-w-[12px] flex-1 rounded-full transition-colors duration-200', done ? 'bg-pine' : 'bg-border')} aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
