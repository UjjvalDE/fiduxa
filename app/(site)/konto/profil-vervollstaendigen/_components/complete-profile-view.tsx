'use client';

// Profile completion after a Google/Apple sign-up: phone, Berlin address and
// AGB + Datenschutz consent (POST /users/me/complete-profile), then back to
// the original `next` (e.g. the booking wizard, whose draft is restored).
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError, api } from '@/lib/api';
import { COMPLETE_PROFILE_PATH, useAuth } from '@/lib/auth';
import { useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import { Input } from '@/componets/ui/input';
import { ErrorBox, FormField, inputClass } from '../../../buchung/_components/form-field';
import { SubmitButton } from '../../../buchung/_components/auth-forms';
import { safeNext } from '../../../buchung/_lib/messages';
import messages from '../_messages';

const BERLIN_PLZ = /^1[0-4]\d{3}$/;
const validPlz = (v: string) => BERLIN_PLZ.test(v) && Number(v) >= 10115 && Number(v) <= 14199;
const PHONE = /^\+?[0-9 ()/-]{5,30}$/;
const validPhone = (v: string) => PHONE.test(v) && v.replace(/\D/g, '').length >= 6 && v.replace(/\D/g, '').length <= 15;

interface Prefill {
  name: string;
  email: string;
  privateRelayEmail: boolean;
  phone: string;
  address: string;
  postcode: string;
  city: string;
  floor: string;
  accessNotes: string;
}

type Field = 'name' | 'phone' | 'address' | 'postcode' | 'city' | 'acceptTerms' | 'acceptPrivacy';

export function CompleteProfileView() {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const { refresh } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = safeNext(params.get('next'));
  const next = rawNext && !rawNext.startsWith(COMPLETE_PROFILE_PATH) ? rawNext : '/konto';

  const [form, setForm] = useState<Prefill | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    api
      .get<{ required: boolean; profile: Prefill }>('/users/me/complete-profile')
      .then((r) => {
        if (!r.required) {
          router.replace(next);
          return;
        }
        setForm({ ...r.profile, city: r.profile.city || 'Berlin' });
      })
      .catch((e) => setError(translateApiError(e, locale)));
  }, [next, router, locale]);

  if (!form) {
    return (
      <div className="mx-auto max-w-xl">
        {error ? (
          <ErrorBox message={error} />
        ) : (
          <p className="m-0 flex items-center gap-2 text-sm text-muted-grey" role="status">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.loading}
          </p>
        )}
      </div>
    );
  }

  const set = (key: keyof Prefill) => (value: string) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const validate = () => {
    const v: Partial<Record<Field, string>> = {};
    const name = form.name.trim();
    if (name.length < 2 || name.length > 100) v.name = t.nameInvalid;
    if (!validPhone(form.phone.trim())) v.phone = t.phoneInvalid;
    if (form.address.trim().length < 3) v.address = t.required;
    if (!validPlz(form.postcode.trim())) v.postcode = t.postcodeInvalid;
    if (!acceptTerms) v.acceptTerms = t.termsRequired;
    if (!acceptPrivacy) v.acceptPrivacy = t.privacyRequired;
    return v;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    const v = validate();
    setErrors(v);
    setError(null);
    const first = Object.keys(v)[0];
    if (first) {
      document.getElementById(`cp-${first}`)?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await api.post('/users/me/complete-profile', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        postcode: form.postcode.trim(),
        city: form.city.trim() || 'Berlin',
        floor: form.floor.trim(),
        accessNotes: form.accessNotes.trim(),
        acceptTerms: true,
        acceptPrivacy: true,
        marketingOptIn: marketing,
      });
      await refresh();
      toast.success(t.saved);
      router.replace(next);
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) setErrors(e.fieldErrors as Partial<Record<Field, string>>);
      setError(translateApiError(e, locale));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const text = (id: Field | 'floor' | 'accessNotes', label: string, extra: React.ComponentProps<typeof Input> = {}, hint?: string) => (
    <FormField id={`cp-${id}`} label={label} error={errors[id as Field]} hint={hint}>
      {(p) => <Input {...p} {...extra} value={form[id as keyof Prefill] as string} onChange={(e) => set(id as keyof Prefill)(e.target.value)} className={inputClass} />}
    </FormField>
  );

  const consent = (id: 'acceptTerms' | 'acceptPrivacy', checked: boolean, onChange: (v: boolean) => void, label: React.ReactNode) => (
    <div>
      <label className="flex min-h-[44px] items-start gap-3 text-sm text-charcoal">
        <input
          id={`cp-${id}`}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={Boolean(errors[id])}
          aria-describedby={errors[id] ? `cp-${id}-error` : undefined}
          className="mt-0.5 h-5 w-5 shrink-0"
        />
        <span>{label}</span>
      </label>
      {errors[id] && (
        <p id={`cp-${id}-error`} className="m-0 mt-1 text-sm font-semibold text-red-700">
          {errors[id]}
        </p>
      )}
    </div>
  );

  const link = (href: string, label: string) => (
    <Link href={href} target="_blank" className="font-bold text-pine underline underline-offset-2">
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-xl rounded-2xl bg-white p-5 shadow-sm sm:p-8">
      <p className="m-0 text-xs font-bold uppercase tracking-wide text-pine">{t.eyebrow}</p>
      <h1 className="mt-1 text-2xl font-bold text-charcoal sm:text-3xl">{t.title}</h1>
      <p className="mt-2 text-sm text-muted-grey">{t.lead}</p>
      <form onSubmit={submit} noValidate className="mt-6 grid gap-4">
        {error && <ErrorBox message={error} />}
        {text('name', t.name, { autoComplete: 'name', maxLength: 100 })}
        <FormField id="cp-email" label={t.email} hint={form.privateRelayEmail ? t.relayHint : t.emailHint}>
          {(p) => <Input {...p} type="email" value={form.email} readOnly className={`${inputClass} bg-cream`} />}
        </FormField>
        {text('phone', t.phone, { type: 'tel', inputMode: 'tel', autoComplete: 'tel', maxLength: 30 }, t.phoneHint)}
        {text('address', t.street, { autoComplete: 'street-address', maxLength: 200 })}
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          {text('postcode', t.postcode, { autoComplete: 'postal-code', inputMode: 'numeric', maxLength: 5 })}
          {text('city', t.city, { autoComplete: 'address-level2', maxLength: 80 })}
        </div>
        {text('floor', t.floor, { maxLength: 80 })}
        {text('accessNotes', t.accessNotes, { maxLength: 1000 })}
        {consent('acceptTerms', acceptTerms, setAcceptTerms, (
          <>
            {t.termsBefore}
            {link('/agb', t.terms)}
            {t.termsAfter}
          </>
        ))}
        {consent('acceptPrivacy', acceptPrivacy, setAcceptPrivacy, (
          <>
            {t.privacyBefore}
            {link('/datenschutz', t.privacy)}
            {t.privacyAfter}
          </>
        ))}
        <label className="flex min-h-[44px] items-start gap-3 text-sm text-charcoal">
          <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{t.marketing}</span>
        </label>
        <SubmitButton busy={busy} busyLabel={t.busy}>
          {t.submit}
        </SubmitButton>
      </form>
    </div>
  );
}
