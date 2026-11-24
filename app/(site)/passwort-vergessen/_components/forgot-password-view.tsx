'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';

import { api } from '@/lib/api';
import { useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import { Input } from '@/componets/ui/input';
import authMessages from '../../buchung/_auth-messages';
import { SubmitButton } from '../../buchung/_components/auth-forms';
import { AuthShell } from '../../buchung/_components/auth-shell';
import { ErrorBox, FormField, inputClass } from '../../buchung/_components/form-field';
import { EMAIL_PATTERN } from '../../buchung/_lib/messages';

export function ForgotPasswordView() {
  const t = useMessages(authMessages);
  const { locale } = useLocale();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const busyRef = useRef(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    setFormError(null);
    if (!EMAIL_PATTERN.test(email.trim())) {
      setFieldError(t.validation.email);
      document.getElementById('forgot-email')?.focus();
      return;
    }
    setFieldError(undefined);
    busyRef.current = true;
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (error) {
      setFormError(translateApiError(error, locale));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <AuthShell
      eyebrow={t.passwordEyebrow}
      title={t.forgot.title}
      lead={t.forgot.lead}
      footer={
        <p className="m-0">
          {t.forgot.remembered}{' '}
          <Link href="/login" className="font-bold text-pine underline underline-offset-2">
            {t.forgot.toLogin}
          </Link>
        </p>
      }
    >
      {sent ? (
        <div role="status" className="grid gap-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-mint text-pine">
            <MailCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="m-0 text-xl font-bold text-pine-dark">{t.forgot.sentTitle}</h2>
          <p className="m-0 text-sm leading-relaxed text-muted-grey">{t.forgot.sentText}</p>
          <button type="button" className="text-link w-fit" onClick={() => setSent(false)}>
            {t.forgot.otherEmail}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-4">
          {formError && <ErrorBox message={formError} />}
          <FormField id="forgot-email" label={t.fields.email} error={fieldError}>
            {(p) => (
              <Input {...p} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            )}
          </FormField>
          <SubmitButton busy={busy} busyLabel={t.forgot.busy}>
            {t.forgot.submit}
          </SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
