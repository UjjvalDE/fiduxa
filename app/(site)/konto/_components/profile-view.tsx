'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Languages, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import { LOCALES, LOCALE_NAMES, isLocale, type Locale } from '@/lib/i18n/config';
import { Input } from '@/componets/ui/input';
import authMessages from '../../buchung/_auth-messages';
import { PasswordInput, SubmitButton } from '../../buchung/_components/auth-forms';
import { ErrorBox, FieldError, FormField, inputClass } from '../../buchung/_components/form-field';
import { apiFieldErrors } from '../../buchung/_lib/messages';
import messages from '../_messages';

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-5 sm:p-7">
      <h2 className="m-0 text-lg font-bold tracking-tight text-pine-dark">{title}</h2>
      {description && <p className="mb-0 mt-1 text-sm text-muted-grey">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ProfileForm() {
  const { user, refresh } = useAuth();
  const t = useMessages(messages).profile;
  const ta = useMessages(authMessages);
  const { locale } = useLocale();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // Fill the form once the user is known (e.g. after a refresh)
  useEffect(() => {
    if (!user) return;
    setName((n) => n || user.name || '');
    setPhone((p) => p || user.phone || '');
  }, [user]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    const next: typeof errors = {};
    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 100) next.name = ta.validation.name;
    if (phone.trim().length > 30) next.phone = ta.validation.phone;
    setErrors(next);
    setFormError(null);
    if (next.name || next.phone) {
      document.getElementById(next.name ? 'profile-name' : 'profile-phone')?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await api.patch('/users/me', { name: trimmedName, phone: phone.trim() });
      await refresh();
      toast.success(t.saved);
    } catch (e) {
      const fields = apiFieldErrors(e, locale, { name: ta.validation.name, phone: ta.validation.phone });
      if (fields.name || fields.phone) setErrors({ name: fields.name, phone: fields.phone });
      else setFormError(translateApiError(e, locale));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {formError && <ErrorBox message={formError} />}
      <FormField id="profile-name" label={ta.fields.name} error={errors.name}>
        {(p) => <Input {...p} autoComplete="name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />}
      </FormField>
      <FormField id="profile-email" label={ta.fields.email} hint={t.emailHint}>
        {(p) => <Input {...p} type="email" value={user?.email ?? ''} readOnly aria-readonly="true" className={`${inputClass} bg-cream text-muted-grey`} />}
      </FormField>
      <FormField id="profile-phone" label={ta.fields.phone} optional error={errors.phone}>
        {(p) => (
          <Input {...p} type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        )}
      </FormField>
      <SubmitButton busy={busy} busyLabel={t.saving}>
        {t.save}
      </SubmitButton>
    </form>
  );
}

/** Preferred language: saved on the account (emails) and applied to the site right away */
function LanguageForm() {
  const { user, refresh } = useAuth();
  const t = useMessages(messages).profile;
  const { locale, setLocale } = useLocale();
  const saved = user?.preferredLanguage;
  const [value, setValue] = useState<Locale>(isLocale(saved) ? saved : locale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (isLocale(saved)) setValue(saved);
  }, [saved]);

  const change = async (next: Locale) => {
    if (busyRef.current || next === value) return;
    const previous = value;
    setValue(next);
    setError(null);
    busyRef.current = true;
    setBusy(true);
    try {
      await api.patch('/users/me', { preferredLanguage: next });
      setLocale(next);
      await refresh();
      // Confirm in the newly chosen language
      toast.success(messages[next].profile.languageSaved(LOCALE_NAMES[next]));
    } catch (e) {
      setValue(previous);
      setError(translateApiError(e, locale));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-1.5">
      <label htmlFor="profile-language" className="text-sm font-bold text-pine-dark">
        {t.languageLabel}
      </label>
      <div className="relative max-w-xs">
        <Languages className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pine" aria-hidden="true" />
        <select
          id="profile-language"
          value={value}
          disabled={busy}
          onChange={(e) => {
            const next = e.target.value;
            if (isLocale(next)) void change(next);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'profile-language-error' : undefined}
          className="h-11 w-full appearance-none rounded-[10px] border border-border bg-white pl-9 pr-10 text-base text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine disabled:opacity-70 sm:text-sm"
        >
          {LOCALES.map((code) => (
            <option key={code} value={code} lang={code}>
              {LOCALE_NAMES[code]}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-grey" aria-hidden="true" />
      </div>
      <p className="m-0 min-h-[1.25rem] text-xs text-muted-grey" aria-live="polite">
        {busy && (
          <span className="inline-flex items-center gap-1.5">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> {t.languageSaving}
          </span>
        )}
      </p>
      {error && <FieldError id="profile-language-error">{error}</FieldError>}
    </div>
  );
}

function PasswordForm() {
  const { setToken } = useAuth();
  const t = useMessages(messages).profile;
  const ta = useMessages(authMessages);
  const { locale } = useLocale();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    const errs: typeof errors = {};
    if (!current) errs.current = t.currentRequired;
    if (next.length < 8 || next.length > 72) errs.next = ta.validation.passwordLength;
    else if (confirm !== next) errs.confirm = ta.validation.mismatch;
    setErrors(errs);
    setFormError(null);
    const firstKey = (['current', 'next', 'confirm'] as const).find((k) => errs[k]);
    if (firstKey) {
      document.getElementById(`password-${firstKey}`)?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await api.patch<{ token: string }>('/users/me/password', { currentPassword: current, newPassword: next });
      if (res.token) await setToken(res.token);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success(t.changed);
    } catch (e) {
      const message = translateApiError(e, locale);
      if (e instanceof Error && e.message === 'Current password is incorrect.') setErrors({ current: message });
      else setFormError(message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {formError && <ErrorBox message={formError} />}
      <FormField id="password-current" label={t.currentPassword} error={errors.current}>
        {(p) => <PasswordInput controlProps={p} value={current} onChange={setCurrent} autoComplete="current-password" />}
      </FormField>
      <FormField id="password-next" label={t.newPassword} error={errors.next} hint={t.newHint}>
        {(p) => <PasswordInput controlProps={p} value={next} onChange={setNext} autoComplete="new-password" />}
      </FormField>
      <FormField id="password-confirm" label={t.confirmPassword} error={errors.confirm}>
        {(p) => <PasswordInput controlProps={p} value={confirm} onChange={setConfirm} autoComplete="new-password" />}
      </FormField>
      <SubmitButton busy={busy} busyLabel={t.changing}>
        {t.change}
      </SubmitButton>
    </form>
  );
}

export function ProfileView() {
  const t = useMessages(messages).profile;
  return (
    <div>
      <h1 className="!mb-5 !mt-0 !text-2xl !leading-tight sm:!text-3xl">{t.title}</h1>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="grid gap-5">
          <Panel title={t.personalTitle} description={t.personalText}>
            <ProfileForm />
          </Panel>
          <Panel title={t.languageTitle} description={t.languageText}>
            <LanguageForm />
          </Panel>
        </div>
        <Panel title={t.passwordTitle} description={t.passwordText}>
          <PasswordForm />
        </Panel>
      </div>
    </div>
  );
}
