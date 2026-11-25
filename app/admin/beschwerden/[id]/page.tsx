'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Ban, CheckCircle2, ImageIcon, Loader2, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Textarea } from '@/componets/ui/tesxtarea';
import { api, getStoredToken } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { AdminComplaintDetail, ComplaintActionType } from '@/lib/types';

import { ConfirmAction } from '../../_components/confirm-action';
import { DetailSkeleton, ErrorState, InfoList, NativeSelect, PageHeader, SectionCard } from '../../_components/states';
import { centsToInput, parseEuroToCents } from '../../_components/labels';
import { useApi, useErrorText } from '../../_components/use-api';
import { ComplaintStatusBadge } from '../_components';
import messages from '../_messages';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api/v1').replace(/\/$/, '');
const ACTIONS: ComplaintActionType[] = ['refund', 'voucher', 'reclean', 'warning', 'suspend', 'block', 'other'];
const NEEDS_NOTE: ComplaintActionType[] = ['reclean', 'other'];
const WORKER_ACTIONS: ComplaintActionType[] = ['warning', 'suspend', 'block'];

type Detail = { complaint: AdminComplaintDetail };

function PhotoButton({ complaintId, photo }: { complaintId: string; photo: AdminComplaintDetail['photos'][number] }) {
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE}/admin/complaints/${complaintId}/photos/${photo._id}?inline=1`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button type="button" variant="outline" size="sm" onClick={open} disabled={busy}>
      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <ImageIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />}
      {photo.name}
    </Button>
  );
}

function ActionForm({ complaint, onSaved }: { complaint: AdminComplaintDetail; onSaved: (c: AdminComplaintDetail) => void }) {
  const t = useMessages(messages);
  const f = useFormat();
  const errorText = useErrorText();
  const ids = { type: useId(), amount: useId(), days: useId(), note: useId() };
  const available = ACTIONS.filter((a) => (WORKER_ACTIONS.includes(a) ? Boolean(complaint.worker) : a === 'refund' ? complaint.refundableCents > 0 : true));
  const [type, setType] = useState<ComplaintActionType>(available[0] ?? 'other');
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState('7');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError(null);
    if (type === 'refund') setAmount(centsToInput(complaint.refundableCents));
    else if (type === 'voucher') setAmount('20,00');
  }, [type, complaint.refundableCents]);

  const hint = t.typeHints[type];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: { type: ComplaintActionType; amountCents?: number; days?: number; note: string } = { type, note: note.trim() };
    if (type === 'refund' || type === 'voucher') {
      const cents = parseEuroToCents(amount);
      if (cents === null || cents < 1) return setError(t.errAmount);
      body.amountCents = cents;
    }
    if (type === 'suspend') {
      const n = Number(days);
      if (!Number.isInteger(n) || n < 1 || n > 365) return setError(t.errDays);
      body.days = n;
    }
    if (NEEDS_NOTE.includes(type) && !body.note) return setError(t.noteRequired);
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<Detail>(`/admin/complaints/${complaint._id}/actions`, body);
      toast.success(t.applied);
      setNote('');
      onSaved(res.complaint);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={ids.type}>{t.type}</Label>
          <NativeSelect id={ids.type} value={type} onChange={(e) => setType(e.target.value as ComplaintActionType)} disabled={busy}>
            {available.map((a) => (
              <option key={a} value={a}>
                {t.actionNames[a]}
              </option>
            ))}
          </NativeSelect>
        </div>
        {(type === 'refund' || type === 'voucher') && (
          <div className="space-y-1.5">
            <Label htmlFor={ids.amount}>{t.amountEuro}</Label>
            <Input id={ids.amount} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} />
          </div>
        )}
        {type === 'suspend' && (
          <div className="space-y-1.5">
            <Label htmlFor={ids.days}>{t.days}</Label>
            <Input id={ids.days} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} disabled={busy} />
          </div>
        )}
      </div>
      <p className="text-xs text-muted-grey">{typeof hint === 'function' ? hint(f.euro(complaint.refundableCents)) : hint}</p>
      <div className="space-y-1.5">
        <Label htmlFor={ids.note}>{t.note}</Label>
        <Textarea id={ids.note} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} disabled={busy} />
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {t.apply}
      </Button>
    </form>
  );
}

function NoteForm({ complaintId, onSaved }: { complaintId: string; onSaved: (c: AdminComplaintDetail) => void }) {
  const t = useMessages(messages);
  const errorText = useErrorText();
  const id = useId();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      const res = await api.post<Detail>(`/admin/complaints/${complaintId}/notes`, { body: body.trim() });
      setBody('');
      onSaved(res.complaint);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <Label htmlFor={id} className="sr-only">
        {t.notes}
      </Label>
      <Textarea id={id} value={body} maxLength={2000} placeholder={t.notePlaceholder} onChange={(e) => setBody(e.target.value)} disabled={busy} />
      <Button type="submit" variant="outline" size="sm" disabled={busy || !body.trim()}>
        {t.addNote}
      </Button>
    </form>
  );
}

export default function AdminComplaintDetailPage({ params }: { params: { id: string } }) {
  const t = useMessages(messages);
  const tc = useMessages(common);
  const f = useFormat();
  const errorText = useErrorText();
  const { data, error, errorStatus, reload, setData } = useApi<Detail>(`/admin/complaints/${params.id}`);
  const [starting, setStarting] = useState(false);

  if (error && !data) {
    return (
      <>
        <PageHeader title={t.complaint} backHref="/admin/beschwerden" backLabel={t.back} />
        <ErrorState message={error} onRetry={errorStatus === 404 || errorStatus === 400 ? undefined : reload} />
      </>
    );
  }
  if (!data) return <DetailSkeleton />;

  const c = data.complaint;
  const update = (complaint: AdminComplaintDetail) => setData({ complaint });
  const isOpen = c.status === 'open' || c.status === 'in_review';
  const by = (ref: { name: string } | null | undefined) => (ref?.name ? ` · ${t.by(ref.name)}` : '');

  const startReview = async () => {
    setStarting(true);
    try {
      const res = await api.post<Detail>(`/admin/complaints/${c._id}/review`);
      toast.success(t.reviewStarted);
      update(res.complaint);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setStarting(false);
    }
  };
  const close = (kind: 'resolve' | 'reject') => async (note: string) => {
    const res = await api.post<Detail>(`/admin/complaints/${c._id}/${kind}`, kind === 'resolve' ? { message: note.trim() } : { reason: note.trim() });
    toast.success(kind === 'resolve' ? t.resolved : t.rejected);
    update(res.complaint);
  };

  const pausedUntil = c.worker?.reliability?.pausedUntil;
  const workerPaused = Boolean(c.worker?.reliability?.pausedAt) && (!pausedUntil || new Date(pausedUntil).getTime() > Date.now());

  return (
    <>
      <PageHeader
        backHref="/admin/beschwerden"
        backLabel={t.back}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t.detailTitle(c.bookingRef)} <ComplaintStatusBadge status={c.status} />
          </span>
        }
        description={`${t.categories[c.category]} · ${f.dateTime(c.createdAt)}`}
        actions={
          isOpen ? (
            <>
              {c.status === 'open' && (
                <Button type="button" variant="outline" onClick={startReview} disabled={starting}>
                  <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" /> {t.startReview}
                </Button>
              )}
              <ConfirmAction
                trigger={
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" /> {t.resolve}
                  </>
                }
                triggerVariant="default"
                title={t.resolveTitle}
                description={t.resolveText}
                confirmLabel={t.resolve}
                withNote
                noteLabel={t.resolveNote}
                noteMaxLength={2000}
                onConfirm={close('resolve')}
              />
              <ConfirmAction
                trigger={
                  <>
                    <Ban className="mr-2 h-4 w-4" aria-hidden="true" /> {t.reject}
                  </>
                }
                triggerClassName="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                title={t.rejectTitle}
                description={t.rejectText}
                confirmLabel={t.reject}
                destructive
                withNote
                noteRequired
                noteLabel={t.rejectNote}
                noteMaxLength={2000}
                onConfirm={close('reject')}
              />
            </>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title={t.complaint}>
            <p className="whitespace-pre-line text-sm text-charcoal">{c.description}</p>
            <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-grey">{t.photos}</h3>
            {c.photos.length === 0 ? (
              <p className="mt-1 text-sm text-muted-grey">{t.noPhotos}</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {c.photos.map((p) => (
                  <PhotoButton key={p._id} complaintId={c._id} photo={p} />
                ))}
              </div>
            )}
          </SectionCard>

          {isOpen ? (
            <SectionCard title={t.actionsTitle} description={t.actionsHint}>
              <ActionForm complaint={c} onSaved={update} />
            </SectionCard>
          ) : (
            <SectionCard title={t.closed}>
              {c.resolution?.message && <p className="whitespace-pre-line text-sm text-charcoal">{c.resolution.message}</p>}
              {c.customerNotifiedAt && <p className="mt-2 text-xs text-muted-grey">{t.notified(f.dateTime(c.customerNotifiedAt))}</p>}
            </SectionCard>
          )}

          <SectionCard title={t.log}>
            {c.actions.length === 0 ? (
              <p className="text-sm text-muted-grey">{t.noActions}</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {c.actions.map((a) => (
                  <li key={a._id} className="rounded-lg border border-border p-3">
                    <p className="font-semibold text-pine-dark">
                      {t.actionNames[a.type]}
                      {a.amountCents ? ` · ${f.euro(a.amountCents)}` : ''}
                      {a.days ? ` · ${a.days} ${t.days}` : ''}
                      {a.giftCardCode ? ` · ${a.giftCardCode}` : ''}
                    </p>
                    {a.note && <p className="mt-1 whitespace-pre-line text-charcoal">{a.note}</p>}
                    <p className="mt-1 text-xs text-muted-grey">
                      {f.dateTime(a.at)}
                      {by(a.by)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>

          <SectionCard title={t.notes} description={t.notesHint}>
            {c.internalNotes.length === 0 ? (
              <p className="text-sm text-muted-grey">{t.noNotes}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {c.internalNotes.map((n) => (
                  <li key={n._id} className="rounded-lg bg-cream p-3">
                    <p className="whitespace-pre-line text-charcoal">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-grey">
                      {f.dateTime(n.at)}
                      {by(n.by)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <NoteForm complaintId={c._id} onSaved={update} />
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title={t.booking}>
            {c.booking ? (
              <InfoList
                items={[
                  [
                    t.booking,
                    <Link key="b" href={`/admin/buchungen/${c.booking._id}`} className="text-pine hover:underline">
                      {c.booking.reference}
                    </Link>,
                  ],
                  [t.date, `${f.dateLong(c.booking.preferredDate)}, ${f.slot(c.booking.slot, c.booking.slotEnd)}`],
                  [t.amount, f.euro(c.booking.pricing?.totalCents ?? c.booking.payment?.amountCents)],
                  [t.payment, tc.paymentStatus?.[c.booking.payment?.status as keyof typeof tc.paymentStatus]?.label ?? c.booking.payment?.status ?? '–'],
                  [t.refundable, f.euro(c.refundableCents)],
                ]}
              />
            ) : (
              <p className="text-sm text-muted-grey">–</p>
            )}
          </SectionCard>
          <SectionCard title={t.customer}>
            {c.customer ? (
              <InfoList
                items={[
                  [
                    t.customer,
                    <Link key="c" href={`/admin/kunden/${c.customer._id}`} className="text-pine hover:underline">
                      {c.customer.name}
                    </Link>,
                  ],
                  ['E-Mail', c.customer.email],
                  ...(c.customer.phone ? ([['Tel.', c.customer.phone]] as [string, string][]) : []),
                ]}
              />
            ) : (
              <p className="text-sm text-muted-grey">–</p>
            )}
          </SectionCard>
          <SectionCard title={t.worker}>
            {c.worker ? (
              <>
                <InfoList
                  items={[
                    [
                      t.worker,
                      <Link key="w" href={`/admin/reinigungskraefte/${c.worker._id}`} className="text-pine hover:underline">
                        {c.worker.name}
                      </Link>,
                    ],
                    ['E-Mail', c.worker.email],
                  ]}
                />
                {c.workerCounts && <p className="mt-2 text-sm text-charcoal">{t.workerComplaints(c.workerCounts.total)}</p>}
                {workerPaused && <p className="mt-1 text-sm font-medium text-amber-800">{pausedUntil ? t.paused(f.dateTime(pausedUntil)) : t.pausedOpen}</p>}
                {!c.worker.isActive && <p className="mt-1 text-sm font-medium text-red-700">{t.actionNames.block}</p>}
              </>
            ) : (
              <p className="text-sm text-muted-grey">{t.noWorker}</p>
            )}
          </SectionCard>
          <SectionCard title={t.history}>
            <ol className="space-y-2 text-sm">
              {c.history.map((h, i) => (
                <li key={i}>
                  <ComplaintStatusBadge status={h.status} />{' '}
                  <span className="text-xs text-muted-grey">
                    {f.dateTime(h.at)}
                    {by(h.by)}
                  </span>
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
