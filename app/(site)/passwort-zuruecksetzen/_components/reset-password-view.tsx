'use client';

// /passwort-zuruecksetzen?token=…        → "Passwort zurücksetzen" (link from /passwort-vergessen)
// /passwort-zuruecksetzen?token=…&neu=1  → "Passwort festlegen" (invitation of a new admin)
// POST /auth/reset-password { token, password } – single use, logs out all sessions.
// Customers, cleaners and admins use the same page; after login the usual
// role-based redirect applies.
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CircleCheck, Link2Off } from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import authMessages from '../../buchung/_auth-messages';
import { PasswordInput, SubmitButton } from '../../buchung/_components/auth-forms';
import { AuthShell } from '../../buchung/_components/auth-shell';
import { apiFieldErrors } from '../../buchung/_lib/messages';
import { ErrorBox, FormField } from '../../buchung/_components/form-field';

/** Server answer for a used, unknown or expired token */
const isInvalidLink = (error: unknown) =>
  error instanceof ApiError && (error.status === 400 || error.status === 404 || error.status === 410) && /reset link|token|expired/i.test(error.message);

export function ResetPasswordView() {
  const t = useMessages(authMessages);
  const { locale } = useLocale();
  const params = useSearchParams();
  const token = (params.get('token') ?? '').trim();
  const isNew = params.get('neu') === '1';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const busyRef = useRef(false);

  const title = isNew ? t.reset.titleNew : t.reset.title;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    const next: typeof errors = {};
    if (password.length < 8 || password.length > 72) next.password = t.validation.passwordLength;
    else if (confirm !== password) next.confirm = t.validation.mismatch;
    setErrors(next);
    setFormError(null);
    if (next.password || next.confirm) {
      document.getElementById(next.password ? 'reset-password' : 'reset-confirm')?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (error) {
      if (isInvalidLink(error)) {
        setLinkInvalid(true);
        return;
      }
      const fields = apiFieldErrors(error, locale, { password: t.validation.passwordLength });
      if (fields.password) {
        setErrors({ password: fields.password });
        document.getElementById('reset-password')?.focus();
      } else if (fields.token) {
        setLinkInvalid(true);
      } else {
        setFormError(translateApiError(error, locale));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // No token in the URL, or the server rejected it
  if (!token || linkInvalid) {
    return (
      <AuthShell eyebrow={t.passwordEyebrow} title={token ? t.reset.expiredTitle : t.reset.invalidTitle}>
        <div className="grid gap-4" role={linkInvalid ? 'alert' : undefined}>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-900" aria-hidden="true">
            <Link2Off className="h-5 w-5" />
          </span>
          <p className="m-0 text-sm leading-relaxed text-muted-grey">{token ? t.reset.expiredText : t.reset.invalidText}</p>
          <Link href="/passwort-vergessen" className="button button-small w-fit">
            {t.reset.requestNew}
          </Link>
          <Link href="/login" className="text-link w-fit">
            {t.forgot.toLogin}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow={t.passwordEyebrow} title={title} lead={done ? undefined : isNew ? t.reset.leadNew : t.reset.lead}>
      {done ? (
        <div role="status" className="grid gap-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-mint text-pine">
            <CircleCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="m-0 text-xl font-bold text-pine-dark">{isNew ? t.reset.doneTitleNew : t.reset.doneTitle}</h2>
          <p className="m-0 text-sm leading-relaxed text-muted-grey">{isNew ? t.reset.doneTextNew : t.reset.doneText}</p>
          <Link href="/login" className="button button-small w-fit">
            {t.reset.loginNow}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-4">
          {formError && <ErrorBox message={formError} />}
          <FormField id="reset-password" label={t.reset.newPassword} error={errors.password} hint={t.reset.newPasswordHint}>
            {(p) => <PasswordInput controlProps={p} value={password} onChange={setPassword} autoComplete="new-password" />}
          </FormField>
          <FormField id="reset-confirm" label={t.reset.confirm} error={errors.confirm}>
            {(p) => <PasswordInput controlProps={p} value={confirm} onChange={setConfirm} autoComplete="new-password" />}
          </FormField>
          <SubmitButton busy={busy} busyLabel={t.reset.busy}>
            {isNew ? t.reset.submitNew : t.reset.submit}
          </SubmitButton>
          {!isNew && (
            <Link href="/passwort-vergessen" className="text-link w-fit">
              {t.reset.requestNew}
            </Link>
          )}
        </form>
      )}
    </AuthShell>
  );
}
