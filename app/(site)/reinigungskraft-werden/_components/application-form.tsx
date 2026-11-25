'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, FileText, Info, Loader2, UploadCloud, X } from 'lucide-react';

import { Checkbox } from '@/componets/ui/checkbox';
import { useDraftState } from '@/hooks/use-draft-state';
import { api, ApiError } from '@/lib/api';
import { translateApiError } from '@/lib/i18n/api-errors';
import { useLocale, useMessages } from '@/lib/i18n/client';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type {
  ApplicationExperience,
  ApplicationHours,
  ApplicationSource,
  ApplicationVehicle,
  ExperiencePlace,
  WorkerApplicationInput,
  WorkPermit,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { ChoiceCard } from '../../buchung/_components/choice-card';
import { EMAIL_PATTERN, FieldError, errorId, fieldA11y, fieldId, focusFirstError } from '../../_shared/form-bits';
import messages, {
  APPLICATION_LANGUAGES,
  EXPERIENCE_OPTIONS,
  EXPERIENCE_PLACES,
  HOURS_OPTIONS,
  SOURCES,
  VEHICLES,
  WORK_PERMITS,
} from '../_messages';

const CV_MAX_BYTES = 5 * 1024 * 1024;
const CV_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png';
const CV_EXTENSION = /\.(pdf|docx?|jpe?g|png)$/i;
const MESSAGE_MAX = 1000;

type Text = { name: string; email: string; phone: string; postcode: string; message: string; website: string };
type Choices = {
  permit: WorkPermit | '';
  hoursPerWeek: ApplicationHours | '';
  experience: ApplicationExperience | '';
  vehicle: ApplicationVehicle | '';
  source: ApplicationSource | '';
};
type Cv = { name: string; size: number; dataUrl: string };

const EMPTY_TEXT: Text = { name: '', email: '', phone: '', postcode: '', message: '', website: '' };
const EMPTY_CHOICES: Choices = { permit: '', hoursPerWeek: '', experience: '', vehicle: '', source: '' };

const INPUT_CLASS =
  'mt-[7px] block w-full rounded-lg border border-border bg-white px-3 py-3 text-sm text-charcoal outline-none transition-shadow focus:border-sage focus:ring-[3px] focus:ring-mint aria-[invalid=true]:border-red-400';
const LABEL_CLASS = 'block text-xs font-extrabold text-pine-dark';
const LEGEND_CLASS = 'mb-3 p-0 text-base font-bold text-pine-dark';

/** Fieldset with legend, focusable as a whole so "focus first error" can jump to it */
function Group({
  field,
  legend,
  hint,
  optionalLabel,
  errors,
  children,
}: {
  field: string;
  legend: string;
  hint?: string;
  optionalLabel?: string;
  errors: Record<string, string>;
  children: React.ReactNode;
}) {
  const hintId = `${fieldId(field)}-hint`;
  const describedBy = [hint ? hintId : null, errors[field] ? errorId(field) : null].filter(Boolean).join(' ') || undefined;
  return (
    <fieldset
      id={fieldId(field)}
      tabIndex={-1}
      aria-describedby={describedBy}
      className="m-0 min-w-0 rounded-lg border-0 p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-4 focus-visible:ring-offset-cream"
    >
      <legend className={LEGEND_CLASS}>
        {legend}
        {optionalLabel && <span className="ml-1.5 text-sm font-normal text-muted-grey">({optionalLabel})</span>}
      </legend>
      {hint && (
        <p id={hintId} className="-mt-2 mb-3 text-xs text-muted-grey">
          {hint}
        </p>
      )}
      {children}
      <FieldError field={field} errors={errors} />
    </fieldset>
  );
}

/** Pill-shaped checkbox backed by a real (visually hidden) input */
function Chip({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={cn('relative inline-flex', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={cn(
          'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-cream',
          checked ? 'border-pine bg-pine text-white' : 'border-border bg-white text-charcoal hover:border-sage',
          disabled && 'opacity-60 hover:border-border'
        )}
      >
        {label}
      </span>
    </label>
  );
}

const validate = (text: Text, choices: Choices, privacy: boolean, e: Record<string, string>) => {
  const errors: Record<string, string> = {};
  const name = text.name.trim();
  if (name.length < 2 || name.length > 100) errors.name = e.name;
  const email = text.email.trim();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) errors.email = e.email;
  const phone = text.phone.trim();
  if (phone.length < 5 || phone.length > 30) errors.phone = e.phone;
  if (!/^\d{5}$/.test(text.postcode.trim())) errors.postcode = e.postcode;
  (Object.keys(choices) as (keyof Choices)[]).forEach((key) => {
    if (!choices[key]) errors[key] = e[key];
  });
  if (text.message.trim().length > MESSAGE_MAX) errors.message = e.message;
  if (!privacy) errors.privacyAccepted = e.privacyAccepted;
  return errors;
};

export function ApplicationForm() {
  const { locale } = useLocale();
  const { form: t, options: o } = useMessages(messages);

  const [text, setText, clearTextDraft] = useDraftState<Text>('application:text', EMPTY_TEXT);
  const [choices, setChoices, clearChoicesDraft] = useDraftState<Choices>('application:choices', EMPTY_CHOICES);
  const [languages, setLanguages] = useState<string[]>([]);
  const [places, setPlaces] = useState<ExperiencePlace[]>([]);
  const [cv, setCv] = useState<Cv | null>(null);
  const [cvReading, setCvReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sentHeadingRef = useRef<HTMLHeadingElement>(null);

  const mb = useMemo(
    () => new Intl.NumberFormat(INTL_LOCALE[locale], { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [locale]
  );
  const formatMb = (bytes: number) => mb.format(bytes / (1024 * 1024));

  useEffect(() => {
    if (sent) sentHeadingRef.current?.focus();
  }, [sent]);

  const clearError = (key: string) => {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const updateText = (key: keyof Text) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setText((prev) => ({ ...prev, [key]: value }));
    clearError(key);
    if (key === 'email') setAlreadyApplied(false);
  };

  const choose = <K extends keyof Choices>(key: K, value: Choices[K]) => {
    setChoices((prev) => ({ ...prev, [key]: value }));
    clearError(key);
    if (key === 'experience' && value === 'none') setPlaces([]);
  };

  const toggle = <T extends string>(list: T[], value: T, on: boolean) =>
    on ? (list.includes(value) ? list : [...list, value]) : list.filter((item) => item !== value);

  const pickFile = (file: File) => {
    clearError('cv');
    if (!CV_EXTENSION.test(file.name)) {
      setErrors((prev) => ({ ...prev, cv: t.errors.cv }));
      return;
    }
    if (file.size > CV_MAX_BYTES) {
      setErrors((prev) => ({ ...prev, cv: `${t.errors.cvSize} (${t.cvSize(formatMb(file.size))})` }));
      return;
    }
    setCvReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setCvReading(false);
      if (typeof reader.result === 'string') setCv({ name: file.name, size: file.size, dataUrl: reader.result });
      else setErrors((prev) => ({ ...prev, cv: t.errors.cvRead }));
    };
    reader.onerror = () => {
      setCvReading(false);
      setErrors((prev) => ({ ...prev, cv: t.errors.cvRead }));
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || cvReading) return;
    setFormError(null);
    setAlreadyApplied(false);
    const clientErrors = validate(text, choices, privacy, t.errors);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setFormError(t.checkFields);
      focusFirstError(clientErrors);
      return;
    }

    const body: WorkerApplicationInput = {
      name: text.name.trim(),
      email: text.email.trim(),
      phone: text.phone.trim(),
      postcode: text.postcode.trim(),
      languages,
      permit: choices.permit as WorkPermit,
      hoursPerWeek: choices.hoursPerWeek as ApplicationHours,
      experience: choices.experience as ApplicationExperience,
      experiencePlaces: choices.experience === 'none' ? [] : places,
      vehicle: choices.vehicle as ApplicationVehicle,
      source: choices.source as ApplicationSource,
      message: text.message.trim() || undefined,
      locale,
      privacyAccepted: true,
      cv: cv ? { name: cv.name, dataUrl: cv.dataUrl } : undefined,
      website: text.website,
    };

    setSubmitting(true);
    try {
      await api.post('/jobs/applications', body);
      setSent(true);
      clearTextDraft();
      clearChoicesDraft();
      setLanguages([]);
      setPlaces([]);
      setCv(null);
      setPrivacy(false);
      setErrors({});
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setAlreadyApplied(true);
      } else if (error instanceof ApiError && error.status === 422) {
        const mapped: Record<string, string> = {};
        Object.keys(error.fieldErrors).forEach((path) => {
          const field = path.split('.')[0];
          mapped[field] = t.errors[field] ?? t.errorFallback;
        });
        if (Object.keys(mapped).length > 0) {
          setErrors(mapped);
          setFormError(t.checkFields);
          focusFirstError(mapped);
        } else {
          const translated = translateApiError(error, locale);
          // CV type / size problems come back as a plain message
          if (/\bCV\b/.test(error.message)) {
            setErrors((prev) => ({ ...prev, cv: translated }));
            focusFirstError({ cv: translated });
          }
          setFormError(translated);
        }
      } else if (error instanceof ApiError && error.status === 0) {
        setFormError(t.offline);
      } else {
        setFormError(translateApiError(error, locale));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="grid justify-items-start gap-4 rounded-2xl border border-border bg-white p-6 sm:p-8" role="status" aria-live="polite">
        <CheckCircle2 size={36} strokeWidth={1.75} className="text-pine" aria-hidden="true" />
        <h3 ref={sentHeadingRef} tabIndex={-1} className="!m-0 text-2xl font-bold text-pine-dark focus:outline-none">
          {t.sentTitle}
        </h3>
        <p className="m-0 max-w-xl text-sm leading-relaxed text-muted-grey">{t.sentText}</p>
        <Link href="/" className="button button-quiet button-small">
          {t.backHome}
        </Link>
      </div>
    );
  }

  const placesDisabled = choices.experience === 'none';
  const privacyGap = /^[.,]/.test(t.privacyAfter) ? '' : ' ';

  return (
    <form
      className="relative grid gap-10 rounded-2xl border border-border bg-white p-5 sm:p-8"
      onSubmit={onSubmit}
      noValidate
      aria-describedby={formError ? 'application-form-error' : undefined}
    >
      {/* Contact */}
      <fieldset className="m-0 grid min-w-0 gap-5 border-0 p-0">
        <legend className={LEGEND_CLASS}>{t.sectionContact}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor={fieldId('name')} className={LABEL_CLASS}>
              {t.name}
            </label>
            <input
              {...fieldA11y('name', errors)}
              className={INPUT_CLASS}
              autoComplete="name"
              required
              maxLength={100}
              value={text.name}
              onChange={updateText('name')}
              placeholder={t.namePlaceholder}
            />
            <FieldError field="name" errors={errors} />
          </div>
          <div>
            <label htmlFor={fieldId('email')} className={LABEL_CLASS}>
              {t.email}
            </label>
            <input
              {...fieldA11y('email', errors)}
              className={INPUT_CLASS}
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={text.email}
              onChange={updateText('email')}
              placeholder={t.emailPlaceholder}
            />
            <FieldError field="email" errors={errors} />
          </div>
          <div>
            <label htmlFor={fieldId('phone')} className={LABEL_CLASS}>
              {t.phone}
            </label>
            <input
              {...fieldA11y('phone', errors)}
              className={INPUT_CLASS}
              type="tel"
              autoComplete="tel"
              required
              maxLength={30}
              value={text.phone}
              onChange={updateText('phone')}
              placeholder={t.phonePlaceholder}
            />
            <FieldError field="phone" errors={errors} />
          </div>
          <div>
            <label htmlFor={fieldId('postcode')} className={LABEL_CLASS}>
              {t.postcode}
            </label>
            <input
              {...fieldA11y('postcode', errors)}
              className={INPUT_CLASS}
              inputMode="numeric"
              autoComplete="postal-code"
              pattern="\d{5}"
              maxLength={5}
              required
              value={text.postcode}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                setText((prev) => ({ ...prev, postcode: value }));
                clearError('postcode');
              }}
              placeholder={t.postcodePlaceholder}
            />
            <FieldError field="postcode" errors={errors} />
          </div>
        </div>
      </fieldset>

      <Group field="languages" legend={t.languages} hint={t.languagesHint} optionalLabel={t.optional} errors={errors}>
        <div className="flex flex-wrap gap-2">
          {APPLICATION_LANGUAGES.map((code) => (
            <Chip
              key={code}
              label={o.languages[code] ?? code}
              checked={languages.includes(code)}
              onChange={(on) => {
                setLanguages((prev) => toggle(prev, code, on));
                clearError('languages');
              }}
            />
          ))}
        </div>
      </Group>

      <Group field="permit" legend={t.permit} errors={errors}>
        <div className="grid gap-3 sm:grid-cols-2">
          {WORK_PERMITS.map((value) => (
            <ChoiceCard key={value} type="radio" name="permit" value={value} checked={choices.permit === value} onChange={() => choose('permit', value)}>
              <span className="pr-8 text-sm font-semibold leading-snug text-charcoal">{o.permit[value]}</span>
            </ChoiceCard>
          ))}
        </div>
      </Group>

      <Group field="hoursPerWeek" legend={t.hours} errors={errors}>
        <div className="grid gap-3 sm:grid-cols-3">
          {HOURS_OPTIONS.map((value) => (
            <ChoiceCard
              key={value}
              type="radio"
              name="hoursPerWeek"
              value={value}
              checked={choices.hoursPerWeek === value}
              onChange={() => choose('hoursPerWeek', value)}
            >
              <span className="pr-8 text-sm font-semibold text-charcoal">{o.hours[value]}</span>
            </ChoiceCard>
          ))}
        </div>
      </Group>

      <Group field="experience" legend={t.experience} errors={errors}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {EXPERIENCE_OPTIONS.map((value) => (
            <ChoiceCard
              key={value}
              type="radio"
              name="experience"
              value={value}
              checked={choices.experience === value}
              onChange={() => choose('experience', value)}
            >
              <span className="pr-8 text-sm font-semibold leading-snug text-charcoal">{o.experience[value]}</span>
            </ChoiceCard>
          ))}
        </div>
      </Group>

      <Group
        field="experiencePlaces"
        legend={t.places}
        hint={placesDisabled ? t.placesDisabled : t.placesHint}
        optionalLabel={t.optional}
        errors={errors}
      >
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-4">
          {EXPERIENCE_PLACES.map((value) => (
            <ChoiceCard
              key={value}
              type="checkbox"
              name="experiencePlaces"
              value={value}
              disabled={placesDisabled}
              checked={!placesDisabled && places.includes(value)}
              onChange={(on) => {
                setPlaces((prev) => toggle(prev, value, on));
                clearError('experiencePlaces');
              }}
            >
              <span className="pr-8 text-sm font-semibold leading-snug text-charcoal">{o.places[value]}</span>
            </ChoiceCard>
          ))}
        </div>
      </Group>

      <Group field="vehicle" legend={t.vehicle} errors={errors}>
        <div className="grid gap-3 sm:grid-cols-2">
          {VEHICLES.map((value) => (
            <ChoiceCard key={value} type="radio" name="vehicle" value={value} checked={choices.vehicle === value} onChange={() => choose('vehicle', value)}>
              <span className="pr-8 text-sm font-semibold text-charcoal">{o.vehicle[value]}</span>
            </ChoiceCard>
          ))}
        </div>
      </Group>

      <Group field="source" legend={t.source} errors={errors}>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3">
          {SOURCES.map((value) => (
            <ChoiceCard key={value} type="radio" name="source" value={value} checked={choices.source === value} onChange={() => choose('source', value)}>
              <span className="pr-8 text-sm font-semibold text-charcoal">{o.source[value]}</span>
            </ChoiceCard>
          ))}
        </div>
      </Group>

      <div>
        <label htmlFor={fieldId('message')} className="block text-base font-bold text-pine-dark">
          {t.message} <span className="text-sm font-normal text-muted-grey">({t.optional})</span>
        </label>
        <textarea
          {...fieldA11y('message', errors)}
          className={cn(INPUT_CLASS, 'mt-3 resize-y')}
          rows={4}
          maxLength={MESSAGE_MAX}
          value={text.message}
          onChange={updateText('message')}
          placeholder={t.messagePlaceholder}
        />
        <p className="mb-0 mt-1 text-right text-xs text-muted-grey" aria-live="polite">
          {t.charCount(text.message.length, MESSAGE_MAX)}
        </p>
        <FieldError field="message" errors={errors} />
      </div>

      {/* CV upload */}
      <div role="group" aria-labelledby="cv-label">
        <p id="cv-label" className="mb-1 mt-0 text-base font-bold text-pine-dark">
          {t.cv} <span className="text-sm font-normal text-muted-grey">({t.optional})</span>
        </p>
        <p id="cv-hint" className="mb-3 mt-0 text-xs text-muted-grey">
          {t.cvHint}
        </p>
        {cv ? (
          <div className="flex items-center gap-3 rounded-xl border border-sage bg-mint/60 p-4">
            <FileText size={24} strokeWidth={1.75} className="shrink-0 text-pine" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-sm font-semibold text-charcoal">{cv.name}</p>
              <p className="m-0 text-xs text-muted-grey">{t.cvSize(formatMb(cv.size))}</p>
              <div className="mt-1.5 h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-white" aria-hidden="true">
                <div className="h-full rounded-full bg-pine" style={{ width: `${Math.max(2, Math.round((cv.size / CV_MAX_BYTES) * 100))}%` }} />
              </div>
            </div>
            <button
              type="button"
              id={fieldId('cv')}
              onClick={() => {
                setCv(null);
                clearError('cv');
              }}
              aria-label={t.cvRemoveLabel(cv.name)}
              title={t.cvRemove}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-white text-charcoal transition-colors hover:border-red-300 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              if (!dragging) setDragging(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) pickFile(file);
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
              dragging ? 'border-pine bg-mint' : errors.cv ? 'border-red-300 bg-red-50/40' : 'border-border bg-cream/60'
            )}
          >
            <UploadCloud size={28} strokeWidth={1.75} className="text-pine" aria-hidden="true" />
            {cvReading ? (
              <p className="m-0 inline-flex items-center gap-2 text-sm text-charcoal" role="status">
                <Loader2 size={16} className="animate-spin" aria-hidden="true" /> {t.cvReading}
              </p>
            ) : (
              <>
                <p className="m-0 text-sm text-charcoal">{dragging ? t.cvDropActive : t.cvDrop}</p>
                <button
                  type="button"
                  id={fieldId('cv')}
                  aria-describedby={['cv-hint', errors.cv ? errorId('cv') : null].filter(Boolean).join(' ')}
                  onClick={() => fileInputRef.current?.click()}
                  className="button button-quiet button-small"
                >
                  {t.cvChoose}
                </button>
              </>
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={CV_ACCEPT}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) pickFile(file);
            e.target.value = '';
          }}
        />
        <FieldError field="cv" errors={errors} />
      </div>

      {/* Honeypot – hidden from people and assistive tech */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-[10000px] top-0 h-px w-px overflow-hidden">
        <label htmlFor="f-website">{t.honeypot}</label>
        <input id="f-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={text.website} onChange={updateText('website')} />
      </div>

      <div>
        <div className="flex items-start gap-3">
          <Checkbox
            {...fieldA11y('privacyAccepted', errors)}
            checked={privacy}
            onCheckedChange={(checked) => {
              setPrivacy(checked === true);
              clearError('privacyAccepted');
            }}
            className="mt-0.5 bg-white"
          />
          <label htmlFor={fieldId('privacyAccepted')} className="text-sm leading-relaxed text-charcoal">
            {t.privacyBefore}{' '}
            <Link href="/datenschutz" target="_blank" className="font-bold text-pine underline underline-offset-2">
              {t.privacyLink}
            </Link>
            {privacyGap}
            {t.privacyAfter}
          </label>
        </div>
        <FieldError field="privacyAccepted" errors={errors} />
      </div>

      <div className="grid gap-4">
        {alreadyApplied && (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-sage bg-mint p-4 text-sm leading-relaxed text-pine-dark">
            <Info size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-pine" aria-hidden="true" />
            <p className="m-0">
              <strong className="block">{t.alreadyTitle}</strong>
              {t.alreadyText}
            </p>
          </div>
        )}
        {formError && (
          <p id="application-form-error" role="alert" className="m-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {formError}
          </p>
        )}
        <button className="button justify-self-start" type="submit" disabled={submitting || cvReading} aria-busy={submitting}>
          {submitting ? (
            <>
              <Loader2 size={17} className="animate-spin" aria-hidden="true" /> {t.submitting}
            </>
          ) : (
            <>
              {t.submit} <ArrowRight size={17} aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
