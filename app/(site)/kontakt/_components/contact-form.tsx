'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';

import { useDraftState } from '@/hooks/use-draft-state';
import { api, ApiError } from '@/lib/api';
import { translateApiError } from '@/lib/i18n/api-errors';
import { useLocale, useMessages } from '@/lib/i18n/client';
import { Checkbox } from '@/componets/ui/checkbox';
import { EMAIL_PATTERN, FieldError, fieldA11y, fieldId, focusFirstError } from '../../_shared/form-bits';
import messages from '../_messages';

type Values = { name: string; email: string; phone: string; subject: string; message: string };

const EMPTY: Values = { name: '', email: '', phone: '', subject: '', message: '' };

const validate = (values: Values, privacy: boolean, messages: Record<string, string>) => {
  const errors: Record<string, string> = {};
  if (values.name.trim().length < 2) errors.name = messages.name;
  if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = messages.email;
  if (values.phone.trim().length > 30) errors.phone = messages.phone;
  if (values.subject.trim().length > 200) errors.subject = messages.subject;
  const len = values.message.trim().length;
  if (len < 10 || len > 3000) errors.message = messages.message;
  if (!privacy) errors.privacyAccepted = messages.privacyAccepted;
  return errors;
};

export function ContactForm({ showSubject = true }: { showSubject?: boolean }) {
  const { locale } = useLocale();
  const t = useMessages(messages).form;
  const [values, setValues, clearDraft] = useDraftState<Values>('contact', EMPTY);
  const [privacy, setPrivacy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const update = (key: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const clientErrors = validate(values, privacy, t.errors);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      focusFirstError(clientErrors);
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/contact', {
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim() || undefined,
        subject: values.subject.trim() || undefined,
        message: values.message.trim(),
        privacyAccepted: true,
      });
      setSent(true);
      clearDraft();
      setPrivacy(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        const mapped: Record<string, string> = {};
        Object.keys(error.fieldErrors).forEach((field) => {
          mapped[field] = t.errors[field] ?? t.errorFallback;
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

  if (sent) {
    return (
      <div className="contact-form" role="status" aria-live="polite">
        <CheckCircle2 size={32} strokeWidth={1.75} className="text-pine" aria-hidden="true" />
        <h3 className="!m-0 text-xl font-bold text-pine-dark">{t.sentTitle}</h3>
        <p className="m-0 text-sm leading-relaxed text-muted-grey">
          {t.sentText}
        </p>
        <button type="button" className="button button-quiet button-small" onClick={() => setSent(false)}>
          {t.another}
        </button>
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={onSubmit} noValidate aria-describedby={formError ? 'contact-form-error' : undefined}>
      <div>
        <label htmlFor={fieldId('name')}>{t.name}</label>
        <input
          {...fieldA11y('name', errors)}
          className="mt-[7px]"
          autoComplete="name"
          required
          value={values.name}
          onChange={update('name')}
          placeholder={t.namePlaceholder}
        />
        <FieldError field="name" errors={errors} />
      </div>
      <div>
        <label htmlFor={fieldId('email')}>{t.email}</label>
        <input
          {...fieldA11y('email', errors)}
          className="mt-[7px]"
          type="email"
          autoComplete="email"
          required
          value={values.email}
          onChange={update('email')}
          placeholder={t.emailPlaceholder}
        />
        <FieldError field="email" errors={errors} />
      </div>
      <div>
        <label htmlFor={fieldId('phone')}>
          {t.phone} <span className="font-normal text-muted-grey">({t.optional})</span>
        </label>
        <input
          {...fieldA11y('phone', errors)}
          className="mt-[7px]"
          type="tel"
          autoComplete="tel"
          value={values.phone}
          onChange={update('phone')}
          placeholder={t.phonePlaceholder}
        />
        <FieldError field="phone" errors={errors} />
      </div>
      {showSubject && (
        <div>
          <label htmlFor={fieldId('subject')}>
            {t.subject} <span className="font-normal text-muted-grey">({t.optional})</span>
          </label>
          <input
            {...fieldA11y('subject', errors)}
            className="mt-[7px]"
            value={values.subject}
            onChange={update('subject')}
            placeholder={t.subjectPlaceholder}
          />
          <FieldError field="subject" errors={errors} />
        </div>
      )}
      <div>
        <label htmlFor={fieldId('message')}>{t.message}</label>
        <textarea
          {...fieldA11y('message', errors)}
          className="mt-[7px]"
          required
          rows={5}
          value={values.message}
          onChange={update('message')}
          placeholder={t.messagePlaceholder}
        />
        <FieldError field="message" errors={errors} />
      </div>
      <div>
        <div className="flex items-start gap-3">
          <Checkbox
            {...fieldA11y('privacyAccepted', errors)}
            checked={privacy}
            onCheckedChange={(checked) => {
              setPrivacy(checked === true);
              if (errors.privacyAccepted) setErrors((prev) => ({ ...prev, privacyAccepted: '' }));
            }}
            className="mt-0.5 bg-white"
          />
          <label htmlFor={fieldId('privacyAccepted')} className="!block !text-xs !font-medium leading-relaxed !text-charcoal">
            {t.privacyBefore}{' '}
            <Link href="/datenschutz" className="font-bold text-pine underline underline-offset-2">
              {t.privacyLink}
            </Link>{' '}
            {t.privacyAfter}
          </label>
        </div>
        <FieldError field="privacyAccepted" errors={errors} />
      </div>

      {formError && (
        <p id="contact-form-error" role="alert" className="m-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {formError}
        </p>
      )}

      <button className="button" type="submit" disabled={submitting} aria-busy={submitting}>
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
      <p className="form-note">
        {t.note}
      </p>
    </form>
  );
}
