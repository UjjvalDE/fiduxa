'use client';

// The quotation flow was removed (customers now book a published slot and pay
// right away). Only a read-only history for legacy records remains.

import { useFormat, useMessages } from '@/lib/i18n/client';
import type { Booking, Quotation } from '@/lib/types';

import bookingMessages from '../buchungen/_messages';
import { SectionCard } from './states';

/** Read-only list of quotations sent in the earlier quotation flow (legacy records only) */
export function QuotationHistory({ booking }: { booking: Booking }) {
  const t = useMessages(bookingMessages);
  const f = useFormat();
  const history = booking.quotationHistory ?? [];
  if (!booking.quotation && history.length === 0) return null;

  const rows: { version: number; q: Quotation; current: boolean }[] = [
    ...history.map((q) => ({ version: q.version, q, current: false })),
    ...(booking.quotation ? [{ version: history.length + 1, q: booking.quotation, current: true }] : []),
  ].reverse();

  return (
    <SectionCard id="angebotsverlauf" title={t.detail.quotesTitle} description={t.detail.quotesDescription}>
      <ol className="space-y-3">
        {rows.map(({ version, q, current }) => (
          <li
            key={version}
            className={current ? 'rounded-xl border border-sage bg-mint/50 p-3' : 'rounded-xl border border-border p-3'}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-pine-dark">
                {t.detail.quoteVersion(version)}
                {current && <span className="ml-2 text-xs font-medium text-pine">{t.detail.quoteCurrent}</span>}
              </p>
              <p className="text-base font-bold text-pine-dark">{f.euro(q.amountCents)}</p>
            </div>
            <p className="mt-1 text-xs text-muted-grey">
              {t.detail.quoteSent(f.dateTime(q.sentAt))}
              {q.sentBy && typeof q.sentBy === 'object' ? t.detail.quoteBy(q.sentBy.name) : ''}
              {t.detail.quoteValid(f.dateTime(q.validUntil))}
              {q.respondedAt ? t.detail.quoteAnswered(f.dateTime(q.respondedAt)) : ''}
            </p>
            {q.message && <p className="mt-2 whitespace-pre-line text-sm text-charcoal">{q.message}</p>}
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
