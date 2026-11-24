'use client';

import { Suspense, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, LogIn } from 'lucide-react';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Skeleton } from '@/componets/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { homeForRole, useAuth } from '@/lib/auth';
import { useMessages } from '@/lib/i18n/client';
import { useErrorText } from '@/app/admin/_components/use-api';

import messages from '../_messages';

const MIN = 12;
const MAX = 128;

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md rounded-2xl border border-border bg-white p-6 shadow-sm">{children}</div>;
}

function InvalidInvitation({ reason }: { reason: 'missing' | 'invalid' }) {
  const t = useMessages(messages).invitation;
  return (
    <Panel>
      <div role="alert" className="space-y-3">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-red-50 text-red-700">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-bold text-pine-dark">
          {reason === 'missing' ? t.missingTitle : t.invalidTitle}
        </h1>
        <p className="text-sm text-charcoal">
          {reason === 'missing' ? t.missingText : t.invalidText}
        </p>
        <p className="text-sm text-muted-grey">
          {t.alreadySet}{' '}
          <Link href="/login?next=/worker" className="font-semibold text-pine underline">
            {t.loginHere}
          </Link>
        </p>
      </div>
    </Panel>
  );
}

function SuccessLogin({ password }: { password: string }) {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailId = useId();
  const t = useMessages(messages).invitation;
  const errorText = useErrorText();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(t.errEmail);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const user = await login(email.trim(), password);
      router.replace(homeForRole(user.role));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? t.errEmailMismatch
          : errorText(err)
      );
      setPending(false);
    }
  };

  return (
    <Panel>
      <div className="space-y-4">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-mint text-pine">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <div role="status">
          <h1 className="text-xl font-bold text-pine-dark">{t.readyTitle}</h1>
          <p className="mt-1 text-sm text-charcoal">
            {t.readyText}
          </p>
        </div>
        <form onSubmit={submit} noValidate className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={emailId}>{t.email}</Label>
            <Input
              id={emailId}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              className="h-12 text-base"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="h-12 w-full text-base">
            {pending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> : <LogIn className="mr-2 h-5 w-5" aria-hidden="true" />}
            {t.loginStart}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-grey">
          {t.or}{' '}
          <Link href="/login?next=/worker" className="font-semibold text-pine underline">
            {t.normalLogin}
          </Link>
        </p>
      </div>
    </Panel>
  );
}

function AcceptInvitation() {
  const params = useSearchParams();
  const token = params.get('token')?.trim() ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<'form' | 'done' | 'invalid'>('form');
  const ids = { pw: useId(), confirm: useId() };
  const t = useMessages(messages).invitation;
  const errorText = useErrorText();

  if (!token) return <InvalidInvitation reason="missing" />;
  if (state === 'invalid') return <InvalidInvitation reason="invalid" />;
  if (state === 'done') return <SuccessLogin password={password} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (password.length < MIN) next.password = t.errMin(MIN);
    else if (password.length > MAX) next.password = t.errMax(MAX);
    if (confirm !== password) next.confirm = t.errMismatch;
    setErrors(next);
    if (Object.keys(next).length) return;

    setPending(true);
    setError(null);
    try {
      await api.post('/worker/accept-invitation', { token, password });
      setState('done');
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setState('invalid');
      else setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Panel>
      <div className="space-y-4">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-mint text-pine">
          <KeyRound className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-pine-dark">{t.welcome}</h1>
          <p className="mt-1 text-sm text-charcoal">{t.intro}</p>
        </div>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={ids.pw}>{t.newPassword}</Label>
            <div className="relative">
              <Input
                id={ids.pw}
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                maxLength={MAX}
                onChange={(e) => setPassword(e.target.value)}
                disabled={pending}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={`${ids.pw}-hint`}
                className="h-12 pr-12 text-base"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md text-muted-grey hover:text-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={show ? t.hidePassword : t.showPassword}
                aria-pressed={show}
              >
                {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
            <p id={`${ids.pw}-hint`} className={errors.password ? 'text-sm text-red-700' : 'text-sm text-muted-grey'}>
              {errors.password ?? t.passwordHint(password.length, MIN)}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.confirm}>{t.repeat}</Label>
            <Input
              id={ids.confirm}
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              maxLength={MAX}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={pending}
              aria-invalid={Boolean(errors.confirm)}
              aria-describedby={errors.confirm ? `${ids.confirm}-err` : undefined}
              className="h-12 text-base"
            />
            {errors.confirm && (
              <p id={`${ids.confirm}-err`} className="text-sm text-red-700">
                {errors.confirm}
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="h-12 w-full text-base">
            {pending && <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />}
            {t.activate}
          </Button>
        </form>
      </div>
    </Panel>
  );
}

function LoadingFallback() {
  const t = useMessages(messages).invitation;
  return (
    <div className="mx-auto max-w-md space-y-3" role="status" aria-label={t.loading}>
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

export default function WorkerInvitationPage() {
  return (
    <Suspense
      fallback={<LoadingFallback />}
    >
      <AcceptInvitation />
    </Suspense>
  );
}
