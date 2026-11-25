'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';

import { useDraftState } from '@/hooks/use-draft-state';
import { api, ApiError } from '@/lib/api';
import { translateApiError } from '@/lib/i18n/api-errors';
import { useLocale, useMessages } from '@/lib/i18n/client';
import type { BusinessRequest } from '@/lib/types';
import { EMAIL_PATTERN, FieldError, fieldA11y, fieldId, focusFirstError } from '../../_shared/form-bits';
import messages from '../_messages';

type ServiceType = BusinessRequest['service']['types'][number];

/** Normalises API paths like service.types.0 → service.types */
const normaliseField = (field: string) => (field.startsWith('service.types') ? 'service.types' : field);

const INITIAL = {
  'company.name': '',
  'company.legalForm': '',
  'company.vatId': '',
  'company.contactPerson': '',
  'company.email': '',
  'company.phone': '',
  'site.address': '',
  'site.postcode': '',
  'site.accessInstructions': '',
  'site.parkingNotes': '',
  'premises.type': 'office',
  'premises.areaM2': '',
  'premises.floors': '1',
  'premises.rooms': '',
  'premises.sanitaryFacilities': '',
  'service.frequency': 'weekly',
  'service.preferredTime': '',
  'service.description': '',
  'operations.startDate': '',
  'operations.contractDuration': '',
  'operations.materialsProvidedBy': 'to-discuss',
  'operations.securityRequirements': '',
};

type Field = keyof typeof INITIAL;

const isInt = (v: string, min: number, max: number) => v === '' || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max);

