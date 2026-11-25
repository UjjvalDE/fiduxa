'use client';

// No cleaner available for a booking (automatic assignment): the customer picks
// one of the free alternative times, keeps waiting, or cancels free of charge
// with a full refund (problem on our side).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

import { ApiError, api } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import type { BookingAlternative, BookingAlternativesResponse } from '@/lib/types';
import { ErrorBox } from '../../buchung/_components/form-field';
import messages from '../_alternatives-messages';

type Done = 'assigned' | 'searching' | 'wait' | 'cancel' | null;

export function ChooseAlternative({ id }: { id: string }) {
  const t = useMessages(messages);
  const f = useFormat();
  const { locale } = useLocale();
  const [data, setData] = useState<BookingAlternativesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done>(null);
  const path = `/customer/bookings/${encodeURIComponent(id)}/alternatives`;

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<BookingAlternativesResponse>(path));
    } catch (e) {
      setError(translateApiError(e, locale));
    }
  }, [path, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (body: { action: 'pick' | 'wait' | 'cancel'; slotId?: string; startTime?: string }) => {
    if (body.action === 'cancel' && !window.confirm(t.cancelConfirm)) return;
    setBusy(true);
    try {
      const res = await api.post<{ assignment?: { state: string } }>(path, body);
      if (body.action === 'pick') setDone(res.assignment?.state === 'assigned' ? 'assigned' : 'searching');
      else setDone(body.action);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SLOT_TAKEN') {
        toast.error(t.slotTaken);
        await load();
      } else if (e instanceof ApiError && e.code === 'NO_ALTERNATIVE_NEEDED') {
        await load();
      } else {
        toast.error(translateApiError(e, locale));
      }
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <Link href={`/konto/buchungen/${encodeURIComponent(id)}`} className="text-link">
      {t.back}
    </Link>
  );

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <p className="text-sm text-muted-grey">{t.loading}</p>;

  if (done) {
    const text = { assigned: t.doneAssigned, searching: t.doneSearching, wait: t.doneWait, cancel: t.doneCancel }[done];
    return (
      <section role="status" className="grid gap-4 rounded-2xl border border-mint bg-white p-6">
        <p className="m-0 text-lg font-bold text-pine-dark">{text}</p>
        {back}
      </section>
    );
  }

  if (!data.needsChoice) {
    return (
      <section className="grid gap-4 rounded-2xl border bg-white p-6">
        <p className="m-0">{t.notNeeded}</p>
        {back}
      </section>
    );
  }

  const label = (a: BookingAlternative) => `${f.dateLong(a.date)}, ${a.startTime}–${a.endTime}`;

  return (
    <div className="grid gap-6">
      {back}
      <section role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-900">
        <h1 className="m-0 text-xl font-bold">{t.title}</h1>
        <p className="mb-0 mt-2 text-sm leading-relaxed">{t.intro}</p>
        <p className="mb-0 mt-3 text-sm">
          {t.booked(data.booking.reference)} · {t.original}: <strong>{f.dateLong(data.booking.preferredDate)}, {data.booking.slot}{data.booking.slotEnd ? `–${data.booking.slotEnd}` : ''}</strong>
        </p>
        {data.customerChoice === 'wait' && <p className="mb-0 mt-2 text-sm">{t.chosenWait}</p>}
      </section>

      <section className="grid gap-3 rounded-2xl border bg-white p-6">
        <h2 className="m-0 text-lg font-bold text-pine-dark">{t.optionsTitle}</h2>
        {data.alternatives.length === 0 ? (
          <p className="m-0 text-sm text-muted-grey">{t.noOptions}</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {data.alternatives.map((a) => (
              <li key={`${a.slotId}-${a.date}-${a.startTime}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                <span className="font-semibold">{label(a)}</span>
                <button type="button" className="button button-small" disabled={busy} onClick={() => send({ action: 'pick', slotId: a.slotId, startTime: a.startTime })}>
                  {t.pick}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="grid content-start gap-2 rounded-2xl border bg-white p-6">
          <h2 className="m-0 text-base font-bold text-pine-dark">{t.waitTitle}</h2>
          <p className="m-0 text-sm text-muted-grey">{t.waitText}</p>
          <button type="button" className="button button-small button-quiet w-fit" disabled={busy} onClick={() => send({ action: 'wait' })}>
            {t.wait}
          </button>
        </section>
        <section className="grid content-start gap-2 rounded-2xl border bg-white p-6">
          <h2 className="m-0 text-base font-bold text-pine-dark">{t.cancelTitle}</h2>
          <p className="m-0 text-sm text-muted-grey">{t.cancelText}</p>
          <button type="button" className="button button-small button-quiet w-fit" disabled={busy} onClick={() => send({ action: 'cancel' })}>
            {t.cancel}
          </button>
        </section>
      </div>
    </div>
  );
}
