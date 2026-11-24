'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Loader2, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Switch } from '@/componets/ui/switch';
import { ApiError, api } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import type { Formatter } from '@/lib/i18n/format';
import catalogue, { type ExtraId } from '@/lib/i18n/messages/catalogue';
import type { PlatformSettings } from '@/lib/types';
import { cn } from '@/lib/utils';

import { centsToInput, parseEuroToCents } from '../_components/labels';
import { DetailSkeleton, ErrorState, NativeSelect, PageHeader, SectionCard } from '../_components/states';
import { apiMessage, useApi, useErrorText } from '../_components/use-api';
import settingsMessages, { type SettingsMessages } from './_messages';

type SectionKey = 'pricing' | 'extras' | 'booking' | 'payments' | 'workerPay' | 'giftCards';
type Errors = Record<string, string>;
type SaveValue = {
  pricing: PlatformSettings['pricing'];
  extras: { id: string; minutes: number; priceCents: number; active: boolean }[];
  booking: PlatformSettings['booking'];
  payments: Pick<PlatformSettings['payments'], 'cashEnabled' | 'paypalEnabled' | 'stripeEnabled'>;
  workerPay: PlatformSettings['workerPay'];
  giftCards: NonNullable<PlatformSettings['giftCards']>;
};

const STEPS = [15, 30, 60] as const;
const DEFAULT_VAT = 0.19;
type Step = (typeof STEPS)[number];
const asStep = (value: string): Step => (Number(value) === 15 ? 15 : Number(value) === 60 ? 60 : 30);

/** "2,5" / "2.5" → 2.5 (null if not a plain number) */
const parseNum = (raw: string): number | null => {
  const v = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  return Number(v);
};
/** 2.5 → "2,5" (de/pl) / "2.5" (en) */
const numInput = (n: number, decimalComma: boolean) => {
  const s = String(Math.round(n * 100) / 100);
  return decimalComma ? s.replace('.', ',') : s;
};

// ---------------------------------------------------------------------------
// Validation helper – keys are the server's field paths inside the section
// ---------------------------------------------------------------------------

function createValidator(t: SettingsMessages, f: Formatter) {
  const errors: Errors = {};
  return {
    errors,
    /** Plain number in [min, max] */
    num(path: string, raw: string, min: number, max: number, opts: { integer?: boolean; unit?: string } = {}) {
      const n = parseNum(raw);
      const unit = opts.unit ? ` ${opts.unit}` : '';
      if (n === null || (opts.integer && !Number.isInteger(n))) {
        errors[path] = t.invalidNumber;
        return undefined;
      }
      if (n < min || n > max) {
        errors[path] = t.rangeError(`${f.number(min)}${unit}`, `${f.number(max)}${unit}`);
        return undefined;
      }
      return n;
    },
    /** Euro input → cents in [min, max] */
    cents(path: string, raw: string, min: number, max: number) {
      const c = parseEuroToCents(raw);
      if (c === null) {
        errors[path] = t.invalidNumber;
        return undefined;
      }
      if (c < min || c > max) {
        errors[path] = t.rangeError(f.euro(min), f.euro(max));
        return undefined;
      }
      return c;
    },
  };
}

/** Save one complete section. Returns the new settings or throws a SectionError. */
class SectionError extends Error {
  constructor(
    message: string,
    public fieldErrors: Errors
  ) {
    super(message);
  }
}

function useSaveSection<K extends SectionKey>(key: K, onSaved: (s: PlatformSettings) => void, sectionTitle: string) {
  const t = useMessages(settingsMessages);
  const { locale } = useLocale();
  const errorText = useErrorText();
  const [saving, setSaving] = useState(false);

  const save = async (value: SaveValue[K]) => {
    setSaving(true);
    try {
      const res = await api.put<{ settings: PlatformSettings }>('/admin/settings', { [key]: value });
      onSaved(res.settings);
      toast.success(t.saved(sectionTitle));
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && Array.isArray(err.details)) {
        const fieldErrors: Errors = {};
        const sectionMessages: string[] = [];
        err.details.forEach(({ field, message }) => {
          const path = field.startsWith(`${key}.`) ? field.slice(key.length + 1) : '';
          // zod's field texts are English and generic – show a localized hint instead
          if (path) fieldErrors[path] = t.invalidValue;
          else sectionMessages.push(apiMessage(message, locale));
        });
        throw new SectionError(sectionMessages[0] ?? t.fixErrors, fieldErrors);
      }
      throw new SectionError(errorText(err), {});
    } finally {
      setSaving(false);
    }
  };

  return { save, saving };
}

