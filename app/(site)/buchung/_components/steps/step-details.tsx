'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Minus, PawPrint, Plus, Sparkles, TriangleAlert } from 'lucide-react';

import { Input } from '@/componets/ui/input';
import { useFormat, useMessages } from '@/lib/i18n/client';
import catalogue from '@/lib/i18n/messages/catalogue';
import common from '@/lib/i18n/messages/common';
import type { AvailableDay, Condition, Estimate, Extra, Frequency, PublicPricing, Service, Slot } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatPercent } from '../../../_shared/use-pricing';
import messages from '../../_messages';
import flowMessages from '../../_flow-messages';
import { ChoiceCard } from '../choice-card';
import { ErrorBox, FieldError, FormField, inputClass } from '../form-field';
import { IncludedDialog } from '../included-dialog';
import { DateCard } from './date-card';
import { SectionCard, StepHeader } from './step-header';
import { extraIcon } from '../../_lib/extra-icons';
import type { Preview } from '../../_lib/preview';
import { AREA_DEFAULT, AREA_MAX, AREA_MIN, type HouseholdServiceId } from '../../_lib/wizard';

const CONDITIONS: Condition[] = ['basic', 'normal', 'moderate', 'heavy'];

export function Loading({ label }: { label: string }) {
  return (
    <p className="m-0 flex items-center gap-2 text-sm text-muted-grey" role="status">
      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {label}
    </p>
  );
}

/** Everything the hours card needs (computed by the wizard) */
export interface DurationState {
  /** Effective booked duration (manual value or the recommendation) */
  value: number | null;
  recommended: number | null;
  min: number;
  max: number;
  step: number;
  touched: boolean;
  /** Estimate to display: server value when current, else the client preview */
  estimate: Estimate | null;
  /** Client preview (for the "why" breakdown) */
  preview: Preview | null;
  error: string | null;
  onRetry: () => void;
}

export interface DetailsProps {
  headingRef: React.Ref<HTMLHeadingElement>;
  errors: Record<string, string>;
  serviceId: HouseholdServiceId;
  service: Service | null;
  serviceLoading: boolean;
  serviceError: string | null;
  onRetryService: () => void;
  pricing: PublicPricing | null;
  // frequency
  frequency: Frequency;
  onFrequencyChange: (f: Frequency) => void;
  // property
  areaM2: number | null;
  onAreaChange: (area: number | null) => void;
  bathrooms: number;
  onBathroomsChange: (n: number) => void;
  condition: Condition;
  onConditionChange: (c: Condition) => void;
  // pets
  pets: boolean | null;
  onPetsChange: (pets: boolean) => void;
  // duration
  duration: DurationState;
  onDurationChange: (minutes: number) => void;
  onDurationReset: () => void;
  // extras
  extras: Extra[] | null;
  extrasLoading: boolean;
  extrasError: string | null;
  onRetryExtras: () => void;
  selectedExtras: string[];
  onToggleExtra: (id: string, checked: boolean) => void;
  // date & start time
  /** Duration the shown days/times were requested for (null = not known yet) */
  availabilityDuration: number | null;
  days: AvailableDay[] | null;
  daysLoading: boolean;
  daysError: string | null;
  onRetryDays: () => void;
  date: string;
  onDateChange: (date: string) => void;
  startTime: string;
  onTimeChange: (slot: Slot) => void;
  slots: Slot[] | null;
  slotsLoading: boolean;
  slotsError: string | null;
  onRetrySlots: () => void;
  /** Shown when a chosen day/time was cleared because it no longer fits */
  timeNote: string | null;
}

export function StepDetails(props: DetailsProps) {
  const t = useMessages(messages).details;
  return (
    <div className="grid gap-5">
      <StepHeader ref={props.headingRef} title={t.title} lead={t.lead} />
      <PropertyCard {...props} />
      <DurationCard {...props} />
      <ExtrasCard {...props} />
      <FrequencyCard {...props} />
      <PetsCard {...props} />
      <DateCard {...props} />
    </div>
  );
}

