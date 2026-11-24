'use client';

// Admin booking edit: reschedule, duration/extras/service/area/condition,
// customer contact data and notes via PATCH /admin/bookings/:id/details.
// A cleaner conflict (409) asks for confirmation and retries with
// forceUnassign; the price delta and the "already paid" warning are surfaced
// after saving.
import { useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Minus, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Checkbox } from '@/componets/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/componets/ui/dialog';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Textarea } from '@/componets/ui/tesxtarea';
import { api, ApiError, qs } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import catalogue, { type ExtraId } from '@/lib/i18n/messages/catalogue';
import common from '@/lib/i18n/messages/common';
import type { AvailableDay, Booking, Condition, Extra, ServiceId, Slot } from '@/lib/types';

import bookingMessages from '../buchungen/_messages';
import { NativeSelect } from './states';
import { berlinToday, useApi, useErrorText } from './use-api';

const EDITABLE_STATUSES: Booking['status'][] = ['payment_pending', 'confirmed'];
const EDIT_SERVICES: ServiceId[] = ['home-cleaning', 'deep-cleaning', 'end-of-tenancy'];
const CONDITIONS: Condition[] = ['basic', 'normal', 'moderate', 'heavy'];
const RANGE_DAYS = 56;

interface EditResponse {
  priceDeltaCents?: number;
  paymentUntouched?: boolean;
  unassignedWorker?: string | null;
  changes?: { field: string; from?: string; to?: string }[];
}

const plusDays = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');

/** `value`, but only after it stopped changing for `delay` ms */
function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

interface FormState {
  date: string;
  /** `windowId|startTime` of the chosen slot, 'current' = keep, '' = must pick */
  slotKey: string;
  duration: number;
  serviceId: ServiceId;
  area: string;
  condition: Condition;
  extras: string[];
  notes: string;
  name: string;
  phone: string;
  address: string;
  postcode: string;
  accessNotes: string;
  notify: boolean;
}

const initialForm = (b: Booking): FormState => ({
  date: b.preferredDate.slice(0, 10),
  slotKey: 'current',
  duration: b.estimate?.durationMinutes ?? 120,
  serviceId: b.serviceId,
  area: String(b.areaM2 ?? ''),
  condition: b.condition,
  extras: [...(b.extras ?? [])],
  notes: b.notes ?? '',
  name: b.customerDetails.name ?? '',
  phone: b.customerDetails.phone ?? '',
  address: b.customerDetails.address ?? '',
  postcode: b.customerDetails.postcode ?? '',
  accessNotes: b.customerDetails.accessNotes ?? '',
  notify: true,
});