export function BusinessRequestForm() {
  const { locale } = useLocale();
  const t = useMessages(messages).form;
  const MESSAGES = t.errors;
  const messageFor = (field: string) => {
    if (MESSAGES[field]) return MESSAGES[field];
    const parent = Object.keys(MESSAGES).find((key) => field.startsWith(`${key}.`));
    return parent ? MESSAGES[parent] : t.errorFallback;
  };
  const [values, setValues, clearDraft] = useDraftState<Record<Field, string>>('business-request', INITIAL);
  const [types, setTypes] = useState<ServiceType[]>(['maintenance']);
  const [hasKitchenette, setHasKitchenette] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ reference: string } | null>(null);

  const set = (field: Field) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    const v = (f: Field) => values[f].trim();
    if (v('company.name').length < 2) e['company.name'] = MESSAGES['company.name'];
    if (v('company.contactPerson').length < 2) e['company.contactPerson'] = MESSAGES['company.contactPerson'];
    if (!EMAIL_PATTERN.test(v('company.email'))) e['company.email'] = MESSAGES['company.email'];
    if (v('company.phone').length < 5 || v('company.phone').length > 30) e['company.phone'] = MESSAGES['company.phone'];
    if (v('site.address').length < 5) e['site.address'] = MESSAGES['site.address'];
    if (!/^\d{5}$/.test(v('site.postcode'))) e['site.postcode'] = MESSAGES['site.postcode'];
    const area = Number(v('premises.areaM2').replace(',', '.'));
    if (!v('premises.areaM2') || !Number.isFinite(area) || area < 1 || area > 100000) e['premises.areaM2'] = MESSAGES['premises.areaM2'];
    if (!isInt(v('premises.floors'), 0, 200)) e['premises.floors'] = MESSAGES['premises.floors'];
    if (!isInt(v('premises.rooms'), 0, 1000)) e['premises.rooms'] = MESSAGES['premises.rooms'];
    if (!isInt(v('premises.sanitaryFacilities'), 0, 500)) e['premises.sanitaryFacilities'] = MESSAGES['premises.sanitaryFacilities'];
    if (types.length === 0) e['service.types'] = MESSAGES['service.types'];
    if (!privacy) e['consent.privacyAccepted'] = MESSAGES['consent.privacyAccepted'];
    return e;
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const clientErrors = validate();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setFormError(t.checkFields);
      focusFirstError(clientErrors);
      return;
    }

    const v = (f: Field) => values[f].trim();
    const optionalInt = (f: Field) => (v(f) === '' ? undefined : Number(v(f)));

    const body = {
      company: {
        name: v('company.name'),
        legalForm: v('company.legalForm'),
        vatId: v('company.vatId'),
        contactPerson: v('company.contactPerson'),
        email: v('company.email'),
        phone: v('company.phone'),
      },
      site: {
        address: v('site.address'),
        postcode: v('site.postcode'),
        accessInstructions: v('site.accessInstructions'),
        parkingNotes: v('site.parkingNotes'),
      },
      premises: {
        type: values['premises.type'],
        areaM2: Number(v('premises.areaM2').replace(',', '.')),
        floors: optionalInt('premises.floors'),
        rooms: optionalInt('premises.rooms'),
        sanitaryFacilities: optionalInt('premises.sanitaryFacilities'),
        hasKitchenette,
      },
      service: {
        types,
        frequency: values['service.frequency'],
        preferredTime: v('service.preferredTime'),
        description: v('service.description'),
      },
      operations: {
        startDate: v('operations.startDate') || undefined,
        contractDuration: v('operations.contractDuration'),
        materialsProvidedBy: values['operations.materialsProvidedBy'],
        securityRequirements: v('operations.securityRequirements'),
      },
      consent: { privacyAccepted: true as const, marketing },
      locale,
    };

    setSubmitting(true);
    try {
      const res = await api.post<{ success: boolean; message: string; reference: string }>('/business-requests', body);
      setSuccess({ reference: res.reference });
      clearDraft();
      window.scrollTo({ top: (document.getElementById('anfrage')?.offsetTop ?? 0) - 100, behavior: 'smooth' });
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && Object.keys(error.fieldErrors).length > 0) {
        const mapped: Record<string, string> = {};
        Object.keys(error.fieldErrors).forEach((field) => {
          const key = normaliseField(field);
          mapped[key] = messageFor(key);
        });
        setErrors(mapped);
        setFormError(t.checkFields);
        focusFirstError(mapped);
      } else if (error instanceof ApiError && error.status === 0) {
        setFormError(t.offline);
      } else {
        setFormError(translateApiError(error, locale));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-2xl border border-border bg-white p-8 text-center sm:p-12" role="status" aria-live="polite">
        <CheckCircle2 size={44} strokeWidth={1.75} className="mx-auto text-pine" aria-hidden="true" />
        <h3 className="!mb-0 !mt-5 text-2xl font-bold text-pine-dark">{t.successTitle}</h3>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-grey">{t.successText}</p>
        <p className="mx-auto mt-6 inline-block rounded-xl bg-mint px-5 py-3 text-sm text-pine-dark">
          {t.reference} <strong className="font-mono text-base tracking-wide">{success.reference}</strong>
        </p>
        <p className="mt-6 text-xs text-muted-grey">{t.referenceHint}</p>
        <Link href="/" className="button button-quiet mx-auto mt-4">
          {t.home}
        </Link>
      </div>
    );
  }

  const input =
    'h-11 w-full rounded-lg border border-border bg-white px-3 text-sm text-charcoal placeholder:text-muted-grey/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-1 aria-[invalid=true]:border-red-400';
  const textarea = input.replace('h-11', 'min-h-[96px] py-2.5');
  const labelCls = 'mb-1.5 block text-sm font-bold text-pine-dark';
  const optional = <span className="font-normal text-muted-grey"> ({t.optional})</span>;
  const fieldsetCls = 'grid gap-5 rounded-2xl border border-border bg-white p-6 sm:p-8';
  const legendCls = 'float-left mb-1 w-full text-lg font-bold text-pine-dark';

  const text = (field: Field, label: string, opts: { required?: boolean; type?: string; placeholder?: string; autoComplete?: string; inputMode?: 'numeric' | 'decimal' | 'tel' | 'email' } = {}) => (
    <div>
      <label htmlFor={fieldId(field)} className={labelCls}>
        {label}
        {!opts.required && optional}
      </label>
      <input
        {...fieldA11y(field, errors)}
        className={input}
        type={opts.type ?? 'text'}
        value={values[field]}
        onChange={set(field)}
        placeholder={opts.placeholder}
        autoComplete={opts.autoComplete}
        inputMode={opts.inputMode}
        required={opts.required}
      />
      <FieldError field={field} errors={errors} />
    </div>
  );

  const area = (field: Field, label: string, placeholder?: string) => (
    <div>
      <label htmlFor={fieldId(field)} className={labelCls}>
        {label}
        {optional}
      </label>
      <textarea {...fieldA11y(field, errors)} className={textarea} value={values[field]} onChange={set(field)} placeholder={placeholder} rows={3} />
      <FieldError field={field} errors={errors} />
    </div>
  );

  const select = (field: Field, label: string, options: Record<string, string>) => (
    <div>
      <label htmlFor={fieldId(field)} className={labelCls}>
        {label}
      </label>
      <select {...fieldA11y(field, errors)} className={input} value={values[field]} onChange={set(field)}>
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      <FieldError field={field} errors={errors} />
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6" aria-describedby="biz-required-note">
      <p id="biz-required-note" className="m-0 text-sm text-muted-grey">
        {t.requiredNote}
      </p>

      <fieldset className={fieldsetCls}>
        <legend className={legendCls}>{t.sections.company}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          {text('company.name', t.labels.companyName, { required: true, autoComplete: 'organization' })}
          {text('company.legalForm', t.labels.legalForm, { placeholder: t.labels.legalFormPlaceholder })}
          {text('company.vatId', t.labels.vatId)}
          {text('company.contactPerson', t.labels.contactPerson, { required: true, autoComplete: 'name' })}
          {text('company.email', t.labels.email, { required: true, type: 'email', autoComplete: 'email', inputMode: 'email' })}
          {text('company.phone', t.labels.phone, { required: true, type: 'tel', autoComplete: 'tel', inputMode: 'tel' })}
        </div>
      </fieldset>

      <fieldset className={fieldsetCls}>
        <legend className={legendCls}>{t.sections.site}</legend>
        <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          {text('site.address', t.labels.address, { required: true, placeholder: t.labels.addressPlaceholder, autoComplete: 'street-address' })}
          {text('site.postcode', t.labels.postcode, { required: true, inputMode: 'numeric', autoComplete: 'postal-code' })}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {area('site.accessInstructions', t.labels.access, t.labels.accessPlaceholder)}
          {area('site.parkingNotes', t.labels.parking)}
        </div>
      </fieldset>

      <fieldset className={fieldsetCls}>
        <legend className={legendCls}>{t.sections.premises}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          {select('premises.type', t.labels.premisesType, t.premises)}
          {text('premises.areaM2', t.labels.area, { required: true, inputMode: 'decimal' })}
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          {text('premises.floors', t.labels.floors, { inputMode: 'numeric' })}
          {text('premises.rooms', t.labels.rooms, { inputMode: 'numeric' })}
          {text('premises.sanitaryFacilities', t.labels.sanitary, { inputMode: 'numeric', placeholder: t.labels.sanitaryPlaceholder })}
        </div>
        <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-charcoal">
          <input type="checkbox" checked={hasKitchenette} onChange={(e) => setHasKitchenette(e.target.checked)} className="h-4 w-4 accent-[#174D3A]" />
          {t.labels.kitchenette}
        </label>
      </fieldset>

      <fieldset className={fieldsetCls}>
        <legend className={legendCls}>{t.sections.service}</legend>
        <fieldset aria-describedby={errors['service.types'] ? `${fieldId('service.types')}-error` : undefined}>
          <legend className="mb-2 text-sm font-bold text-pine-dark">{t.labels.serviceTypes}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(t.serviceTypes) as ServiceType[]).map((type, index) => {
              const checked = types.includes(type);
              return (
                <label
                  key={type}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-pine ${
                    checked ? 'border-pine bg-mint' : 'border-border bg-white hover:bg-cream'
                  }`}
                >
                  <input
                    type="checkbox"
                    id={index === 0 ? fieldId('service.types') : undefined}
                    checked={checked}
                    onChange={() => {
                      setTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : prev.concat(type)));
                      if (errors['service.types']) setErrors((prev) => ({ ...prev, 'service.types': '' }));
                    }}
                    className="h-4 w-4 accent-[#174D3A]"
                  />
                  <span className="font-semibold">{t.serviceTypes[type]}</span>
                </label>
              );
            })}
          </div>
          <FieldError field="service.types" errors={errors} />
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-2">
          {select('service.frequency', t.labels.frequency, t.frequencies)}
          {text('service.preferredTime', t.labels.preferredTime, { placeholder: t.labels.preferredTimePlaceholder })}
        </div>
        {area('service.description', t.labels.description, t.labels.descriptionPlaceholder)}
      </fieldset>

      <fieldset className={fieldsetCls}>
        <legend className={legendCls}>{t.sections.operations}</legend>
        <div className="grid gap-5 sm:grid-cols-3">
          {text('operations.startDate', t.labels.startDate, { type: 'date' })}
          {text('operations.contractDuration', t.labels.contractDuration, { placeholder: t.labels.contractDurationPlaceholder })}
          {select('operations.materialsProvidedBy', t.labels.materials, t.materials)}
        </div>
        {area('operations.securityRequirements', t.labels.security, t.labels.securityPlaceholder)}
      </fieldset>

      <fieldset className={fieldsetCls}>
        <legend className={legendCls}>{t.sections.privacy}</legend>
        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-charcoal">
            <input
              type="checkbox"
              {...fieldA11y('consent.privacyAccepted', errors)}
              checked={privacy}
              onChange={(e) => {
                setPrivacy(e.target.checked);
                if (errors['consent.privacyAccepted']) setErrors((prev) => ({ ...prev, 'consent.privacyAccepted': '' }));
              }}
              className="mt-1 h-4 w-4 shrink-0 accent-[#174D3A]"
            />
            <span>
              {t.privacyBefore}{' '}
              <Link href="/datenschutz" className="font-bold text-pine underline underline-offset-2">
                {t.privacyLink}
              </Link>{' '}
              {t.privacyAfter}
            </span>
          </label>
          <FieldError field="consent.privacyAccepted" errors={errors} />
        </div>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted-grey">
          <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#174D3A]" />
          <span>
            {t.marketing}
          </span>
        </label>
      </fieldset>

      {formError && (
        <p role="alert" className="m-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {formError}
        </p>
      )}

      <button type="submit" className="button" disabled={submitting} aria-busy={submitting}>
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
    </form>
  );
}
