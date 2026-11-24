'use client';

// "Buchung bearbeiten" – customer edits of an upcoming booking:
// reschedule (day + start time), duration, extras and notes, with a live
// price preview (POST /bookings/estimate) and an explicit confirm step
// before PATCH /customer/bookings/:id. The server re-validates everything.
import { useCallback, useMemo, useState } from 'react';
import { LoaderCircle, Minus, Pencil, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { api, ApiError } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError, translateApiMessage } from '@/lib/i18n/api-errors';
import catalogue from '@/lib/i18n/messages/catalogue';
import type { Booking, BookingPayment, BookingPricing, BookingStatus, ServiceId } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/componets/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componets/ui/dialog';
import { Textarea } from '@/componets/ui/tesxtarea';
import { ErrorBox, FormField, textareaClass } from '../../buchung/_components/form-field';
import { useAvailability, useAvailableDays, useEstimate, useExtras } from '../../buchung/_lib/hooks';
import { bookableRange, dateValueToIso, fromDateValue } from '../../buchung/_lib/wizard';
import { addMinutes } from '../../_shared/slot-range';
import messages from '../_messages';

const MAX_NOTES = 1000;

/** PATCH /customer/bookings/:id → 200 */
interface EditResponse {
  priceDeltaCents?: number;
  changes?: { field: string; from?: unknown; to?: unknown }[];
  booking?: {
    preferredDate?: string;
    slot?: string;
    slotEnd?: string;
    serviceId?: ServiceId;
    extras?: string[];
    durationMinutes?: number;
    pricing?: BookingPricing;
    payment?: BookingPayment;
    status?: BookingStatus;
  };
}

const sortedKey = (list: string[]) => [...list].sort().join(',');

/**
 * Server messages of this endpoint are partly not in the translation table yet.
 * Known messages are translated; unknown ones are shown as-is (English) instead
 * of the generic fallback, so the customer still learns the actual reason.
 */
function useEditErrorText() {
  const { locale } = useLocale();
  return useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError && error.status > 0 && error.status !== 429 && error.status < 500) {
        const translated = translateApiMessage(error.message, locale);
        const generic = translateApiMessage('__fiduxa_unknown_message__', locale);
        if (translated === generic && error.message !== generic) return error.message;
        return translated;
      }
      return translateApiError(error, locale);
    },
    [locale]
  );
}

/** Size changes (duration/extras) go through the office for these bookings */
export const isSizeLocked = (booking: Booking) =>
  (booking.payment?.status === 'paid' && (booking.payment.method === 'stripe' || booking.payment.method === 'paypal')) ||
  (booking.pricing?.giftCardCents ?? 0) > 0;