// ---------------------------------------------------------------------------
// Layout parts
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-grey">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function SectionForm({
  id,
  title,
  description,
  dirty,
  saving,
  formError,
  onSubmit,
  onDiscard,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  dirty: boolean;
  saving: boolean;
  formError: string | null;
  onSubmit: () => void;
  onDiscard: () => void;
  children: React.ReactNode;
}) {
  const t = useMessages(settingsMessages);
  return (
    <SectionCard
      id={id}
      title={title}
      description={description}
      className="scroll-mt-24"
      actions={
        dirty ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            {t.unsaved}
          </span>
        ) : undefined
      }
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!saving) onSubmit();
        }}
        className="space-y-5"
      >
        {children}
        {formError && (
          <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {formError}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onDiscard} disabled={!dirty || saving}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            {t.discard}
          </Button>
          <Button type="submit" disabled={!dirty || saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {saving ? t.saving : t.save}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

/**
 * Draft state of one section. The draft is reset when the saved section
 * changes (compared by value, so saving another section keeps local edits).
 */
function useDraft<D>(savedValue: unknown, toDraft: () => D) {
  const savedKey = JSON.stringify(savedValue);
  const [draft, setDraft] = useState<D>(toDraft);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(toDraft());
    setErrors({});
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);
  const discard = () => {
    setDraft(toDraft());
    setErrors({});
    setFormError(null);
  };
  return { draft, setDraft, errors, setErrors, formError, setFormError, discard };
}

// ---------------------------------------------------------------------------
// Preise
// ---------------------------------------------------------------------------

type PricingDraft = {
  hourlyRate: string;
  minimumHours: string;
  maximumHours: string;
  roundingMinutes: string;
  areaM2PerHour: string;
  vatRate: string;
  weekly: string;
  biweekly: string;
  monthly: string;
};

const FREQ = ['weekly', 'biweekly', 'monthly'] as const;

function PricingSection({ settings, onSaved }: { settings: PlatformSettings; onSaved: (s: PlatformSettings) => void }) {
  const t = useMessages(settingsMessages);
  const f = useFormat();
  const comma = f.locale !== 'en';
  const saved = settings.pricing;
  const toDraft = (): PricingDraft => ({
    hourlyRate: centsToInput(saved.hourlyRateCents),
    minimumHours: numInput(saved.minimumMinutes / 60, comma),
    maximumHours: numInput(saved.maximumMinutes / 60, comma),
    roundingMinutes: String(saved.roundingMinutes),
    areaM2PerHour: numInput(saved.areaM2PerHour, comma),
    vatRate: numInput((saved.vatRate ?? DEFAULT_VAT) * 100, comma),
    weekly: numInput(saved.frequencyDiscount.weekly * 100, comma),
    biweekly: numInput(saved.frequencyDiscount.biweekly * 100, comma),
    monthly: numInput(saved.frequencyDiscount.monthly * 100, comma),
  });
  const { draft, setDraft, errors, setErrors, formError, setFormError, discard } = useDraft(saved, toDraft);
  const { save, saving } = useSaveSection('pricing', onSaved, t.pricing.title);

  const build = useMemo(() => {
    const v = createValidator(t, f);
    const hourlyRateCents = v.cents('hourlyRateCents', draft.hourlyRate, 500, 20000);
    const minH = v.num('minimumMinutes', draft.minimumHours, 0.5, 12);
    const maxH = v.num('maximumMinutes', draft.maximumHours, 1, 12);
    const areaM2PerHour = v.num('areaM2PerHour', draft.areaM2PerHour, 5, 200);
    const vatPct = v.num('vatRate', draft.vatRate, 0, 30, { unit: '%' });
    const discounts = FREQ.map((k) => v.num(`frequencyDiscount.${k}`, draft[k], 0, 50, { unit: '%' }));
    const roundingMinutes = asStep(draft.roundingMinutes);
    const minimumMinutes = minH === undefined ? undefined : Math.round(minH * 60);
    const maximumMinutes = maxH === undefined ? undefined : Math.round(maxH * 60);
    let formError: string | null = null;
    if (minimumMinutes !== undefined && maximumMinutes !== undefined) {
      if (minimumMinutes >= maximumMinutes) formError = t.pricing.errMinMax;
      else if (minimumMinutes % roundingMinutes !== 0 || maximumMinutes % roundingMinutes !== 0) {
        formError = t.pricing.errSteps(roundingMinutes);
      }
    }
    if (
      Object.keys(v.errors).length > 0 ||
      formError ||
      hourlyRateCents === undefined ||
      minimumMinutes === undefined ||
      maximumMinutes === undefined ||
      areaM2PerHour === undefined ||
      vatPct === undefined ||
      discounts.some((d) => d === undefined)
    ) {
      return { errors: v.errors, formError, value: null };
    }
    const [weekly, biweekly, monthly] = discounts.map((d) => Math.round((d as number) * 10) / 1000);
    const value: SaveValue['pricing'] = {
      hourlyRateCents,
      minimumMinutes,
      maximumMinutes,
      roundingMinutes,
      areaM2PerHour,
      // 19 → 0.19, 7,5 → 0.075 (avoid floating point noise)
      vatRate: Math.round(vatPct * 100) / 10000,
      frequencyDiscount: { weekly, biweekly, monthly },
    };
    return { errors: v.errors, formError, value };
  }, [draft, t, f]);

  // Same key order as build.value so the comparison is stable
  const savedValue: SaveValue['pricing'] = {
    hourlyRateCents: saved.hourlyRateCents,
    minimumMinutes: saved.minimumMinutes,
    maximumMinutes: saved.maximumMinutes,
    roundingMinutes: saved.roundingMinutes,
    areaM2PerHour: saved.areaM2PerHour,
    vatRate: saved.vatRate ?? DEFAULT_VAT,
    frequencyDiscount: {
      weekly: saved.frequencyDiscount.weekly,
      biweekly: saved.frequencyDiscount.biweekly,
      monthly: saved.frequencyDiscount.monthly,
    },
  };
  const dirty = !build.value || JSON.stringify(build.value) !== JSON.stringify(savedValue);

  const submit = async () => {
    if (!build.value) {
      setErrors(build.errors);
      setFormError(build.formError ?? t.fixErrors);
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      await save(build.value);
    } catch (err) {
      if (err instanceof SectionError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      }
    }
  };

  // Live example uses the draft where valid, the saved values otherwise
  const preview = build.value ?? saved;
  const set = (key: keyof PricingDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  return (
    <SectionForm
      id="preise"
      title={t.pricing.title}
      description={t.pricing.description}
      dirty={dirty}
      saving={saving}
      formError={formError}
      onSubmit={submit}
      onDiscard={discard}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t.pricing.hourlyRate} hint={t.pricing.hourlyRateHint} error={errors.hourlyRateCents}>
          {(p) => <Input {...p} inputMode="decimal" value={draft.hourlyRate} onChange={set('hourlyRate')} disabled={saving} />}
        </Field>
        <Field label={t.pricing.minimumHours} hint={t.pricing.hoursHint} error={errors.minimumMinutes}>
          {(p) => <Input {...p} inputMode="decimal" value={draft.minimumHours} onChange={set('minimumHours')} disabled={saving} />}
        </Field>
        <Field label={t.pricing.maximumHours} hint={t.pricing.hoursHint} error={errors.maximumMinutes}>
          {(p) => <Input {...p} inputMode="decimal" value={draft.maximumHours} onChange={set('maximumHours')} disabled={saving} />}
        </Field>
        <Field label={t.pricing.rounding} hint={t.pricing.roundingHint} error={errors.roundingMinutes}>
          {(p) => (
            <NativeSelect {...p} value={draft.roundingMinutes} onChange={set('roundingMinutes')} disabled={saving}>
              {STEPS.map((n) => (
                <option key={n} value={n}>
                  {t.pricing.roundingOption(n)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label={t.pricing.areaPerHour} hint={t.pricing.areaPerHourHint} error={errors.areaM2PerHour}>
          {(p) => <Input {...p} inputMode="decimal" value={draft.areaM2PerHour} onChange={set('areaM2PerHour')} disabled={saving} />}
        </Field>
        <Field label={t.pricing.vatRate} hint={t.pricing.vatRateHint} error={errors.vatRate}>
          {(p) => <Input {...p} inputMode="decimal" value={draft.vatRate} onChange={set('vatRate')} disabled={saving} />}
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium leading-none">{t.pricing.discounts}</legend>
        <p className="text-xs text-muted-grey">{t.pricing.discountsHint}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {FREQ.map((k) => (
            <Field key={k} label={t.pricing[k]} error={errors[`frequencyDiscount.${k}`]}>
              {(p) => <Input {...p} inputMode="decimal" value={draft[k]} onChange={set(k)} disabled={saving} />}
            </Field>
          ))}
        </div>
      </fieldset>

      <PriceExample pricing={preview} />
    </SectionForm>
  );
}

function PriceExample({ pricing }: { pricing: PlatformSettings['pricing'] }) {
  const t = useMessages(settingsMessages);
  const f = useFormat();
  const step = pricing.roundingMinutes;
  const area = 60;
  // Condition "normal" has the factor 1 (server/src/config/pricing.js)
  const recommended = Math.min(
    pricing.maximumMinutes,
    Math.max(pricing.minimumMinutes, Math.ceil(((area / pricing.areaM2PerHour) * 60) / step) * step)
  );
  const priceOf = (minutes: number) => Math.round((minutes / 60) * pricing.hourlyRateCents);
  const discounted = FREQ.filter((k) => pricing.frequencyDiscount[k] > 0);

  return (
    <div className="rounded-xl border border-sage bg-mint/40 p-4" aria-live="polite">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-pine-dark">
        <Calculator className="h-4 w-4 text-pine" aria-hidden="true" />
        {t.pricing.exampleTitle}
      </h3>
      <p className="mt-1 text-base font-semibold text-charcoal">
        {t.pricing.example(area, f.hours(recommended), f.euro(priceOf(recommended)))}
      </p>
      <p className="text-xs text-muted-grey">{t.pricing.exampleNote}</p>

      <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <caption className="sr-only">{t.pricing.tableCaption}</caption>
          <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">{t.pricing.colHours}</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">{t.pricing.colOneTime}</th>
              {discounted.map((k) => (
                <th key={k} scope="col" className="px-3 py-2 text-right font-semibold">
                  {t.pricing.colDiscounted(t.pricing[k], f.number(pricing.frequencyDiscount[k] * 100, { maximumFractionDigits: 1 }))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[2, 3, 4, 6, 8].map((h) => {
              const minutes = h * 60;
              const outside = minutes < pricing.minimumMinutes || minutes > pricing.maximumMinutes;
              const price = priceOf(minutes);
              return (
                <tr key={h} className={cn('border-b border-border last:border-0', outside && 'text-muted-grey')}>
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {f.hours(minutes)}
                    {outside && <span className="ml-2 text-xs font-normal">({t.pricing.outsideRange})</span>}
                  </th>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{f.euro(price)}</td>
                  {discounted.map((k) => (
                    <td key={k} className="px-3 py-2 text-right tabular-nums">
                      {f.euro(price - Math.round(price * pricing.frequencyDiscount[k]))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zusatzleistungen
// ---------------------------------------------------------------------------

type ExtraDraft = { id: string; active: boolean; minutes: string; price: string };

function ExtrasSection({ settings, onSaved }: { settings: PlatformSettings; onSaved: (s: PlatformSettings) => void }) {
  const t = useMessages(settingsMessages);
  const f = useFormat();
  const cat = useMessages(catalogue);
  const saved = settings.extras;
  const savedValue = saved.map(({ id, minutes, priceCents, active }) => ({ id, minutes, priceCents, active }));
  const toDraft = (): ExtraDraft[] =>
    saved.map((e) => ({ id: e.id, active: e.active, minutes: String(e.minutes), price: centsToInput(e.priceCents) }));
  const { draft, setDraft, errors, setErrors, formError, setFormError, discard } = useDraft(savedValue, toDraft);
  const { save, saving } = useSaveSection('extras', onSaved, t.extras.title);

  const build = useMemo(() => {
    const v = createValidator(t, f);
    const value = draft.map((e, i) => ({
      id: e.id,
      minutes: v.num(`${i}.minutes`, e.minutes, 0, 480, { integer: true }),
      priceCents: v.cents(`${i}.priceCents`, e.price, 0, 100000),
      active: e.active,
    }));
    if (Object.keys(v.errors).length > 0) return { errors: v.errors, value: null };
    return { errors: v.errors, value: value as SaveValue['extras'] };
  }, [draft, t, f]);

  const dirty = !build.value || JSON.stringify(build.value) !== JSON.stringify(savedValue);
  const labelOf = (id: string) => {
    const e = saved.find((x) => x.id === id);
    return cat.extras[id as ExtraId]?.label ?? (f.locale === 'de' ? e?.label : e?.labelEn) ?? id;
  };
  const update = (index: number, patch: Partial<ExtraDraft>) =>
    setDraft((d) => d.map((e, i) => (i === index ? { ...e, ...patch } : e)));

  const submit = async () => {
    if (!build.value) {
      setErrors(build.errors);
      setFormError(t.fixErrors);
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      await save(build.value);
    } catch (err) {
      if (err instanceof SectionError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      }
    }
  };

  return (
    <SectionForm
      id="zusatzleistungen"
      title={t.extras.title}
      description={t.extras.description}
      dirty={dirty}
      saving={saving}
      formError={formError}
      onSubmit={submit}
      onDiscard={discard}
    >
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">{t.extras.caption}</caption>
          <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">{t.extras.colActive}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t.extras.colExtra}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t.extras.colMinutes}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t.extras.colPrice}</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((e, i) => {
              const label = labelOf(e.id);
              const defaultMinutes = saved.find((x) => x.id === e.id)?.defaultMinutes;
              const minutesError = errors[`${i}.minutes`];
              const priceError = errors[`${i}.priceCents`];
              return (
                <tr key={e.id} className={cn('border-b border-border align-top last:border-0', !e.active && 'bg-gray-50')}>
                  <td className="px-3 py-2.5">
                    <Switch
                      checked={e.active}
                      onCheckedChange={(checked) => update(i, { active: checked })}
                      aria-label={t.extras.activeLabel(label)}
                      disabled={saving}
                    />
                  </td>
                  <th scope="row" className={cn('px-3 py-2.5 text-left font-medium', e.active ? 'text-charcoal' : 'text-muted-grey')}>
                    {label}
                  </th>
                  <td className="px-3 py-2">
                    <Input
                      className="h-9 w-28"
                      inputMode="numeric"
                      value={e.minutes}
                      onChange={(ev) => update(i, { minutes: ev.target.value })}
                      aria-label={t.extras.minutesLabel(label)}
                      aria-invalid={minutesError ? true : undefined}
                      disabled={saving}
                    />
                    {defaultMinutes != null && (
                      <p className="mt-1 text-xs text-muted-grey">{t.extras.defaultMinutes(defaultMinutes)}</p>
                    )}
                    {minutesError && <p className="mt-1 text-xs font-medium text-red-700">{minutesError}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      className="h-9 w-28"
                      inputMode="decimal"
                      value={e.price}
                      onChange={(ev) => update(i, { price: ev.target.value })}
                      aria-label={t.extras.priceLabel(label)}
                      aria-invalid={priceError ? true : undefined}
                      disabled={saving}
                    />
                    {priceError && <p className="mt-1 text-xs font-medium text-red-700">{priceError}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionForm>
  );
}

// ---------------------------------------------------------------------------
// Buchungsregeln
// ---------------------------------------------------------------------------

type BookingDraft = { startStepMinutes: string; maxBookingDaysAhead: string; cancellationCutoffHours: string; teamBufferMinutes: string };

function BookingSection({ settings, onSaved }: { settings: PlatformSettings; onSaved: (s: PlatformSettings) => void }) {
  const t = useMessages(settingsMessages);
  const f = useFormat();
  const saved = settings.booking;
  const toDraft = (): BookingDraft => ({
    startStepMinutes: String(saved.startStepMinutes),
    maxBookingDaysAhead: String(saved.maxBookingDaysAhead),
    cancellationCutoffHours: String(saved.cancellationCutoffHours),
    teamBufferMinutes: String(saved.teamBufferMinutes),
  });
  const { draft, setDraft, errors, setErrors, formError, setFormError, discard } = useDraft(saved, toDraft);
  const { save, saving } = useSaveSection('booking', onSaved, t.booking.title);

  const build = useMemo(() => {
    const v = createValidator(t, f);
    const maxBookingDaysAhead = v.num('maxBookingDaysAhead', draft.maxBookingDaysAhead, 7, 365, { integer: true });
    const cancellationCutoffHours = v.num('cancellationCutoffHours', draft.cancellationCutoffHours, 0, 168, { integer: true });
    const teamBufferMinutes = v.num('teamBufferMinutes', draft.teamBufferMinutes, 0, 120, { integer: true });
    if (maxBookingDaysAhead === undefined || cancellationCutoffHours === undefined || teamBufferMinutes === undefined) {
      return { errors: v.errors, value: null };
    }
    const value: SaveValue['booking'] = {
      startStepMinutes: asStep(draft.startStepMinutes),
      maxBookingDaysAhead,
      cancellationCutoffHours,
      teamBufferMinutes,
    };
    return { errors: v.errors, value };
  }, [draft, t, f]);

  const dirty = !build.value || JSON.stringify(build.value) !== JSON.stringify(saved);
  const set = (key: keyof BookingDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  const submit = async () => {
    if (!build.value) {
      setErrors(build.errors);
      setFormError(t.fixErrors);
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      await save(build.value);
    } catch (err) {
      if (err instanceof SectionError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      }
    }
  };

  return (
    <SectionForm
      id="buchungsregeln"
      title={t.booking.title}
      description={t.booking.description}
      dirty={dirty}
      saving={saving}
      formError={formError}
      onSubmit={submit}
      onDiscard={discard}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.booking.startStep} hint={t.booking.startStepHint} error={errors.startStepMinutes}>
          {(p) => (
            <NativeSelect {...p} value={draft.startStepMinutes} onChange={set('startStepMinutes')} disabled={saving}>
              {STEPS.map((n) => (
                <option key={n} value={n}>
                  {t.booking.startStepOption(n)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label={t.booking.maxDaysAhead} hint={t.booking.maxDaysAheadHint} error={errors.maxBookingDaysAhead}>
          {(p) => <Input {...p} inputMode="numeric" value={draft.maxBookingDaysAhead} onChange={set('maxBookingDaysAhead')} disabled={saving} />}
        </Field>
        <Field label={t.booking.cancellationCutoff} hint={t.booking.cancellationCutoffHint} error={errors.cancellationCutoffHours}>
          {(p) => (
            <Input {...p} inputMode="numeric" value={draft.cancellationCutoffHours} onChange={set('cancellationCutoffHours')} disabled={saving} />
          )}
        </Field>
        <Field label={t.booking.teamBuffer} hint={t.booking.teamBufferHint} error={errors.teamBufferMinutes}>
          {(p) => <Input {...p} inputMode="numeric" value={draft.teamBufferMinutes} onChange={set('teamBufferMinutes')} disabled={saving} />}
        </Field>
      </div>
    </SectionForm>
  );
}

// ---------------------------------------------------------------------------
// Zahlungsarten
// ---------------------------------------------------------------------------

type PaymentsDraft = SaveValue['payments'];

function PaymentsSection({ settings, onSaved }: { settings: PlatformSettings; onSaved: (s: PlatformSettings) => void }) {
  const t = useMessages(settingsMessages);
  const p = settings.payments;
  const savedValue: PaymentsDraft = { cashEnabled: p.cashEnabled, paypalEnabled: p.paypalEnabled, stripeEnabled: p.stripeEnabled };
  const { draft, setDraft, formError, setFormError, discard } = useDraft(savedValue, () => ({ ...savedValue }));
  const { save, saving } = useSaveSection('payments', onSaved, t.payments.title);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedValue);

  const submit = async () => {
    setFormError(null);
    try {
      await save(draft);
    } catch (err) {
      if (err instanceof SectionError) setFormError(err.message);
    }
  };

  const rows: { key: keyof PaymentsDraft; label: string; hint: string; configured: boolean }[] = [
    { key: 'cashEnabled', label: t.payments.cash, hint: t.payments.cashHint, configured: true },
    { key: 'paypalEnabled', label: t.payments.paypal, hint: t.payments.paypalHint, configured: p.paypalConfigured },
    { key: 'stripeEnabled', label: t.payments.stripe, hint: t.payments.stripeHint, configured: p.stripeConfigured },
  ];
  const effective = rows.some((r) => draft[r.key] && r.configured);

  return (
    <SectionForm
      id="zahlungsarten"
      title={t.payments.title}
      description={t.payments.description}
      dirty={dirty}
      saving={saving}
      formError={formError}
      onSubmit={submit}
      onDiscard={discard}
    >
      <ul className="divide-y divide-border rounded-xl border border-border">
        {rows.map((row) => (
          <PaymentRow
            key={row.key}
            label={row.label}
            hint={row.hint}
            configured={row.configured}
            checked={draft[row.key]}
            disabled={saving}
            onChange={(checked) => setDraft((d) => ({ ...d, [row.key]: checked }))}
          />
        ))}
      </ul>
      {!effective && (
        <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t.payments.noneEnabled}
        </p>
      )}
    </SectionForm>
  );
}

function PaymentRow({
  label,
  hint,
  configured,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  configured: boolean;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useMessages(settingsMessages);
  const id = useId();
  return (
    <li className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer text-sm font-semibold text-charcoal">
          {label}
        </Label>
        <p id={`${id}-hint`} className="mt-0.5 text-xs text-muted-grey">
          {hint}
          {!configured && ` ${t.payments.keyMissingHint}`}
        </p>
        {!configured && (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {t.payments.keyMissing}
          </span>
        )}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} aria-describedby={`${id}-hint`} />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Gutscheine
// ---------------------------------------------------------------------------

type GiftCardsDraft = { enabled: boolean; presets: string; minCustom: string; maxCustom: string; validityYears: string; maxPerBooking: string };

const GIFT_DEFAULTS: SaveValue['giftCards'] = {
  enabled: true,
  presetAmountsCents: [2500, 5000, 10000, 15000],
  minCustomCents: 1000,
  maxCustomCents: 50000,
  validityYears: 3,
  maxPerBooking: 2,
};

function GiftCardsSection({ settings, onSaved }: { settings: PlatformSettings; onSaved: (s: PlatformSettings) => void }) {
  const t = useMessages(settingsMessages);
  const f = useFormat();
  const g = settings.giftCards ?? GIFT_DEFAULTS;
  const savedValue: SaveValue['giftCards'] = {
    enabled: g.enabled,
    presetAmountsCents: g.presetAmountsCents,
    minCustomCents: g.minCustomCents,
    maxCustomCents: g.maxCustomCents,
    validityYears: g.validityYears,
    maxPerBooking: g.maxPerBooking,
  };
  const toDraft = (): GiftCardsDraft => ({
    enabled: g.enabled,
    // Whole euros without decimals, cents with
    presets: g.presetAmountsCents.map((c) => (c % 100 === 0 ? String(c / 100) : centsToInput(c))).join(' '),
    minCustom: centsToInput(g.minCustomCents),
    maxCustom: centsToInput(g.maxCustomCents),
    validityYears: String(g.validityYears),
    maxPerBooking: String(g.maxPerBooking),
  });
  const { draft, setDraft, errors, setErrors, formError, setFormError, discard } = useDraft(savedValue, toDraft);
  const { save, saving } = useSaveSection('giftCards', onSaved, t.giftCards.title);

  const build = useMemo(() => {
    const v = createValidator(t, f);
    // Split on whitespace or ";" – and on "," only when followed by a space or used without decimals
    const parts = draft.presets
      .split(/[\s;]+|,(?=\s)|,(?!\d{1,2}(?:\D|$))/)
      .map((x) => x.trim())
      .filter(Boolean);
    const presets = parts.map((x) => parseEuroToCents(x));
    if (presets.length < 1 || presets.length > 8 || presets.some((c) => c === null || c < 500 || c > 200000)) {
      v.errors.presetAmountsCents = t.giftCards.presetsInvalid;
    }
    const minCustomCents = v.cents('minCustomCents', draft.minCustom, 500, 200000);
    const maxCustomCents = v.cents('maxCustomCents', draft.maxCustom, 500, 200000);
    const validityYears = v.num('validityYears', draft.validityYears, 1, 10, { integer: true });
    const maxPerBooking = v.num('maxPerBooking', draft.maxPerBooking, 1, 5, { integer: true });
    let formError: string | null = null;
    if (minCustomCents !== undefined && maxCustomCents !== undefined && minCustomCents > maxCustomCents) {
      formError = t.giftCards.errMinMax;
    }
    if (
      Object.keys(v.errors).length > 0 ||
      formError ||
      minCustomCents === undefined ||
      maxCustomCents === undefined ||
      validityYears === undefined ||
      maxPerBooking === undefined
    ) {
      return { errors: v.errors, formError, value: null };
    }
    const value: SaveValue['giftCards'] = {
      enabled: draft.enabled,
      presetAmountsCents: Array.from(new Set(presets as number[])).sort((a, b) => a - b),
      minCustomCents,
      maxCustomCents,
      validityYears,
      maxPerBooking,
    };
    return { errors: v.errors, formError, value };
  }, [draft, t, f]);

  const dirty = !build.value || JSON.stringify(build.value) !== JSON.stringify(savedValue);
  const set = (key: Exclude<keyof GiftCardsDraft, 'enabled'>) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  const submit = async () => {
    if (!build.value) {
      setErrors(build.errors);
      setFormError(build.formError ?? t.fixErrors);
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      await save(build.value);
    } catch (err) {
      if (err instanceof SectionError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      }
    }
  };

  return (
    <SectionForm
      id="gutscheine"
      title={t.giftCards.title}
      description={t.giftCards.description}
      dirty={dirty}
      saving={saving}
      formError={formError}
      onSubmit={submit}
      onDiscard={discard}
    >
      <ul className="rounded-xl border border-border">
        <PaymentRow
          label={t.giftCards.enabled}
          hint={t.giftCards.enabledHint}
          configured
          checked={draft.enabled}
          disabled={saving}
          onChange={(checked) => setDraft((d) => ({ ...d, enabled: checked }))}
        />
      </ul>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.giftCards.presets} hint={t.giftCards.presetsHint} error={errors.presetAmountsCents} className="sm:col-span-2">
          {(p) => <Input {...p} value={draft.presets} onChange={set('presets')} disabled={saving} />}
        </Field>
        <Field label={t.giftCards.minCustom} hint={t.giftCards.customHint} error={errors.minCustomCents}>
          {(p) => <Input {...p} inputMode="decimal" value={draft.minCustom} onChange={set('minCustom')} disabled={saving} />}
        </Field>
        <Field label={t.giftCards.maxCustom} hint={t.giftCards.customHint} error={errors.maxCustomCents}>
          {(p) => <Input {...p} inputMode="decimal" value={draft.maxCustom} onChange={set('maxCustom')} disabled={saving} />}
        </Field>
        <Field label={t.giftCards.validity} hint={t.giftCards.validityHint} error={errors.validityYears}>
          {(p) => <Input {...p} inputMode="numeric" value={draft.validityYears} onChange={set('validityYears')} disabled={saving} />}
        </Field>
        <Field label={t.giftCards.maxPerBooking} hint={t.giftCards.maxPerBookingHint} error={errors.maxPerBooking}>
          {(p) => <Input {...p} inputMode="numeric" value={draft.maxPerBooking} onChange={set('maxPerBooking')} disabled={saving} />}
        </Field>
      </div>
      {build.value && (
        <p className="text-xs text-muted-grey">{build.value.presetAmountsCents.map((c) => f.euro(c)).join(' · ')}</p>
      )}
    </SectionForm>
  );
}

// ---------------------------------------------------------------------------
// Reinigungskräfte-Vergütung
// ---------------------------------------------------------------------------

type WorkerPayDraft = { hourlyRate: string; payoutDelayDays: string };

function WorkerPaySection({ settings, onSaved }: { settings: PlatformSettings; onSaved: (s: PlatformSettings) => void }) {
  const t = useMessages(settingsMessages);
  const f = useFormat();
  const saved = settings.workerPay;
  const toDraft = (): WorkerPayDraft => ({
    hourlyRate: centsToInput(saved.hourlyRateCents),
    payoutDelayDays: String(saved.payoutDelayDays),
  });
  const { draft, setDraft, errors, setErrors, formError, setFormError, discard } = useDraft(saved, toDraft);
  const { save, saving } = useSaveSection('workerPay', onSaved, t.workerPay.title);

  const build = useMemo(() => {
    const v = createValidator(t, f);
    const hourlyRateCents = v.cents('hourlyRateCents', draft.hourlyRate, 0, 10000);
    const payoutDelayDays = v.num('payoutDelayDays', draft.payoutDelayDays, 0, 90, { integer: true });
    if (hourlyRateCents === undefined || payoutDelayDays === undefined) return { errors: v.errors, value: null };
    return { errors: v.errors, value: { hourlyRateCents, payoutDelayDays } as SaveValue['workerPay'] };
  }, [draft, t, f]);

  const dirty = !build.value || JSON.stringify(build.value) !== JSON.stringify(saved);
  const set = (key: keyof WorkerPayDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  const submit = async () => {
    if (!build.value) {
      setErrors(build.errors);
      setFormError(t.fixErrors);
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      await save(build.value);
    } catch (err) {
      if (err instanceof SectionError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      }
    }
  };

  return (
    <SectionForm
      id="verguetung"
      title={t.workerPay.title}
      description={t.workerPay.description}
      dirty={dirty}
      saving={saving}
      formError={formError}
      onSubmit={submit}
      onDiscard={discard}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.workerPay.hourlyRate} hint={t.workerPay.hourlyRateHint} error={errors.hourlyRateCents}>
          {(p) => <Input {...p} inputMode="decimal" value={draft.hourlyRate} onChange={set('hourlyRate')} disabled={saving} />}
        </Field>
        <Field label={t.workerPay.payoutDelay} hint={t.workerPay.payoutDelayHint} error={errors.payoutDelayDays}>
          {(p) => <Input {...p} inputMode="numeric" value={draft.payoutDelayDays} onChange={set('payoutDelayDays')} disabled={saving} />}
        </Field>
      </div>
    </SectionForm>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminSettingsPage() {
  const t = useMessages(settingsMessages);
  const { data, error, reload, setData } = useApi<{ settings: PlatformSettings }>('/admin/settings');
  const onSaved = (settings: PlatformSettings) => setData({ settings });

  const sections: [string, string][] = [
    ['preise', t.pricing.title],
    ['zusatzleistungen', t.extras.title],
    ['buchungsregeln', t.booking.title],
    ['zahlungsarten', t.payments.title],
    ['gutscheine', t.giftCards.title],
    ['verguetung', t.workerPay.title],
  ];

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <DetailSkeleton />
      ) : (
        <div className="space-y-6">
          <nav aria-label={t.jumpTo} className="flex flex-wrap gap-2">
            {sections.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="rounded-full border border-border bg-white px-3 py-1 text-sm font-medium text-pine hover:bg-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {label}
              </a>
            ))}
          </nav>
          <PricingSection settings={data.settings} onSaved={onSaved} />
          <ExtrasSection settings={data.settings} onSaved={onSaved} />
          <BookingSection settings={data.settings} onSaved={onSaved} />
          <PaymentsSection settings={data.settings} onSaved={onSaved} />
          <GiftCardsSection settings={data.settings} onSaved={onSaved} />
          <WorkerPaySection settings={data.settings} onSaved={onSaved} />
        </div>
      )}
    </>
  );
}
