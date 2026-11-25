'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { ApiError, api, qs } from '@/lib/api';
import { useMessages } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import dispatchMessages from '../_dispatch-messages';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, SectionCard } from '../_components/states';
import { berlinToday, useApi, useErrorText } from '../_components/use-api';
import type { DispatchBookingRow, DispatchDetail, DispatchOverview } from './_types';

const DAY_MS = 86_400_000;
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' });
};
const stamp = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '–');

function BookingLine({ b, onOpen, label }: { b: DispatchBookingRow; onOpen: (id: string) => void; label: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-0">
      <div className="min-w-0 text-sm">
        <span className="font-semibold text-pine-dark">{b.reference}</span> · {shortDate(b.date)} {b.slot}–{b.slotEnd} · {b.postcode} · {b.serviceId}
        {b.worker?.name && <span className="text-muted-grey"> · {b.worker.name}</span>}
        {b.assignment.score != null && <span className="text-muted-grey"> · {b.assignment.score}</span>}
      </div>
      <Button size="sm" variant="outline" onClick={() => onOpen(b.id)}>
        {label}
      </Button>
    </li>
  );
}

function DetailPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const t = useMessages(dispatchMessages);
  const errorText = useErrorText();
  const { data, error, loading, reload } = useApi<DispatchDetail>(`/admin/dispatch/bookings/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState('');

  const done = () => {
    reload();
    onChanged();
  };
  const assign = async (workerId: string, override = false): Promise<void> => {
    setBusy(workerId);
    try {
      await api.post(`/admin/dispatch/bookings/${id}/assign`, { workerId, override });
      toast.success(t.assigned);
      done();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ASSIGN_OVERRIDE_REQUIRED' && !override) {
        setBusy(null);
        if (window.confirm(t.overrideConfirm(err.message))) return assign(workerId, true);
        return;
      }
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };
  const rerun = async () => {
    setBusy('auto');
    try {
      const r = await api.post<{ state: string }>(`/admin/dispatch/bookings/${id}/auto`);
      toast.success(t.rerunDone(r.state));
      done();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    setBusy('remove');
    try {
      await api.post(`/admin/dispatch/bookings/${id}/unassign`, { reason: removeReason });
      toast.success(t.removed);
      setRemoveReason('');
      done();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SectionCard
      title={`${t.detail} ${data?.booking.reference ?? ''}`}
      actions={
        <Button size="sm" variant="ghost" onClick={onClose} aria-label={t.close}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      }
    >
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <ListSkeleton rows={4} />}
      {data && (
        <div className="space-y-6 text-sm">
          <p>
            {shortDate(data.booking.date)} {data.booking.slot}–{data.booking.slotEnd} · {data.booking.address}, {data.booking.postcode} · {data.booking.serviceId}
            {data.booking.extras.length > 0 && ` + ${data.booking.extras.join(', ')}`}
            {' · '}
            {data.booking.worker?.name ?? t.none} {data.booking.assignment.reasonLabel && `· ${t.reason}: ${data.booking.assignment.reasonLabel}`}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Button size="sm" onClick={rerun} disabled={Boolean(busy)}>
              {busy === 'auto' && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t.rerun}
            </Button>
            {data.booking.worker && (
              <>
                <Input className="max-w-xs" value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} placeholder={t.removeReason} aria-label={t.removeReason} />
                <Button size="sm" variant="outline" onClick={remove} disabled={Boolean(busy) || removeReason.trim().length < 3}>
                  {t.remove}
                </Button>
              </>
            )}
          </div>

          <div>
            <h3 className="mb-2 font-semibold text-pine-dark">{t.candidates}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-muted-grey">
                    <th className="py-1 pr-2">{t.cleaner}</th>
                    <th className="py-1 pr-2">{t.score}</th>
                    {Object.keys(t.parts).map((k) => (
                      <th key={k} className="py-1 pr-2">{t.parts[k]}</th>
                    ))}
                    <th className="py-1 pr-2">{t.km}</th>
                    <th className="py-1" />
                  </tr>
                </thead>
                <tbody>
                  {data.candidates.map((c) => {
                    const current = data.booking.worker?.id === c.id;
                    return (
                      <tr key={c.id} className={cn('border-t border-border', !c.suitable && !current && 'text-muted-grey')}>
                        <td className="py-1 pr-2">
                          {c.name}
                          {current && ` (${t.current})`}
                          {c.problemLabel && !current && <span className="block">{c.problemLabel}</span>}
                        </td>
                        <td className="py-1 pr-2 font-semibold">{c.score}</td>
                        {Object.keys(t.parts).map((k) => (
                          <td key={k} className="py-1 pr-2">{Math.round((c.parts[k] ?? 0) * 100)}</td>
                        ))}
                        <td className="py-1 pr-2">{c.km ?? '–'}</td>
                        <td className="py-1">
                          {!current && (
                            <Button size="sm" variant={c.suitable ? 'default' : 'outline'} onClick={() => assign(c.id)} disabled={Boolean(busy)}>
                              {busy === c.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />}
                              {t.assign}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="mb-2 font-semibold text-pine-dark">{t.history}</h3>
            <ul className="space-y-1">
              {data.history.map((h, i) => (
                <li key={i}>
                  {stamp(h.at)} · <strong>{h.action}</strong>
                  {h.worker?.name && ` · ${h.worker.name}`}
                  {h.previousWorker?.name && ` (← ${h.previousWorker.name})`} · {h.by?.name ?? t.system} ({h.byRole})
                  {h.reason && ` · ${h.reason}`}
                  {h.score != null && ` · ${h.score}`}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-pine-dark">{t.emails}</h3>
            <ul className="space-y-1">
              {data.emails.map((e) => (
                <li key={e.id}>
                  {stamp(e.createdAt)} · {e.to} · {e.subject} · <span className="text-muted-grey">{e.template} / {e.status}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-pine-dark">{t.audit}</h3>
            <ul className="space-y-1">
              {data.audit.map((a, i) => (
                <li key={i}>
                  {stamp(a.at)} · {a.action} · {a.actor?.name ?? t.system}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export default function AdminDispatchPage() {
  const t = useMessages(dispatchMessages);
  const [from, setFrom] = useState(berlinToday());
  const [days, setDays] = useState(7);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<DispatchOverview>(`/admin/dispatch${qs({ from, days })}`);

  // Deep link: /admin/disposition?booking=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('booking');
    if (id) setSelected(id);
  }, []);

  return (
    <div>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <>
            <Button size="sm" variant={days === 1 ? 'default' : 'outline'} onClick={() => setDays(1)}>{t.day}</Button>
            <Button size="sm" variant={days === 7 ? 'default' : 'outline'} onClick={() => setDays(7)}>{t.week}</Button>
            <Button size="sm" variant="outline" onClick={() => setFrom(shift(from, -days))} aria-label={t.prev}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setFrom(berlinToday())}>{t.today}</Button>
            <Button size="sm" variant="outline" onClick={() => setFrom(shift(from, days))} aria-label={t.next}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button size="sm" variant="outline" onClick={reload} aria-label={t.reload}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
            </Button>
          </>
        }
      />
      {error && <ErrorState message={error} onRetry={reload} />}
      {!data && loading && <ListSkeleton rows={6} />}
      {data && (
        <div className="space-y-6">
          <p className={cn('rounded-md border p-3 text-sm', data.mode === 'auto' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900')}>
            {data.mode === 'auto' ? t.modeAuto : t.modeBoard}
          </p>

          {selected && <DetailPanel key={selected} id={selected} onClose={() => setSelected(null)} onChanged={reload} />}

          <SectionCard title={`${t.unassigned} (${data.unassigned.length})`}>
            {data.unassigned.length === 0 ? (
              <EmptyState title={t.unassignedEmpty} />
            ) : (
              <ul>
                {data.unassigned.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-0 text-sm">
                    <div>
                      <span className="font-semibold text-pine-dark">{b.reference}</span> · {shortDate(b.date)} {b.slot}–{b.slotEnd} · {b.postcode} · {b.serviceId}
                      <span className="block text-xs text-muted-grey">
                        {t.reason}: {b.assignment.reasonLabel ?? t.none} · {t.attempts(b.assignment.attempts)}
                        {b.assignment.escalatedAt && ` · ${t.escalated}`}
                        {b.assignment.customerChoice && ` · ${t.choice[b.assignment.customerChoice] ?? b.assignment.customerChoice}`}
                      </span>
                    </div>
                    <Button size="sm" onClick={() => setSelected(b.id)}>{t.open}</Button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={t.availability}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-muted-grey">
                    <th className="py-1 pr-3">{t.cleaner}</th>
                    {data.dates.map((d) => (
                      <th key={d} className="py-1 pr-3">{shortDate(d)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.availability.map((c) => (
                    <tr key={c.id} className="border-t border-border align-top">
                      <td className="py-1 pr-3">
                        <span className="font-medium text-pine-dark">{c.name}</span>
                        <span className="block text-muted-grey">
                          {c.postcode ?? '–'} · {c.maxTravelKm} km{!c.hasPattern && ` · ${t.noPattern}`}{c.paused && ` · ${t.paused}`}
                        </span>
                      </td>
                      {c.days.map((d) => (
                        <td key={d.date} className={cn('py-1 pr-3', (d.off || d.windows.length === 0) && 'bg-muted/40 text-muted-grey')}>
                          {d.off ? t.off[d.off] ?? d.off : d.windows.join(', ') || '–'}
                          {d.jobs.map((j) => (
                            <button key={j.id} type="button" onClick={() => setSelected(j.id)} className="mt-0.5 block rounded bg-pine/10 px-1 text-left text-pine-dark hover:bg-pine/20">
                              {j.start}–{j.end} {j.reference}
                            </button>
                          ))}
                          {!d.off && d.windows.length > 0 && <span className="block">{t.free((d.freeMinutes / 60).toFixed(1))}</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title={`${t.conflicts} (${data.conflicts.length})`}>
            {data.conflicts.length === 0 ? (
              <EmptyState title={t.conflictsEmpty} />
            ) : (
              <ul className="space-y-1 text-sm">
                {data.conflicts.map((c, i) => (
                  <li key={i}>
                    <strong>{c.kind === 'overlap' ? t.overlap : `${t.unsuitable}: ${c.problemLabel ?? ''}`}</strong> · {c.worker.name} · {c.bookings.join(', ')}
                    {c.bookingId && (
                      <Button size="sm" variant="link" onClick={() => setSelected(c.bookingId as string)}>{t.open}</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={`${t.emergencies} (${data.emergencies.length})`}>
            {data.emergencies.length === 0 ? (
              <EmptyState title={t.emergenciesEmpty} />
            ) : (
              <ul className="space-y-1 text-sm">
                {data.emergencies.map((e, i) => (
                  <li key={i}>
                    {stamp(e.at)} · <strong>{e.reference}</strong> ({shortDate(e.date)} {e.slot}) · {e.kind} · {e.worker?.name ?? '–'} · {e.reason} → {e.replacement ? `${t.replacement}: ${e.replacement.name}` : t.noReplacement}
                    <Button size="sm" variant="link" onClick={() => setSelected(e.bookingId)}>{t.open}</Button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={t.dayOffs}>
            {data.dayOffs.length === 0 ? (
              <EmptyState title={t.dayOffsEmpty} />
            ) : (
              <ul className="space-y-1 text-sm">
                {data.dayOffs.map((d, i) => (
                  <li key={i}>
                    {d.worker.name} · {t.off[d.kind] ?? d.kind} {d.date}
                    {d.note && ` · ${d.note}`}
                  </li>
                ))}
              </ul>
            )}
            {data.cleanersWithoutPattern.length > 0 && (
              <p className="mt-3 text-sm text-amber-900">
                {t.withoutPattern}: {data.cleanersWithoutPattern.map((c) => c.name).join(', ')}
              </p>
            )}
          </SectionCard>

          <SectionCard title={`${t.upcoming} (${data.upcoming.length})`}>
            {data.upcoming.length === 0 ? (
              <EmptyState title={t.upcomingEmpty} />
            ) : (
              <ul>
                {data.upcoming.map((b) => (
                  <BookingLine key={b.id} b={b} onOpen={setSelected} label={t.open} />
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
