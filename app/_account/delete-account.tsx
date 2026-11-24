'use client';

// GDPR self-service for customers and cleaners: data export + account deletion.
// Server rules (DELETE /users/me): upcoming bookings / assigned jobs block the
// deletion (409 OPEN_BOOKINGS / OPEN_JOBS); password-less (Google/Apple)
// accounts confirm with their email; afterwards the session is gone.
import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Download, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';

import messages from './messages';

interface OpenBooking {
  id: string;
  reference: string;
  preferredDate: string;
  status: string;
}

interface DeletionCheck {
  role: 'consumer' | 'worker' | 'admin';
  canDelete: boolean;
  blockedBy: 'OPEN_BOOKINGS' | 'OPEN_JOBS' | 'ADMIN' | null;
  confirmWith: 'password' | 'email';
  openBookings: OpenBooking[];
  unpaidEarnings: { count: number; cents: number };
}

/** "Download my data" – fetches the JSON export with the session and saves it */
export function DataExportButton() {
  const t = useMessages(messages).del;
  const { locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const data = await api.get<Record<string, unknown>>('/users/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fiduxa-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t.exported);
    } catch (e) {
      toast.error(translateApiError(e, locale));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button type="button" variant="outline" onClick={run} disabled={busy} className="min-h-11 gap-2">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
      {busy ? t.exporting : t.exportButton}
    </Button>
  );
}

export function DeleteAccountSection() {
  const t = useMessages(messages).del;
  const f = useFormat();
  const { locale } = useLocale();
  const { user, logout } = useAuth();
  const router = useRouter();
  const ids = useId();
  const [check, setCheck] = useState<DeletionCheck | null>(null);
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<DeletionCheck>('/users/me/deletion-check')
      .then(setCheck)
      .catch((e) => setError(translateApiError(e, locale)));
  }, [locale]);
  useEffect(load, [load]);

  const isWorker = check?.role === 'worker';
  const blocked = check && !check.canDelete;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!check || !understood || !secret.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteWithBody('/users/me', check.confirmWith === 'password' ? { password: secret } : { confirmEmail: secret.trim() });
      toast.success(t.done);
      logout();
      router.replace('/');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && Array.isArray(e.body?.bookings)) {
        // Something became upcoming meanwhile – show the fresh list
        setOpen(false);
        load();
      } else if (e instanceof ApiError && e.status === 400) {
        setError(check.confirmWith === 'password' ? t.wrongPassword : t.wrongEmail);
      } else {
        setError(translateApiError(e, locale));
      }
    } finally {
      setBusy(false);
    }
  };

  const bookingHref = (b: OpenBooking) => (isWorker ? `/worker/jobs/${b.id}` : `/konto/buchungen/${b.id}`);

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <h3 className="m-0 text-base font-bold text-pine-dark">{t.exportTitle}</h3>
        <p className="m-0 text-sm text-muted-grey">{t.exportText}</p>
        <div>
          <DataExportButton />
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-red-200 bg-red-50/40 p-4">
        <h3 className="m-0 flex items-center gap-2 text-base font-bold text-red-800">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {t.title}
        </h3>
        <p className="m-0 text-sm text-charcoal">{t.intro}</p>
        <ul className="m-0 grid gap-1 pl-5 text-sm text-charcoal">
          {t.consequences.map((c) => (
            <li key={c}>{c}</li>
          ))}
          {isWorker && t.workerConsequences.map((c) => <li key={c}>{c}</li>)}
        </ul>

        {!check && !error && (
          <p className="m-0 inline-flex items-center gap-2 text-sm text-muted-grey">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.loading}
          </p>
        )}

        {isWorker && check.unpaidEarnings.cents > 0 && <p className="m-0 text-sm font-medium text-pine-dark">{t.unpaid(f.euro(check.unpaidEarnings.cents))}</p>}

        {blocked && (
          <div role="status" className="grid gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="m-0">{check.blockedBy === 'ADMIN' ? t.blockedAdmin : isWorker ? t.blockedWorker : t.blockedCustomer}</p>
            <ul className="m-0 grid gap-1 pl-0">
              {check.openBookings.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {b.reference} · {f.date(b.preferredDate)}
                  </span>
                  <Link href={bookingHref(b)} className="font-semibold text-pine underline-offset-2 hover:underline">
                    {isWorker ? t.openJob : t.openBooking}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {check && check.canDelete && !open && (
          <div>
            <Button type="button" variant="destructive" className="min-h-11 gap-2" onClick={() => setOpen(true)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> {t.start}
            </Button>
          </div>
        )}

        {check && check.canDelete && open && (
          <form onSubmit={submit} className="grid gap-3" noValidate>
            <h4 className="m-0 text-sm font-bold text-red-800">{t.confirmTitle}</h4>
            <div className="grid gap-1.5">
              <Label htmlFor={`${ids}-secret`}>{check.confirmWith === 'password' ? t.confirmPassword : t.confirmEmail(user?.email ?? '')}</Label>
              <Input
                id={`${ids}-secret`}
                type={check.confirmWith === 'password' ? 'password' : 'email'}
                autoComplete={check.confirmWith === 'password' ? 'current-password' : 'email'}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${ids}-error` : undefined}
                className="h-11 text-base sm:text-sm"
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>{t.checkbox}</span>
            </label>
            {error && (
              <p id={`${ids}-error`} role="alert" className="m-0 text-sm font-medium text-red-700">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="destructive" disabled={!understood || !secret.trim() || busy} className="min-h-11 gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {busy ? t.deleting : t.submit}
              </Button>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => { setOpen(false); setSecret(''); setError(null); }}>
                {t.cancel}
              </Button>
            </div>
          </form>
        )}
        {error && !open && <p role="alert" className="m-0 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}
