'use client';

// Login & registration forms, shared by /login, /registrieren and the
// inline account step of the booking wizard.
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';

import { useAuth } from '@/lib/auth';
import { useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import type { User } from '@/lib/types';
import { Input } from '@/componets/ui/input';
import authMessages from '../_auth-messages';
import { EMAIL_PATTERN } from '../_lib/messages';
import { ErrorBox, FormField, inputClass, type FieldControlProps } from './form-field';

export function PasswordInput({
  value,
  onChange,
  autoComplete,
  controlProps,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  controlProps: FieldControlProps;
}) {
  const t = useMessages(authMessages);
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...controlProps}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        maxLength={72}
        className={`${inputClass} pr-12`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted-grey hover:text-pine focus-visible:outline focus-visible:outline-2 focus-visible:outline-pine"
        aria-label={visible ? t.fields.hidePassword : t.fields.showPassword}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

export function SubmitButton({ busy, children, busyLabel }: { busy: boolean; children: React.ReactNode; busyLabel: string }) {
  return (
    <button type="submit" className="button w-full disabled:cursor-not-allowed disabled:opacity-70 sm:w-fit" disabled={busy} aria-disabled={busy}>
      {busy ? (
        <>
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

type Errors = Partial<Record<'name' | 'email' | 'phone' | 'password' | 'confirm', string>>;

export function LoginForm({
  idPrefix = 'login',
  onSuccess,
  showForgotLink = true,
  defaultEmail = '',
}: {
  idPrefix?: string;
  onSuccess: (user: User) => void;
  showForgotLink?: boolean;
  defaultEmail?: string;
}) {
  const { login } = useAuth();
  const t = useMessages(authMessages);
  const { locale } = useLocale();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    const next: Errors = {};
    if (!EMAIL_PATTERN.test(email.trim())) next.email = t.validation.email;
    if (!password) next.password = t.validation.passwordRequired;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) {
      document.getElementById(`${idPrefix}-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const user = await login(email.trim(), password);
      onSuccess(user);
    } catch (error) {
      setFormError(translateApiError(error, locale));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {formError && <ErrorBox message={formError} />}
      <FormField id={`${idPrefix}-email`} label={t.fields.email} error={errors.email}>
        {(p) => (
          <Input {...p} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        )}
      </FormField>
      <FormField id={`${idPrefix}-password`} label={t.fields.password} error={errors.password}>
        {(p) => <PasswordInput controlProps={p} value={password} onChange={setPassword} autoComplete="current-password" />}
      </FormField>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubmitButton busy={busy} busyLabel={t.login.busy}>
          {t.login.submit}
        </SubmitButton>
        {showForgotLink && (
          <Link href="/passwort-vergessen" className="text-link">
            {t.login.forgot}
          </Link>
        )}
      </div>
    </form>
  );
}

export function RegisterForm({ idPrefix = 'register', onSuccess }: { idPrefix?: string; onSuccess: (user: User) => void }) {
  const { register } = useAuth();
  const t = useMessages(authMessages);
  const { locale } = useLocale();
  const [values, setValues] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const set = (key: keyof typeof values) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  const validate = (): Errors => {
    const next: Errors = {};
    const name = values.name.trim();
    if (name.length < 2 || name.length > 100) next.name = t.validation.name;
    if (!EMAIL_PATTERN.test(values.email.trim())) next.email = t.validation.email;
    if (values.phone.trim().length > 30) next.phone = t.validation.phone;
    if (values.password.length < 8 || values.password.length > 72) next.password = t.validation.passwordLength;
    if (!next.password && values.confirm !== values.password) next.confirm = t.validation.mismatch;
    return next;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    const next = validate();
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) {
      document.getElementById(`${idPrefix}-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      // `locale` sets the account's preferred language (emails, later visits)
      const payload = {
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        locale,
        ...(values.phone.trim() && { phone: values.phone.trim() }),
      };
      const user = await register(payload);
      onSuccess(user);
    } catch (error) {
      setFormError(translateApiError(error, locale));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {formError && <ErrorBox message={formError} />}
      <FormField id={`${idPrefix}-name`} label={t.fields.name} error={errors.name}>
        {(p) => <Input {...p} autoComplete="name" maxLength={100} value={values.name} onChange={(e) => set('name')(e.target.value)} className={inputClass} />}
      </FormField>
      <FormField id={`${idPrefix}-email`} label={t.fields.email} error={errors.email}>
        {(p) => (
          <Input {...p} type="email" inputMode="email" autoComplete="email" value={values.email} onChange={(e) => set('email')(e.target.value)} className={inputClass} />
        )}
      </FormField>
      <FormField id={`${idPrefix}-phone`} label={t.fields.phone} optional error={errors.phone} hint={t.fields.phoneHint}>
        {(p) => (
          <Input {...p} type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={values.phone} onChange={(e) => set('phone')(e.target.value)} className={inputClass} />
        )}
      </FormField>
      <FormField id={`${idPrefix}-password`} label={t.fields.password} error={errors.password} hint={t.fields.passwordHint}>
        {(p) => <PasswordInput controlProps={p} value={values.password} onChange={set('password')} autoComplete="new-password" />}
      </FormField>
      <FormField id={`${idPrefix}-confirm`} label={t.fields.confirm} error={errors.confirm}>
        {(p) => <PasswordInput controlProps={p} value={values.confirm} onChange={set('confirm')} autoComplete="new-password" />}
      </FormField>
      <p className="m-0 text-xs leading-relaxed text-muted-grey">
        {t.register.legalBefore}
        <Link href="/agb" className="font-bold text-pine underline underline-offset-2">
          {t.register.terms}
        </Link>
        {t.register.legalMid}
        <Link href="/datenschutz" className="font-bold text-pine underline underline-offset-2">
          {t.register.privacy}
        </Link>
        {t.register.legalAfter}
      </p>
      <SubmitButton busy={busy} busyLabel={t.register.busy}>
        {t.register.submit}
      </SubmitButton>
    </form>
  );
}