export function EditBooking({ booking, onSaved }: { booking: Booking; onSaved: (next: Booking) => void }) {
  const t = useMessages(messages).edit;
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button type="button" onClick={() => setOpen(true)} className="button button-quiet button-small shrink-0">
        <Pencil className="h-4 w-4" aria-hidden="true" /> {t.button}
      </button>
      <DialogContent className="max-h-[85vh] w-[calc(100%-32px)] max-w-xl overflow-y-auto rounded-2xl bg-white p-5 sm:p-6">
        {open && (
          <EditForm
            booking={booking}
            onClose={() => setOpen(false)}
            onSaved={(next) => {
              setOpen(false);
              onSaved(next);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="m-0 text-sm font-bold text-pine-dark">{children}</h3>;
}

function Loading({ label }: { label: string }) {
  return (
    <p className="m-0 flex items-center gap-2 text-sm text-muted-grey" role="status">
      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {label}
    </p>
  );
}

function EditForm({ booking, onClose, onSaved }: { booking: Booking; onClose: () => void; onSaved: (next: Booking) => void }) {
  const t = useMessages(messages).edit;
  const cat = useMessages(catalogue);
  const f = useFormat();
  const errText = useEditErrorText();

  const lockedSize = isSizeLocked(booking);
  const hasPromo = (booking.pricing?.promotionDiscountCents ?? 0) > 0;
  const currentDate = (booking.preferredDate ?? '').slice(0, 10);
  const currentSlot = booking.slot;
  const currentWindowId = booking.availabilitySlot ? String(booking.availabilitySlot) : null;
  const currentDuration = booking.estimate?.durationMinutes ?? null;
  const baselineCents = booking.pricing?.totalCents ?? booking.estimate?.totalCents ?? null;

  const [phase, setPhase] = useState<'form' | 'confirm'>('form');
  const [date, setDate] = useState(currentDate);
  const [startTime, setStartTime] = useState(currentSlot);
  const [windowId, setWindowId] = useState<string | null>(currentWindowId);
  const [slotEnd, setSlotEnd] = useState<string | null>(booking.slotEnd ?? null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(currentDuration);
  const [extras, setExtras] = useState<string[]>(booking.extras ?? []);
  const [notes, setNotes] = useState(booking.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Fresh total from a 409 PRICE_CHANGED – confirmed with the next save */
  const [freshTotal, setFreshTotal] = useState<number | null>(null);

  // ---------- data -----------------------------------------------------------
  const [range] = useState(() => bookableRange());
  const availabilityDuration = durationMinutes ?? currentDuration;
  const days = useAvailableDays(range.min, range.max, availabilityDuration);
  const slots = useAvailability(date || null, availabilityDuration);
  const extrasList = useExtras(lockedSize ? null : booking.serviceId);
  const est = useEstimate(
    !lockedSize && booking.estimate
      ? {
          serviceId: booking.serviceId,
          areaM2: booking.areaM2,
          condition: booking.condition,
          frequency: booking.frequency,
          extras,
          ...(durationMinutes != null ? { durationMinutes } : {}),
        }
      : null
  );

  // ---------- derived --------------------------------------------------------
  const rescheduled = date !== currentDate || startTime !== currentSlot;
  const durationChanged = durationMinutes != null && currentDuration != null && durationMinutes !== currentDuration;
  const extrasChanged = sortedKey(extras) !== sortedKey(booking.extras ?? []);
  const sizeChanged = !lockedSize && (durationChanged || extrasChanged);
  const notesChanged = notes.trim() !== (booking.notes ?? '').trim();
  const anyChange = rescheduled || sizeChanged || notesChanged;

  const min = est.estimate?.minimumMinutes ?? booking.estimate?.minimumMinutes ?? 30;
  const max = est.estimate?.maximumMinutes ?? booking.estimate?.maximumMinutes ?? 720;
  const step = est.estimate?.durationStepMinutes ?? booking.estimate?.durationStepMinutes ?? 30;

  const freeDays = useMemo(() => {
    const list = (days.days ?? []).filter((d) => d.freeSlots > 0).map((d) => d.date);
    if (currentDate && !list.includes(currentDate)) list.push(currentDate);
    return list.sort();
  }, [days.days, currentDate]);

  const slotList = useMemo(() => (slots.slots ?? []).filter((s) => s.available !== false), [slots.slots]);
  const showCurrentSlotChip = date === currentDate && !slotList.some((s) => s.startTime === currentSlot);

  const newEnd = rescheduled ? slotEnd ?? addMinutes(startTime, availabilityDuration) : booking.slotEnd ?? null;
  const previewTotal = freshTotal ?? (est.isCurrent ? est.estimate?.totalCents ?? null : null);
  const delta = previewTotal != null && baselineCents != null ? previewTotal - baselineCents : null;

  const rescheduleIncomplete = rescheduled && (!date || !startTime || !windowId);
  const estimatePending = sizeChanged && !est.error && !(est.isCurrent && est.estimate) && freshTotal == null;
  const canContinue = anyChange && !rescheduleIncomplete && !estimatePending && !(sizeChanged && est.error) && notes.length <= MAX_NOTES;

  const pickDay = (value: string) => {
    setDate(value);
    setFreshTotal(null);
    if (value === currentDate) {
      setStartTime(currentSlot);
      setWindowId(currentWindowId);
      setSlotEnd(booking.slotEnd ?? null);
    } else {
      setStartTime('');
      setWindowId(null);
      setSlotEnd(null);
    }
  };

  const setDuration = (minutes: number) => {
    setDurationMinutes(Math.min(max, Math.max(min, minutes)));
    setFreshTotal(null);
  };

  const toggleExtra = (id: string, checked: boolean) => {
    setExtras((prev) => (checked ? [...prev, id] : prev.filter((e) => e !== id)));
    setFreshTotal(null);
  };

  // ---------- save -----------------------------------------------------------
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (rescheduled) {
        body.preferredDate = date;
        body.slotId = windowId;
        body.startTime = startTime;
      }
      if (durationChanged && !lockedSize) body.durationMinutes = durationMinutes;
      if (extrasChanged && !lockedSize) body.extras = extras;
      if (notesChanged) body.notes = notes.trim();
      // With a promotion the server recomputes the discount – the client
      // estimate can differ, so no expectedTotalCents guard is sent then.
      if (sizeChanged && !hasPromo && previewTotal != null) body.expectedTotalCents = previewTotal;

      const res = await api.patch<EditResponse>(`/customer/bookings/${encodeURIComponent(booking._id)}`, body);
      const b = res.booking;
      const next: Booking = {
        ...booking,
        preferredDate: b?.preferredDate ?? booking.preferredDate,
        slot: b?.slot ?? booking.slot,
        slotEnd: b?.slotEnd ?? booking.slotEnd,
        serviceId: b?.serviceId ?? booking.serviceId,
        extras: b?.extras ?? booking.extras,
        status: b?.status ?? booking.status,
        payment: b?.payment ?? booking.payment,
        pricing: b?.pricing ?? booking.pricing,
        notes: notesChanged ? notes.trim() : booking.notes,
        estimate: booking.estimate
          ? { ...booking.estimate, durationMinutes: b?.durationMinutes ?? booking.estimate.durationMinutes }
          : booking.estimate,
      };
      toast.success(t.toast);
      onSaved(next);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PRICE_CHANGED') {
        const fresh = typeof e.body?.totalCents === 'number' ? e.body.totalCents : null;
        setFreshTotal(fresh);
        setError(fresh != null ? t.priceChangedNote(f.euro(fresh)) : errText(e));
      } else {
        setError(errText(e));
      }
    } finally {
      setBusy(false);
    }
  };

  // ---------- price preview (form + confirm) ---------------------------------
  const priceBox = sizeChanged ? (
    <div className="rounded-[12px] border border-sage bg-mint p-3 text-sm text-pine-dark" aria-live="polite">
      {previewTotal != null ? (
        <>
          <p className="m-0 font-bold">{t.newPrice(f.euro(previewTotal))}</p>
          <p className="m-0 mt-0.5 tabular-nums">
            {delta == null || delta === 0 ? t.noDelta : t.delta(`${delta > 0 ? '+' : '−'} ${f.euro(Math.abs(delta))}`)}
          </p>
          {hasPromo && (
            <p className="m-0 mt-1.5 flex items-start gap-1.5 text-xs text-pine-dark/80">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {t.promoNote}
            </p>
          )}
        </>
      ) : est.error ? (
        <p className="m-0 text-red-800">{est.error}</p>
      ) : (
        <p className="m-0 flex items-center gap-2 text-muted-grey">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.calculating}
        </p>
      )}
    </div>
  ) : null;

  const dayChip = (value: string) => {
    const d = fromDateValue(value);
    const selected = value === date;
    const isCurrent = value === currentDate;
    return (
      <button
        key={value}
        type="button"
        aria-pressed={selected}
        aria-label={f.dateLong(dateValueToIso(value))}
        onClick={() => pickDay(value)}
        className={cn(
          'flex min-h-[60px] w-[58px] shrink-0 snap-start flex-col items-center justify-center rounded-[12px] border text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine',
          selected ? 'border-pine bg-pine text-white' : 'border-sage bg-mint text-pine-dark hover:border-pine'
        )}
      >
        <span className="text-[10px] font-semibold uppercase">{d.toLocaleDateString(f.tag, { weekday: 'short' })}</span>
        <span className="text-base font-bold tabular-nums leading-tight">{d.getDate()}</span>
        <span className="text-[10px]">{isCurrent ? t.currentBadge : d.toLocaleDateString(f.tag, { month: 'short' })}</span>
      </button>
    );
  };

  const stepButton =
    'grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-pine bg-white text-pine transition-colors hover:bg-mint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine disabled:cursor-not-allowed disabled:border-border disabled:text-muted-grey disabled:hover:bg-white';

  const extraText = cat.extras as Record<string, { label: string } | undefined>;

  // ---------- confirm step ---------------------------------------------------
  if (phase === 'confirm') {
    const row = (label: string, from: string, to: string) => (
      <div className="grid gap-0.5 border-b border-border py-2 last:border-b-0">
        <dt className="text-xs font-bold uppercase tracking-wide text-muted-grey">{label}</dt>
        <dd className="m-0 text-sm text-charcoal">
          <span className="text-muted-grey line-through decoration-muted-grey/60">{from}</span> {t.arrow}{' '}
          <strong className="text-pine-dark">{to}</strong>
        </dd>
      </div>
    );
    const extrasLabel = (list: string[]) =>
      list.length === 0 ? t.none : list.map((id) => extraText[id]?.label ?? id).join(', ');

    return (
      <>
        <DialogHeader>
          <DialogTitle className="text-pine-dark">{t.confirmTitle}</DialogTitle>
          <DialogDescription>{t.confirmIntro}</DialogDescription>
        </DialogHeader>
        <dl className="m-0 grid">
          {rescheduled &&
            row(
              t.changeDate,
              `${f.dateLong(booking.preferredDate)} · ${f.slot(booking.slot, booking.slotEnd)}`,
              `${f.dateLong(dateValueToIso(date))} · ${f.slot(startTime, newEnd)}`
            )}
          {durationChanged && row(t.changeDuration, f.hours(currentDuration), f.hours(durationMinutes))}
          {extrasChanged && row(t.changeExtras, extrasLabel(booking.extras ?? []), extrasLabel(extras))}
          {notesChanged && row(t.changeNotes, booking.notes?.trim() ? booking.notes.trim() : t.none, notes.trim() || t.none)}
        </dl>
        {priceBox}
        {error && <ErrorBox message={error} />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setPhase('form')} disabled={busy} className="button button-quiet button-small">
            {t.back}
          </button>
          <button type="button" onClick={save} disabled={busy} className="button button-small justify-center disabled:cursor-wait disabled:opacity-70">
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? t.saving : t.save}
          </button>
        </div>
      </>
    );
  }

  // ---------- form step ------------------------------------------------------
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-pine-dark">{t.title(booking.reference)}</DialogTitle>
        <DialogDescription>{lockedSize ? t.introLocked : t.intro}</DialogDescription>
      </DialogHeader>

      {/* 1) Termin */}
      <section className="grid gap-3 border-t border-border pt-4">
        <SectionTitle>{t.dateTitle}</SectionTitle>
        {days.loading && !days.days && <Loading label={t.loadingDays} />}
        {days.error && !days.days && <ErrorBox message={days.error} onRetry={days.reload} />}
        {days.days && freeDays.length === 0 && <p className="m-0 text-sm text-muted-grey">{t.noDays}</p>}
        {freeDays.length > 0 && (
          <div
            role="group"
            aria-label={t.dayLabel}
            className={cn('-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1', days.loading && 'opacity-60')}
            aria-busy={days.loading}
          >
            {freeDays.map(dayChip)}
          </div>
        )}
        {date && (
          <div role="group" aria-label={t.timeLabel}>
            <p className="mb-2 mt-0 text-xs font-bold uppercase tracking-wider text-muted-grey">{t.timeLabel}</p>
            {slots.loading && !slots.slots && <Loading label={t.loadingSlots} />}
            {slots.error && !slots.slots && <ErrorBox message={slots.error} onRetry={slots.reload} />}
            {(slots.slots || showCurrentSlotChip) && (
              <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3', slots.loading && 'opacity-60')} aria-busy={slots.loading}>
                {showCurrentSlotChip && (
                  <button
                    type="button"
                    aria-pressed={startTime === currentSlot}
                    onClick={() => pickDay(currentDate)}
                    className={cn(
                      'flex min-h-[48px] flex-col items-center justify-center rounded-[12px] border px-2 py-1.5 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine',
                      startTime === currentSlot ? 'border-pine bg-pine text-white' : 'border-border bg-white text-pine-dark hover:border-sage hover:bg-mint'
                    )}
                  >
                    <span className="text-sm font-bold tabular-nums">{f.slot(currentSlot, booking.slotEnd)}</span>
                    <span className="text-[10px] font-semibold uppercase">{t.currentBadge}</span>
                  </button>
                )}
                {slotList.map((s) => {
                  const checked = startTime === s.startTime && windowId === s.id;
                  const isCurrent = date === currentDate && s.startTime === currentSlot;
                  return (
                    <button
                      key={`${s.id}-${s.startTime}`}
                      type="button"
                      aria-pressed={checked || (isCurrent && startTime === currentSlot)}
                      onClick={() => {
                        setStartTime(s.startTime);
                        setWindowId(s.id);
                        setSlotEnd(s.endTime);
                        setFreshTotal(null);
                      }}
                      className={cn(
                        'flex min-h-[48px] flex-col items-center justify-center rounded-[12px] border px-2 py-1.5 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine',
                        checked || (isCurrent && startTime === currentSlot)
                          ? 'border-pine bg-pine text-white'
                          : 'border-border bg-white text-pine-dark hover:border-sage hover:bg-mint'
                      )}
                    >
                      <span className="text-sm font-bold tabular-nums">
                        {s.startTime} – {s.endTime}
                      </span>
                      {isCurrent && <span className="text-[10px] font-semibold uppercase">{t.currentBadge}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {slots.slots && slotList.length === 0 && !showCurrentSlotChip && !slots.loading && (
              <p className="m-0 text-sm text-muted-grey">{t.noSlots}</p>
            )}
          </div>
        )}
      </section>

      {/* 2) Dauer + 3) Zusatzleistungen – hidden for paid-online / gift-card bookings */}
      {lockedSize ? (
        <p className="m-0 rounded-[12px] border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900" role="note">
          {t.sizeLocked}
        </p>
      ) : (
        <>
          <section className="grid gap-3 border-t border-border pt-4">
            <SectionTitle>{t.durationTitle}</SectionTitle>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => durationMinutes != null && setDuration(durationMinutes - step)}
                disabled={durationMinutes == null || durationMinutes <= min}
                aria-label={t.less(step)}
                className={stepButton}
              >
                <Minus className="h-5 w-5" aria-hidden="true" />
              </button>
              <p className="m-0 min-w-[110px] text-center text-2xl font-bold tabular-nums tracking-tight text-pine-dark" aria-live="polite">
                {durationMinutes != null ? f.hours(durationMinutes) : '–'}
              </p>
              <button
                type="button"
                onClick={() => durationMinutes != null && setDuration(durationMinutes + step)}
                disabled={durationMinutes == null || durationMinutes >= max}
                aria-label={t.more(step)}
                className={stepButton}
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </section>

          <section className="grid gap-3 border-t border-border pt-4">
            <SectionTitle>{t.extrasTitle}</SectionTitle>
            {extrasList.loading && !extrasList.extras && <Loading label={t.loadingExtras} />}
            {extrasList.error && !extrasList.extras && <ErrorBox message={extrasList.error} onRetry={extrasList.reload} />}
            {extrasList.extras && (
              <ul className="m-0 grid list-none gap-2 p-0">
                {extrasList.extras.map((extra) => {
                  const checked = extras.includes(extra.id);
                  return (
                    <li key={extra.id}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-[12px] border p-3 transition-colors',
                          checked ? 'border-pine bg-mint' : 'border-border bg-white hover:border-sage'
                        )}
                      >
                        <Checkbox checked={checked} onCheckedChange={(value) => toggleExtra(extra.id, value === true)} />
                        <span className="min-w-0 flex-1 text-sm font-semibold text-pine-dark">{extraText[extra.id]?.label ?? extra.label}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-grey">
                          +{f.hours(extra.minutes)}
                          {extra.priceCents > 0 ? ` · ${f.euro(extra.priceCents)}` : ''}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {priceBox}
        </>
      )}

      {/* 4) Hinweise */}
      <section className="grid gap-3 border-t border-border pt-4">
        <FormField id="edit-notes" label={t.notesTitle} optional hint={t.notesHint} error={notes.length > MAX_NOTES ? t.tooLong : undefined}>
          {(p) => (
            <Textarea {...p} rows={3} maxLength={MAX_NOTES} value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaClass} />
          )}
        </FormField>
      </section>

      {error && <ErrorBox message={error} />}

      <div className="flex flex-col-reverse items-stretch gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-xs text-muted-grey" aria-live="polite">
          {!anyChange ? t.noChanges : ''}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button type="button" onClick={onClose} className="button button-quiet button-small">
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setPhase('confirm');
            }}
            disabled={!canContinue}
            className="button button-small justify-center disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t.continue}
          </button>
        </div>
      </div>
    </>
  );
}
