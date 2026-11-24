'use client';

import Link from 'next/link';
import { ClipboardList, CreditCard, Sparkles, Tag } from 'lucide-react';

import { useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import { usePricing } from '../../_shared/use-pricing';
import messages from '../_messages';

// Fallbacks mirror server/src/config/pricing.js until GET /pricing has loaded.
const FALLBACK_HOLD_MINUTES = 35;
const FALLBACK_CUTOFF_HOURS = 24;

export function HowItWorksSteps() {
  const t = useMessages(messages);
  const { pricing } = usePricing();
  const hold = pricing?.holdMinutes ?? FALLBACK_HOLD_MINUTES;

  const steps = [
    { icon: ClipboardList, ...t.steps.choose },
    { icon: Tag, ...t.steps.price },
    { icon: CreditCard, ...t.steps.pay, text: t.steps.pay.text(hold) },
    { icon: Sparkles, ...t.steps.clean },
  ];

  return (
    <ol className="m-0 grid list-none gap-5 p-0 md:grid-cols-2 lg:grid-cols-4">
      {steps.map(({ icon: Icon, title, text, detail }, index) => (
        <li key={title} className="flex flex-col rounded-2xl border border-border bg-cream p-6">
          <div className="flex items-center justify-between">
            <span className="service-icon !mb-0">
              <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="text-xs font-extrabold tracking-[0.14em] text-muted-grey">
              <span className="sr-only">{t.step}</span>0{index + 1}
            </span>
          </div>
          <h3 className="!mb-2 !mt-6 text-xl font-bold text-pine-dark">{title}</h3>
          <p className="text-sm leading-relaxed text-muted-grey">{text}</p>
          <p className="mb-0 mt-auto border-t border-border pt-4 text-xs font-semibold leading-relaxed text-pine">
            {index === 1 ? (
              <Link href="/preise#rechner" className="underline underline-offset-2">
                {detail}
              </Link>
            ) : (
              detail
            )}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function AfterBooking() {
  const t = useMessages(messages);
  const c = useMessages(common);
  const { pricing } = usePricing();
  const hold = pricing?.holdMinutes ?? FALLBACK_HOLD_MINUTES;

  const rows: [string, string][] = [
    [c.bookingStatus.payment_pending.label, t.status.payment_pending(hold)],
    [c.bookingStatus.confirmed.label, t.status.confirmed],
    [c.bookingStatus.completed.label, t.status.completed],
    [c.bookingStatus.cancelled.label, t.status.cancelled],
  ];

  return (
    <div className="grid gap-4">
      <dl className="m-0 grid gap-4">
        {rows.map(([term, desc]) => (
          <div key={term} className="rounded-xl border border-sage/60 bg-white p-5">
            <dt className="font-bold text-pine-dark">{term}</dt>
            <dd className="m-0 mt-1.5 text-sm leading-relaxed text-muted-grey">{desc}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 text-xs leading-relaxed text-muted-grey">{t.invoiceNote}</p>
    </div>
  );
}

export function CancelBox() {
  const t = useMessages(messages);
  const { pricing } = usePricing();
  return (
    <p className="mb-0 mt-3 text-sm leading-relaxed text-muted-grey">
      {t.cancelText(pricing?.cancellationCutoffHours ?? FALLBACK_CUTOFF_HOURS)}
    </p>
  );
}