/* a) Property ------------------------------------------------------------- */
function PropertyCard({ errors, areaM2, onAreaChange, bathrooms, onBathroomsChange, condition, onConditionChange }: DetailsProps) {
  const t = useMessages(messages).details;
  const tc = useMessages(common);
  const [text, setText] = useState(areaM2 == null ? '' : String(areaM2));

  // Keep the text field in sync when the slider (or a restored draft) changes the value
  useEffect(() => {
    setText((current) => (Number(current) === areaM2 && current !== '' ? current : areaM2 == null ? current : String(areaM2)));
  }, [areaM2]);

  const sliderValue = Math.min(AREA_MAX, Math.max(AREA_MIN, areaM2 ?? AREA_DEFAULT));

  return (
    <SectionCard id="card-property" title={t.propertyTitle}>
      <div className="grid gap-4 sm:grid-cols-[180px_1fr] sm:items-end">
        <FormField id="area" label={t.areaLabel} error={errors.areaM2} hint={t.areaHint(AREA_MIN, AREA_MAX)}>
          {(p) => (
            <div className="relative">
              <Input
                {...p}
                type="number"
                inputMode="numeric"
                min={AREA_MIN}
                max={AREA_MAX}
                step={1}
                value={text}
                onChange={(e) => {
                  const value = e.target.value;
                  setText(value);
                  const n = Number(value);
                  onAreaChange(value === '' || !Number.isFinite(n) ? null : n);
                }}
                className={`${inputClass} pr-12`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-grey" aria-hidden="true">
                m²
              </span>
            </div>
          )}
        </FormField>
        <div className="pb-7 sm:pb-8">
          <input
            type="range"
            min={AREA_MIN}
            max={300}
            step={5}
            value={Math.min(300, sliderValue)}
            onChange={(e) => onAreaChange(Number(e.target.value))}
            aria-label={t.areaSlider}
            aria-valuetext={`${areaM2 ?? sliderValue} m²`}
            className="h-2 w-full cursor-pointer accent-[#174d3a]"
          />
          <div className="mt-1 flex justify-between text-[11px] text-muted-grey" aria-hidden="true">
            <span>{AREA_MIN} m²</span>
            <span>300+ m²</span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3" data-testid="bathrooms">
        <div>
          <p className="m-0 text-sm font-bold text-pine-dark">{t.bathroomsLabel}</p>
          <p className="m-0 text-xs text-muted-grey">{t.bathroomsHint}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={`${t.bathroomsLabel} −`}
            disabled={bathrooms <= 1}
            onClick={() => onBathroomsChange(Math.max(1, bathrooms - 1))}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-pine-dark disabled:opacity-40"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="w-6 text-center text-base font-bold tabular-nums text-pine-dark" aria-live="polite">
            {bathrooms}
          </span>
          <button
            type="button"
            aria-label={`${t.bathroomsLabel} +`}
            disabled={bathrooms >= 6}
            onClick={() => onBathroomsChange(Math.min(6, bathrooms + 1))}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-pine-dark disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <fieldset className="m-0 mt-5 min-w-0 border-0 p-0">
        <legend className="mb-3 p-0 text-sm font-bold text-pine-dark">{t.conditionLegend}</legend>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {CONDITIONS.map((c) => (
            <ChoiceCard key={c} type="radio" name="condition" value={c} checked={condition === c} onChange={() => onConditionChange(c)}>
              <span className="pr-7 text-[15px] font-bold text-pine-dark">{tc.conditions[c].label}</span>
              <span className="mt-1 text-xs leading-relaxed text-muted-grey">{tc.conditions[c].hint}</span>
            </ChoiceCard>
          ))}
        </div>
      </fieldset>
    </SectionCard>
  );
}

/* b) Hours: recommendation, stepper, quick chips, live price -------------- */
function DurationCard({ errors, duration, pricing, onDurationChange, onDurationReset, areaM2, condition, selectedExtras }: DetailsProps) {
  const t = useMessages(flowMessages).hours;
  const tm = useMessages(messages);
  const tc = useMessages(common);
  const f = useFormat();
  const { value, recommended, min, max, step, touched, estimate, preview } = duration;
  const ready = value != null;
  const rate = estimate?.hourlyRateCents ?? pricing?.hourlyRateCents ?? null;
  const labour = estimate && estimate.durationMinutes === value ? estimate.labourCents : value != null && rate != null ? Math.round((value / 60) * rate) : null;

  // Recommendation changed (extras, area …) after the customer set the hours → offer to adopt it
  const previousRecommendation = useRef(recommended);
  const [changedNotice, setChangedNotice] = useState(false);
  useEffect(() => {
    const before = previousRecommendation.current;
    previousRecommendation.current = recommended;
    if (before != null && recommended != null && before !== recommended && touched) setChangedNotice(true);
    if (!touched || recommended === value) setChangedNotice(false);
  }, [recommended, touched, value]);

  const set = (minutes: number) => onDurationChange(Math.min(max, Math.max(min, minutes)));

  const stepButton =
    'grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-pine bg-white text-pine transition-colors hover:bg-mint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine disabled:cursor-not-allowed disabled:border-border disabled:text-muted-grey disabled:hover:bg-white';

  const plusOne = recommended != null ? Math.min(max, recommended + 60) : null;
  const chips: { key: 'recommended' | 'plus' | 'max'; label: string; minutes: number | null }[] = [
    { key: 'recommended', label: recommended != null ? `${t.chipRecommended} · ${f.hours(recommended)}` : t.chipRecommended, minutes: recommended },
    // "+1 Std." is hidden when it would equal the full day
    ...(plusOne != null && plusOne !== max && plusOne !== recommended ? [{ key: 'plus' as const, label: t.chipPlusOne, minutes: plusOne }] : []),
    ...(recommended !== max ? [{ key: 'max' as const, label: `${t.chipFullDay} · ${f.hours(max)}`, minutes: max }] : []),
  ];

  const below2 = touched && (estimate?.belowRecommendation ?? (value != null && recommended != null && value < recommended));

  return (
    <SectionCard id="card-duration" title={t.title} className="border-pine/40 ring-1 ring-pine/10">
      <p className="-mt-2 mb-5 text-sm leading-relaxed text-muted-grey">{t.lead}</p>

      {/* Recommendation */}
      {recommended != null && areaM2 != null ? (
        <div className="mb-5 rounded-[14px] bg-mint p-4">
          <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[15px] text-pine-dark">
            <Sparkles className="h-4 w-4 shrink-0 self-center text-pine" aria-hidden="true" />
            <span>{t.recommendedFor(areaM2)}</span>
            <strong className="text-lg">{f.hours(recommended)}</strong>
          </p>
          {preview && (
            <div className="mt-2 text-xs text-pine-dark/80">
              <p className="sr-only">{t.whyTitle}</p>
              <ul className="m-0 grid list-none gap-1 p-0">
                <li className="flex justify-between gap-3">
                  <span>{t.whyArea(areaM2, tc.conditions[condition].label)}</span>
                  <span className="tabular-nums">≈ {f.hours(preview.baseMinutes)}</span>
                </li>
                {selectedExtras.length > 0 && preview.extraMinutes > 0 && (
                  <li className="flex justify-between gap-3">
                    <span>{t.whyExtras(preview.extras.length)}</span>
                    <span className="tabular-nums">+ {tc.units.minutesShort(preview.extraMinutes)}</span>
                  </li>
                )}
                <li className="text-muted-grey">{t.whyRounded(step)}</li>
              </ul>
            </div>
          )}
        </div>
      ) : duration.error ? (
        <p className="mb-5 mt-0 text-sm text-red-800">
          {t.recommendError}{' '}
          <button type="button" onClick={duration.onRetry} className="font-bold underline">
            {tm.retry}
          </button>
        </p>
      ) : (
        <p className="mb-5 mt-0 text-sm text-muted-grey">{t.recommendHint}</p>
      )}

      {/* Stepper */}
      <div className="flex items-center justify-center gap-4 sm:gap-6">
        <button type="button" onClick={() => value != null && set(value - step)} disabled={!ready || value! <= min} aria-label={t.less(step)} className={stepButton}>
          <Minus className="h-6 w-6" aria-hidden="true" />
        </button>
        <p className="m-0 min-w-[140px] text-center" aria-live="polite" aria-atomic="true">
          <span className="sr-only">{t.valueSr} </span>
          <span className="block text-4xl font-bold tabular-nums tracking-tight text-pine-dark sm:text-5xl">{ready ? f.hours(value) : '–'}</span>
        </p>
        <button type="button" onClick={() => value != null && set(value + step)} disabled={!ready || value! >= max} aria-label={t.more(step)} className={stepButton}>
          <Plus className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>

      {/* Live price */}
      <p className="mb-0 mt-3 text-center text-sm text-charcoal" aria-live="polite">
        {ready && rate != null && labour != null ? (
          <>
            <span className="text-muted-grey">{t.priceLabel}: </span>
            <strong className="tabular-nums text-pine-dark">{t.priceLine(f.hours(value), f.euro(rate), f.euro(labour))}</strong>
          </>
        ) : rate != null ? (
          <span className="text-muted-grey">{t.perHour(f.euro(rate))}</span>
        ) : null}
      </p>

      {/* Quick chips */}
      <div role="group" aria-label={t.chipsLabel} className="mt-5 flex flex-wrap justify-center gap-2">
        {chips.map((chip) => {
          const active = chip.key === 'recommended' ? !touched && chip.minutes != null : touched && value === chip.minutes;
          return (
            <button
              key={chip.key}
              type="button"
              disabled={chip.minutes == null}
              aria-pressed={active}
              onClick={() => {
                if (chip.minutes == null) return;
                if (chip.key === 'recommended') onDurationReset();
                else set(chip.minutes);
              }}
              className={cn(
                'min-h-[44px] rounded-full border px-4 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine disabled:opacity-50',
                active ? 'border-pine bg-pine text-white' : 'border-border bg-white text-pine-dark hover:border-sage hover:bg-mint'
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <p className="mb-0 mt-4 text-center text-xs text-muted-grey">
        {touched ? t.manual : t.follows} {t.range(f.hours(min), f.hours(max), step)}
      </p>

      {/* Recommendation changed after a manual choice */}
      {changedNotice && recommended != null && !below2 && (
        <p className="mb-0 mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[12px] border border-sage bg-mint p-3 text-sm text-pine-dark" role="status">
          <Sparkles className="h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
          {t.changed(f.hours(recommended))}
          <button type="button" onClick={onDurationReset} className="min-h-[44px] font-bold text-pine underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pine">
            {t.adopt}
          </button>
        </p>
      )}

      {/* Gentle warning below the recommendation */}
      {below2 && recommended != null && (
        <div className="mt-4 flex gap-2 rounded-[12px] border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900" role="status">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="m-0 font-bold">{changedNotice ? t.changed(f.hours(recommended)) : t.belowTitle}</p>
            <p className="m-0">{t.below(f.hours(recommended))}</p>
            <button type="button" onClick={onDurationReset} className="mt-1 min-h-[44px] font-bold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-900">
              {t.adoptButton(f.hours(recommended))}
            </button>
          </div>
        </div>
      )}

      {errors.durationMinutes && (
        <div className="mt-2">
          <FieldError>{errors.durationMinutes}</FieldError>
        </div>
      )}
    </SectionCard>
  );
}

/* c) Extras: toggle cards with added time (and fee) ------------------------ */
function ExtrasCard({ errors, extras, extrasLoading, extrasError, onRetryExtras, selectedExtras, onToggleExtra }: DetailsProps) {
  const t = useMessages(messages).details;
  const tf = useMessages(flowMessages).extras;
  const tc = useMessages(common);
  const cat = useMessages(catalogue);
  const f = useFormat();
  const extraText = cat.extras as Record<string, { label: string; description: string } | undefined>;
  return (
    <SectionCard
      id="card-extras"
      title={t.extrasTitle}
      description={tf.description}
      action={selectedExtras.length > 0 ? <span className="text-sm font-bold text-pine">{t.extrasSelected(selectedExtras.length)}</span> : undefined}
    >
      {!extras && extrasLoading && <Loading label={t.extrasLoading} />}
      {!extras && extrasError && <ErrorBox message={extrasError} onRetry={onRetryExtras} />}
      {extras && extras.length === 0 && <p className="m-0 text-sm text-muted-grey">{t.extrasEmpty}</p>}
      {extras && extras.length > 0 && (
        <fieldset className="m-0 min-w-0 border-0 p-0" aria-describedby={errors.extras ? 'extras-error' : undefined}>
          <legend className="sr-only">{t.extrasLegend}</legend>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {extras.map((extra) => {
              const Icon = extraIcon(extra.icon);
              const checked = selectedExtras.includes(extra.id);
              const text = extraText[extra.id];
              return (
                <ChoiceCard key={extra.id} type="checkbox" name="extras" value={extra.id} checked={checked} onChange={(c) => onToggleExtra(extra.id, c)}>
                  <span className="flex items-start gap-3 pr-7">
                    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-pine', checked ? 'bg-white' : 'bg-cream')} aria-hidden="true">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="text-sm font-bold text-pine-dark">{text?.label ?? extra.label}</span>
                      <span className="text-xs leading-relaxed text-muted-grey">{text?.description ?? extra.description}</span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-pine ring-1 ring-sage">
                          {tf.minutes(tc.units.minutesShort(extra.minutes))}
                        </span>
                        {extra.priceCents > 0 && (
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-charcoal ring-1 ring-border">{tf.fee(f.euro(extra.priceCents))}</span>
                        )}
                      </span>
                    </span>
                  </span>
                </ChoiceCard>
              );
            })}
          </div>
        </fieldset>
      )}
      {errors.extras && (
        <div className="mt-2">
          <FieldError id="extras-error">{errors.extras}</FieldError>
        </div>
      )}
    </SectionCard>
  );
}

/* d) Frequency with discount badges --------------------------------------- */
function FrequencyCard({ errors, serviceId, service, serviceLoading, serviceError, onRetryService, pricing, frequency, onFrequencyChange }: DetailsProps) {
  const t = useMessages(messages).details;
  const tf = useMessages(flowMessages).frequency;
  const tc = useMessages(common);
  const f = useFormat();
  const allowed = service?.frequencies ?? null;
  return (
    <SectionCard
      id="card-frequency"
      title={t.frequencyTitle}
      action={<IncludedDialog service={service} loading={serviceLoading} error={serviceError} onRetry={onRetryService} />}
    >
      {!allowed && serviceLoading && <Loading label={t.loadingOptions} />}
      {!allowed && serviceError && <ErrorBox message={serviceError} onRetry={onRetryService} />}
      {allowed && (
        <fieldset className="m-0 min-w-0 border-0 p-0" aria-describedby={errors.frequency ? 'frequency-error' : undefined}>
          <legend className="sr-only">{t.frequencyLegend}</legend>
          <div className={cn('grid gap-3', allowed.length > 1 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:max-w-xs')}>
            {allowed.map((fq) => {
              const discount = pricing?.frequencyDiscount[fq] ?? 0;
              const popular = fq === 'weekly' && serviceId === 'home-cleaning';
              const pct = discount > 0 ? formatPercent(discount, f) : null;
              return (
                <ChoiceCard key={fq} type="radio" name="frequency" value={fq} checked={frequency === fq} onChange={() => onFrequencyChange(fq)}>
                  <span className="mb-2 flex min-h-[20px] flex-wrap gap-1.5 pr-7">
                    {pct && (
                      <span className="w-fit rounded-full bg-pine px-2 py-0.5 text-[11px] font-bold text-white">
                        <span aria-hidden="true">{tf.discount(pct)}</span>
                        <span className="sr-only">{tf.discountSr(pct)}</span>
                      </span>
                    )}
                    {popular && (
                      <span className="w-fit rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-pine-dark">{t.popular}</span>
                    )}
                  </span>
                  <span className="pr-7 text-[15px] font-bold text-pine-dark">{tc.frequencies[fq]}</span>
                  <span className="mt-1 text-xs leading-relaxed text-muted-grey">{t.frequencyHelp[fq]}</span>
                </ChoiceCard>
              );
            })}
          </div>
          {allowed.length === 1 && <p className="mb-0 mt-3 text-xs text-muted-grey">{t.oneTimeOnly}</p>}
        </fieldset>
      )}
      {errors.frequency && (
        <div className="mt-2">
          <FieldError id="frequency-error">{errors.frequency}</FieldError>
        </div>
      )}
    </SectionCard>
  );
}

/* e) Pets – used to match cleaners who are happy with animals ------------- */
function PetsCard({ errors, pets, onPetsChange }: DetailsProps) {
  const t = useMessages(messages).details;
  const options: { value: boolean; label: string; hint: string }[] = [
    { value: true, label: t.petsYes, hint: t.petsYesHint },
    { value: false, label: t.petsNo, hint: t.petsNoHint },
  ];
  return (
    <SectionCard id="card-pets" title={t.petsTitle}>
      <fieldset
        className="m-0 min-w-0 border-0 p-0"
        aria-describedby={errors.pets ? 'pets-hint pets-error' : 'pets-hint'}
        aria-invalid={errors.pets ? true : undefined}
      >
        <legend className="mb-1 p-0 text-sm font-bold text-pine-dark">{t.petsLegend}</legend>
        <p id="pets-hint" className="mb-3 mt-0 text-xs leading-relaxed text-muted-grey">
          {t.petsHint}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          {options.map((o) => (
            <ChoiceCard key={String(o.value)} type="radio" name="pets" value={String(o.value)} checked={pets === o.value} onChange={() => onPetsChange(o.value)}>
              <span className="flex items-center gap-2 pr-7 text-[15px] font-bold text-pine-dark">
                {o.value && <PawPrint className="h-4 w-4 text-pine" aria-hidden="true" />}
                {o.label}
              </span>
              <span className="mt-1 text-xs leading-relaxed text-muted-grey">{o.hint}</span>
            </ChoiceCard>
          ))}
        </div>
      </fieldset>
      {errors.pets && (
        <div className="mt-2">
          <FieldError id="pets-error">{errors.pets}</FieldError>
        </div>
      )}
    </SectionCard>
  );
}