export function EditBookingButton({ booking, onChanged }: { booking: Booking; onChanged: () => void }) {
  const t = useMessages(bookingMessages);
  const c18 = useMessages(common);
  const cat = useMessages(catalogue);
  const f = useFormat();
  const errorText = useErrorText();
  const id = useId();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => initialForm(booking));
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const orig = useMemo(() => initialForm(booking), [booking]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((s) => ({ ...s, [key]: value }));

  const today = useMemo(() => berlinToday(), []);
  const duration = useDebounced(form.duration);

  const days = useApi<{ data: AvailableDay[] }>(
    open ? `/bookings/availability/days${qs({ from: today, to: plusDays(today, RANGE_DAYS), duration })}` : null
  );
  const slots = useApi<{ data: Slot[] }>(
    open && form.date ? `/bookings/availability${qs({ date: form.date, duration })}` : null
  );
  const extrasRes = useApi<{ extras: Extra[] }>(open ? `/extras${qs({ serviceId: form.serviceId })}` : null);

  // Drop selected extras that the chosen service does not offer
  useEffect(() => {
    const available = extrasRes.data?.extras;
    if (!available) return;
    setForm((s) => {
      const kept = s.extras.filter((x) => available.some((e) => e.id === x));
      return kept.length === s.extras.length ? s : { ...s, extras: kept };
    });
  }, [extrasRes.data]);

  if (!EDITABLE_STATUSES.includes(booking.status)) return null;

  const freeDays = (days.data?.data ?? []).filter((d) => d.freeSlots > 0);
  const availableSlots = (slots.data?.data ?? []).filter((s) => s.available !== false);
  const extraLabel = (x: Extra) => cat.extras[x.id as ExtraId]?.label ?? x.label;

  const buildBody = (): { body?: Record<string, unknown>; error?: string } => {
    const body: Record<string, unknown> = { notify: form.notify };

    if (form.slotKey !== 'current') {
      if (!form.slotKey) return { error: t.edit.slotMissing };
      const [slotId, startTime] = form.slotKey.split('|');
      body.preferredDate = form.date;
      body.slotId = slotId;
      body.startTime = startTime;
    }
    if (form.duration !== orig.duration) body.durationMinutes = form.duration;
    if (form.serviceId !== orig.serviceId) body.serviceId = form.serviceId;
    const area = Number(form.area);
    if (form.area.trim() !== orig.area) {
      if (!Number.isFinite(area) || area < 15 || area > 1000) return { error: t.edit.areaError };
      body.areaM2 = area;
    }
    if (form.condition !== orig.condition) body.condition = form.condition;
    if (form.serviceId !== orig.serviceId || !sameSet(form.extras, orig.extras)) body.extras = form.extras;
    if (form.notes.trim() !== orig.notes) body.notes = form.notes.trim();

    const details: Record<string, string> = {};
    (['name', 'phone', 'address', 'postcode', 'accessNotes'] as const).forEach((key) => {
      if (form[key].trim() !== orig[key]) details[key] = form[key].trim();
    });
    if (Object.keys(details).length > 0) body.customerDetails = details;

    if (Object.keys(body).length <= 1) return {};
    return { body };
  };

  const submit = async (forceUnassign = false) => {
    setFormError(null);
    const { body, error } = buildBody();
    if (error) {
      setFormError(error);
      return;
    }
    if (!body) {
      toast.info(t.edit.noChanges);
      return;
    }
    if (forceUnassign) body.forceUnassign = true;
    setPending(true);
    try {
      const res = await api.patch<EditResponse>(`/admin/bookings/${booking._id}/details`, body);
      const delta = res.priceDeltaCents ?? 0;
      const hints: string[] = [];
      if (delta !== 0) hints.push(t.edit.savedDelta(`${delta > 0 ? '+' : '−'}${f.euro(Math.abs(delta))}`));
      if (res.unassignedWorker) hints.push(t.edit.workerUnassigned);
      toast.success(t.edit.saved, { description: hints.length ? hints.join(' ') : undefined });
      if (res.paymentUntouched) {
        toast.warning(t.edit.paymentUntouchedTitle, {
          description: t.edit.paymentUntouched,
          duration: 15000,
        });
      }
      setConflict(false);
      setOpen(false);
      onChanged();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        (err.code === 'WORKER_CONFLICT' || /cleaner is not available/i.test(err.message))
      ) {
        setConflict(true);
      } else {
        setConflict(false);
        setFormError(errorText(err));
      }
    } finally {
      setPending(false);
    }
  };

  const field = (key: string, label: string, input: React.ReactNode, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      {input}
      {hint && <p className="text-xs text-muted-grey">{hint}</p>}
    </div>
  );

  const section = (title: string) => (
    <h3 className="border-b border-border pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-grey">
      {title}
    </h3>
  );

  const origDayListed = freeDays.some((d) => d.date === orig.date);
  const serviceOptions = EDIT_SERVICES.includes(booking.serviceId)
    ? EDIT_SERVICES
    : [booking.serviceId, ...EDIT_SERVICES];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (next) {
          setForm(initialForm(booking));
          setFormError(null);
          setConflict(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
          {t.edit.button}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.edit.title}</DialogTitle>
          <DialogDescription>{t.edit.description}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          id={`${id}-form`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending && !conflict) void submit();
          }}
          className="space-y-5"
        >
          {section(t.edit.sectionAppointment)}
          <div className="grid gap-4 sm:grid-cols-2">
            {field(
              'day',
              t.edit.day,
              <NativeSelect
                id={`${id}-day`}
                value={form.date}
                disabled={pending}
                onChange={(e) => {
                  const date = e.target.value;
                  setForm((s) => ({ ...s, date, slotKey: date === orig.date ? 'current' : '' }));
                  setFormError(null);
                }}
              >
                {!origDayListed && (
                  <option value={orig.date}>
                    {f.dateShort(orig.date)}
                    {t.edit.currentSuffix}
                  </option>
                )}
                {freeDays.map((d) => (
                  <option key={d.date} value={d.date}>
                    {f.dateShort(d.date)}
                    {d.date === orig.date ? t.edit.currentSuffix : ` · ${t.edit.freeSlots(d.freeSlots)}`}
                  </option>
                ))}
              </NativeSelect>,
              days.loading ? t.edit.loading : undefined
            )}
            {field(
              'slot',
              t.edit.slot,
              <NativeSelect
                id={`${id}-slot`}
                value={form.slotKey}
                disabled={pending}
                onChange={(e) => {
                  set('slotKey', e.target.value);
                  setFormError(null);
                }}
              >
                {form.date === orig.date ? (
                  <option value="current">
                    {f.slot(booking.slot, booking.slotEnd)}
                    {t.edit.currentSuffix}
                  </option>
                ) : (
                  <option value="">{slots.loading ? t.edit.loading : t.edit.pleaseChoose}</option>
                )}
                {availableSlots.map((s) => (
                  <option key={`${s.id}-${s.startTime}`} value={`${s.windowId ?? s.id}|${s.startTime}`}>
                    {s.startTime}–{s.endTime}
                  </option>
                ))}
              </NativeSelect>,
              !slots.loading && slots.data && availableSlots.length === 0 ? t.edit.noSlots : undefined
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-duration`}>{t.edit.duration}</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={pending || form.duration <= 30}
                onClick={() => set('duration', Math.max(30, form.duration - 30))}
                aria-label={t.edit.decreaseDuration}
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </Button>
              <output
                id={`${id}-duration`}
                className="min-w-[9rem] rounded-md border border-input bg-background px-3 py-2 text-center text-sm"
              >
                {t.edit.durationValue(f.hours(form.duration), form.duration)}
              </output>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={pending || form.duration >= 720}
                onClick={() => set('duration', Math.min(720, form.duration + 30))}
                aria-label={t.edit.increaseDuration}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {section(t.edit.sectionScope)}
          <div className="grid gap-4 sm:grid-cols-3">
            {field(
              'service',
              t.edit.service,
              <NativeSelect
                id={`${id}-service`}
                value={form.serviceId}
                disabled={pending}
                onChange={(e) => set('serviceId', e.target.value as ServiceId)}
              >
                {serviceOptions.map((s) => (
                  <option key={s} value={s}>
                    {c18.services[s] ?? s}
                  </option>
                ))}
              </NativeSelect>
            )}
            {field(
              'area',
              t.edit.area,
              <Input
                id={`${id}-area`}
                type="number"
                min={15}
                max={1000}
                inputMode="numeric"
                value={form.area}
                disabled={pending}
                onChange={(e) => set('area', e.target.value)}
              />
            )}
            {field(
              'condition',
              t.edit.condition,
              <NativeSelect
                id={`${id}-condition`}
                value={form.condition}
                disabled={pending}
                onChange={(e) => set('condition', e.target.value as Condition)}
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c18.conditions[c]?.label ?? c}
                  </option>
                ))}
              </NativeSelect>
            )}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium leading-none">{t.edit.extras}</legend>
            {!extrasRes.data ? (
              <p className="text-sm text-muted-grey">{t.edit.loading}</p>
            ) : extrasRes.data.extras.length === 0 ? (
              <p className="text-sm text-muted-grey">{t.edit.extrasNone}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {extrasRes.data.extras.map((x) => (
                  <div key={x.id} className="flex items-start gap-2 rounded-lg border border-border p-2.5">
                    <Checkbox
                      id={`${id}-extra-${x.id}`}
                      className="mt-0.5"
                      checked={form.extras.includes(x.id)}
                      disabled={pending}
                      onCheckedChange={(value) =>
                        set(
                          'extras',
                          value === true ? [...form.extras, x.id] : form.extras.filter((e) => e !== x.id)
                        )
                      }
                    />
                    <div className="min-w-0">
                      <Label htmlFor={`${id}-extra-${x.id}`} className="cursor-pointer leading-snug">
                        {extraLabel(x)}
                      </Label>
                      <p className="text-xs text-muted-grey">
                        {c18.units.minutesShort(x.minutes)} · {f.euro(x.priceCents)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </fieldset>
          {field(
            'notes',
            t.edit.notes,
            <Textarea
              id={`${id}-notes`}
              rows={3}
              maxLength={1000}
              value={form.notes}
              disabled={pending}
              onChange={(e) => set('notes', e.target.value)}
            />
          )}

          {section(t.edit.sectionCustomer)}
          <div className="grid gap-4 sm:grid-cols-2">
            {field(
              'name',
              t.detail.name,
              <Input id={`${id}-name`} value={form.name} maxLength={100} disabled={pending} onChange={(e) => set('name', e.target.value)} />
            )}
            {field(
              'phone',
              t.detail.phone,
              <Input id={`${id}-phone`} value={form.phone} maxLength={30} disabled={pending} onChange={(e) => set('phone', e.target.value)} />
            )}
            {field(
              'address',
              t.detail.address,
              <Input id={`${id}-address`} value={form.address} maxLength={200} disabled={pending} onChange={(e) => set('address', e.target.value)} />
            )}
            {field(
              'postcode',
              t.edit.postcode,
              <Input id={`${id}-postcode`} value={form.postcode} maxLength={10} disabled={pending} onChange={(e) => set('postcode', e.target.value)} />
            )}
          </div>
          {field(
            'accessNotes',
            t.detail.access,
            <Textarea
              id={`${id}-accessNotes`}
              rows={2}
              maxLength={500}
              value={form.accessNotes}
              disabled={pending}
              onChange={(e) => set('accessNotes', e.target.value)}
            />
          )}

          <div className="flex items-start gap-2 rounded-lg border border-border bg-cream/60 p-3">
            <Checkbox
              id={`${id}-notify`}
              className="mt-0.5"
              checked={form.notify}
              disabled={pending}
              onCheckedChange={(value) => set('notify', value === true)}
            />
            <div className="space-y-1">
              <Label htmlFor={`${id}-notify`} className="cursor-pointer leading-snug">
                {t.edit.notify}
              </Label>
              <p className="text-xs text-muted-grey">{t.edit.notifyHint}</p>
            </div>
          </div>

          {conflict && (
            <div role="alert" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="flex items-start gap-2 font-semibold">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {t.edit.conflictTitle}
              </p>
              <p>{t.edit.conflictQuestion}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={pending} onClick={() => void submit(true)}>
                  {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  {t.edit.conflictConfirm}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setConflict(false)}>
                  {t.edit.conflictCancel}
                </Button>
              </div>
            </div>
          )}

          {formError && (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {formError}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              {t.edit.cancel}
            </Button>
            <Button type="submit" disabled={pending || conflict}>
              {pending && !conflict && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t.edit.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
