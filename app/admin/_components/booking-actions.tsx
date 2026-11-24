'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, Save, UserMinus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Label } from '@/componets/ui/lable';
import { Textarea } from '@/componets/ui/tesxtarea';
import { api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminWorker, Booking, BookingStatus, Pagination } from '@/lib/types';

import bookingMessages, { type BookingMessages } from '../buchungen/_messages';
import { ConfirmAction } from './confirm-action';
import { ALLOWED_TRANSITIONS, ASSIGNABLE_STATUSES } from './labels';
import { NativeSelect, SectionCard } from './states';
import { useApi, useErrorText } from './use-api';

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

type TransitionCopy = BookingMessages['status']['cancelled'];

function transitionCopy(t: BookingMessages, from: BookingStatus, to: BookingStatus): TransitionCopy | null {
  if (to === 'confirmed') return from === 'payment_pending' ? t.status.confirmManual : t.status.confirmLegacy;
  if (to === 'in_progress') return t.status.in_progress;
  if (to === 'completed') return t.status.completed;
  if (to === 'cancelled') return t.status.cancelled;
  return null;
}

/** Transitions that email the customer */
const EMAILS: BookingStatus[] = ['confirmed', 'completed', 'cancelled'];

export function StatusActions({ booking, onChanged }: { booking: Booking; onChanged: () => void }) {
  const t = useMessages(bookingMessages);
  const f = useFormat();
  const next = ALLOWED_TRANSITIONS[booking.status] ?? [];
  const isPaid = booking.payment?.status === 'paid';
  const [refund, setRefund] = useState(true);
  const refundId = useId();

  if (next.length === 0) {
    return (
      <SectionCard id="status-aktionen" title={t.status.title}>
        <p className="text-sm text-muted-grey">{t.status.noSteps}</p>
      </SectionCard>
    );
  }

  const change = async (status: BookingStatus, note: string) => {
    const body: { status: BookingStatus; note: string; refund?: boolean } = { status, note };
    if (status === 'cancelled' && isPaid) body.refund = refund;
    const res = await api.patch<{ emailStatus?: string; refunded?: boolean }>(
      `/admin/bookings/${booking._id}/status`,
      body
    );
    const hints: string[] = [];
    if (status === 'cancelled' && isPaid) hints.push(res.refunded ? t.status.refunded : t.status.refundNotDone);
    if (EMAILS.includes(status) && res.emailStatus && res.emailStatus !== 'sent') hints.push(t.status.emailNotSent);
    toast.success(t.status.updated, { description: hints.length ? hints.join(' ') : undefined });
    onChanged();
  };

  return (
    <SectionCard id="status-aktionen" title={t.status.title} description={t.status.description}>
      <div className="flex flex-wrap gap-2">
        {next.map((status) => {
          const copy = transitionCopy(t, booking.status, status);
          if (!copy) return null;
          const destructive = status === 'cancelled';
          return (
            <ConfirmAction
              key={status}
              trigger={copy.label}
              triggerVariant={destructive ? 'outline' : status === 'confirmed' || status === 'completed' ? 'default' : 'outline'}
              triggerClassName={destructive ? 'border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800' : undefined}
              title={copy.title}
              description={copy.description}
              confirmLabel={copy.label}
              destructive={destructive}
              withNote
              noteRequired={destructive ? undefined : status === 'in_progress' || status === 'completed'}
              noteLabel={destructive ? t.status.reasonNote : t.status.note}
              onOpenChange={(open) => {
                if (open) setRefund(true);
              }}
              onConfirm={(note) => change(status, note)}
            >
              {destructive && isPaid && (
                <div className="rounded-lg border border-border bg-cream/60 p-3">
                  <div className="flex items-start gap-2">
                    <input
                      id={refundId}
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-input accent-[#174D3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      checked={refund}
                      onChange={(e) => setRefund(e.target.checked)}
                      aria-describedby={`${refundId}-hint`}
                    />
                    <div>
                      <Label htmlFor={refundId} className="cursor-pointer">
                        {t.status.refundCheckbox}
                      </Label>
                      <p id={`${refundId}-hint`} className="mt-1 text-xs text-muted-grey">
                        {refund
                          ? t.status.refundHint(f.euro(booking.payment?.amountCents ?? booking.estimate?.totalCents))
                          : t.status.refundOff}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </ConfirmAction>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Assign cleaner
// ---------------------------------------------------------------------------

const personNames = (list?: (string | { _id: string; name: string })[]) =>
  (list ?? []).map((p) => (typeof p === 'string' ? null : p.name)).filter((n): n is string => Boolean(n));

/** Open-job marketplace status of a confirmed booking without cleaner */
function OpenOfferInfo({ booking }: { booking: Booking }) {
  const t = useMessages(bookingMessages);
  const f = useFormat();
  const offer = booking.jobOffer;
  const declined = personNames(offer?.declinedBy);
  const released = personNames(offer?.releasedBy);
  return (
    <div className="mb-4 space-y-1.5 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
      <p className="font-medium">
        {offer?.notifiedAt ? t.assign.openSince(f.dateTime(offer.notifiedAt)) : t.assign.openNotNotified}
      </p>
      {declined.length > 0 && (
        <p>
          <span className="font-medium">{t.assign.declinedBy}</span> {declined.join(', ')}
        </p>
      )}
      {released.length > 0 && (
        <p>
          <span className="font-medium">{t.assign.releasedBy}</span> {released.join(', ')}
        </p>
      )}
    </div>
  );
}

export function AssignWorker({ booking, onChanged }: { booking: Booking; onChanged: () => void }) {
  const t = useMessages(bookingMessages);
  const f = useFormat();
  const errorText = useErrorText();
  const canAssign = ASSIGNABLE_STATUSES.includes(booking.status);
  const workers = useApi<{ workers: AdminWorker[]; pagination: Pagination }>(
    canAssign ? '/admin/workers?status=approved&limit=50' : null
  );
  const current = booking.assignedWorker ?? null;
  const [selected, setSelected] = useState(current?._id ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();

  useEffect(() => {
    setSelected(booking.assignedWorker?._id ?? '');
  }, [booking.assignedWorker?._id]);

  const assign = async () => {
    if (!selected) return;
    setPending(true);
    setError(null);
    try {
      await api.patch(`/admin/bookings/${booking._id}/assign`, { workerId: selected });
      toast.success(t.assign.assigned);
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  const unassign = async () => {
    setError(null);
    await api.patch(`/admin/bookings/${booking._id}/assign`, { workerId: null });
    toast.success(t.assign.unassigned);
    onChanged();
  };

  return (
    <SectionCard id="zuweisung" title={t.assign.title}>
      {current ? (
        <div className="mb-4 rounded-xl border border-border bg-cream/60 p-3 text-sm">
          <p className="font-semibold text-charcoal">{current.name}</p>
          {current.email && <p className="text-muted-grey">{current.email}</p>}
          {current.phone && (
            <a href={`tel:${current.phone}`} className="text-pine hover:underline">
              {current.phone}
            </a>
          )}
          {booking.assignedAt && <p className="mt-1 text-xs text-muted-grey">{t.assign.assignedAt(f.dateTime(booking.assignedAt))}</p>}
          <Link
            href={`/admin/reinigungskraefte/${current._id}`}
            className="mt-1 inline-block text-xs font-semibold text-pine hover:underline"
          >
            {t.assign.openProfile}
          </Link>
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted-grey">{t.assign.none}</p>
      )}

      {!current && booking.status === 'confirmed' && <OpenOfferInfo booking={booking} />}

      {!canAssign ? (
        <p className="text-xs text-muted-grey">{t.assign.notPossible}</p>
      ) : workers.error && !workers.data ? (
        <div role="alert" className="space-y-2 text-sm text-red-700">
          <p>{workers.error}</p>
          <Button type="button" size="sm" variant="outline" onClick={workers.reload}>
            {t.assign.retry}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={selectId}>{current ? t.assign.chooseOther : t.assign.choose}</Label>
            <NativeSelect
              id={selectId}
              value={selected}
              disabled={!workers.data || pending}
              onChange={(e) => {
                setSelected(e.target.value);
                setError(null);
              }}
            >
              <option value="">{workers.data ? t.assign.pleaseChoose : t.assign.loading}</option>
              {workers.data?.workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.workerProfile?.serviceAreas?.length ? ` · ${w.workerProfile.serviceAreas.slice(0, 2).join(', ')}` : ''}
                </option>
              ))}
            </NativeSelect>
            {workers.data && workers.data.workers.length === 0 && (
              <p className="text-xs text-muted-grey">{t.assign.noWorkers}</p>
            )}
          </div>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={assign}
              disabled={pending || !selected || selected === current?._id}
              size="sm"
            >
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {t.assign.assign}
            </Button>
            {current && (
              <ConfirmAction
                trigger={
                  <>
                    <UserMinus className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t.assign.unassign}
                  </>
                }
                triggerSize="sm"
                disabled={pending}
                title={t.assign.unassignTitle}
                description={t.assign.unassignDescription(current.name)}
                confirmLabel={t.assign.unassignConfirm}
                destructive
                onConfirm={unassign}
              />
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Internal notes
// ---------------------------------------------------------------------------

export function AdminNotes({ booking }: { booking: Booking }) {
  const [value, setValue] = useState(booking.adminNotes ?? '');
  const t = useMessages(bookingMessages);
  const errorText = useErrorText();
  const [saved, setSaved] = useState(booking.adminNotes ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await api.patch<{ adminNotes: string }>(`/admin/bookings/${booking._id}/notes`, {
        adminNotes: value,
      });
      setSaved(res.adminNotes ?? value);
      setValue(res.adminNotes ?? value);
      toast.success(t.notes.saved);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <SectionCard id="notizen" title={t.notes.title} description={t.notes.description}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-2"
      >
        <Label htmlFor={id} className="sr-only">
          {t.notes.title}
        </Label>
        <Textarea id={id} rows={4} maxLength={2000} value={value} onChange={(e) => setValue(e.target.value)} disabled={pending} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-grey">{value.length}/2000</span>
          <Button type="submit" size="sm" variant="outline" disabled={pending || value === saved}>
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {t.notes.save}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </form>
    </SectionCard>
  );
}
