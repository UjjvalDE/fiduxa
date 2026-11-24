'use client';

import { Suspense, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Search, Sparkles, UserPlus, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { StatusBadge } from '@/componets/site/status-badge';
import { Button } from '@/componets/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/componets/ui/dialog';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componets/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/componets/ui/tabs';
import { api, ApiError, qs } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { LOCALES, LOCALE_NAMES, isLocale, type Locale } from '@/lib/i18n/config';
import common from '@/lib/i18n/messages/common';
import type { AdminWorker, Pagination, WorkerStatus } from '@/lib/types';

import { EmptyState, ErrorState, ListSkeleton, NativeSelect, PageHeader, PaginationBar } from '../_components/states';
import { useApi, useErrorText, useQueryParams } from '../_components/use-api';
import messages from './_messages';
import docMessages from '../dokumente/_messages';

const KEYS = ['status', 'search', 'page'] as const;

const TAB_STATUSES: WorkerStatus[] = ['pending_review', 'approved', 'invited', 'rejected', 'suspended'];

function InviteDialog({ onInvited }: { onInvited: () => void }) {
  const t = useMessages(messages);
  const errorText = useErrorText();
  const { locale: uiLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [inviteLocale, setInviteLocale] = useState<Locale>(uiLocale);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { name: useId(), email: useId(), phone: useId(), locale: useId() };

  const reset = () => {
    setForm({ name: '', email: '', phone: '' });
    setInviteLocale(uiLocale);
    setErrors({});
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = t.errName;
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = t.errEmail;
    if (form.phone.trim().length > 30) next.phone = t.errPhone;
    setErrors(next);
    if (Object.keys(next).length) return;

    setPending(true);
    setError(null);
    try {
      await api.post('/admin/workers/invite', {
        name: form.name.trim(),
        email: form.email.trim(),
        ...(form.phone.trim() && { phone: form.phone.trim() }),
        locale: inviteLocale,
      });
      toast.success(t.invited, { description: t.invitedText(form.name.trim()) });
      setOpen(false);
      reset();
      onInvited();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const fe = err.fieldErrors;
        setErrors({
          ...(fe.name && { name: t.checkName }),
          ...(fe.email && { email: t.checkEmail }),
          ...(fe.phone && { phone: t.checkPhone }),
        });
      }
      setError(
        err instanceof ApiError && err.status === 500 && !err.message.includes('invitation URL')
          ? t.mailFailed
          : errorText(err)
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
          {t.invite}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.invite}</DialogTitle>
          <DialogDescription>{t.inviteText}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          {(
            [
              ['name', t.name, 'text', 'name'],
              ['email', t.email, 'email', 'email'],
              ['phone', t.phoneOptional, 'tel', 'tel'],
            ] as const
          ).map(([key, label, type, autoComplete]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={ids[key]}>{label}</Label>
              <Input
                id={ids[key]}
                type={type}
                autoComplete={autoComplete}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                aria-invalid={Boolean(errors[key])}
                aria-describedby={errors[key] ? `${ids[key]}-err` : undefined}
                disabled={pending}
                required={key !== 'phone'}
              />
              {errors[key] && (
                <p id={`${ids[key]}-err`} className="text-xs text-red-700">
                  {errors[key]}
                </p>
              )}
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor={ids.locale}>{t.language}</Label>
            <NativeSelect
              id={ids.locale}
              value={inviteLocale}
              onChange={(e) => {
                if (isLocale(e.target.value)) setInviteLocale(e.target.value);
              }}
              aria-describedby={`${ids.locale}-hint`}
              disabled={pending}
            >
              {LOCALES.map((code) => (
                <option key={code} value={code} lang={code}>
                  {LOCALE_NAMES[code]}
                </option>
              ))}
            </NativeSelect>
            <p id={`${ids.locale}-hint`} className="text-xs text-muted-grey">
              {t.languageHint}
            </p>
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t.sendInvite}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Verified({ ok }: { ok: boolean }) {
  const t = useMessages(messages);
  return ok ? (
    <span className="inline-flex items-center gap-1 text-xs text-pine">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> {t.verified}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-muted-grey">
      <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> {t.open}
    </span>
  );
}

function WorkersList() {
  const t = useMessages(messages);
  const docT = useMessages(docMessages);
  const c = useMessages(common);
  const f = useFormat();
  const { values, setParams } = useQueryParams(KEYS);
  const [draft, setDraft] = useState(values.search);
  const searchId = useId();
  useEffect(() => setDraft(values.search), [values.search]);

  const { data, error, loading, reload } = useApi<{ workers: AdminWorker[]; pagination: Pagination }>(
    `/admin/workers${qs({ ...values, limit: 20 })}`
  );

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/dokumente">{docT.open}</Link>
            </Button>
            <InviteDialog onInvited={reload} />
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Tabs value={values.status || 'all'} onValueChange={(v) => setParams({ status: v === 'all' ? '' : v })}>
          <TabsList aria-label={t.tabsLabel} className="h-auto flex-wrap justify-start bg-white">
            <TabsTrigger value="all" className="data-[state=active]:bg-mint data-[state=active]:text-pine-dark">
              {t.tabAll}
            </TabsTrigger>
            {TAB_STATUSES.map((s) => (
              <TabsTrigger key={s} value={s} className="data-[state=active]:bg-mint data-[state=active]:text-pine-dark">
                {c.workerStatus[s].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <form
          role="search"
          aria-label={t.searchForm}
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setParams({ search: draft.trim() });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={searchId} className="sr-only">
              {t.search}
            </Label>
            <Input id={searchId} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.searchPlaceholder} />
          </div>
          <Button type="submit" variant="outline" size="icon" aria-label={t.searchButton}>
            <Search className="h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <ListSkeleton label={t.loading} />
      ) : data.workers.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={t.emptyTitle}
          description={values.status || values.search ? t.emptyFiltered : t.emptyNone}
        />
      ) : (
        <div aria-busy={loading}>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-white md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-cream/60">
                  <TableHead scope="col">{t.colName}</TableHead>
                  <TableHead scope="col">{t.colContact}</TableHead>
                  <TableHead scope="col">{t.colStatus}</TableHead>
                  <TableHead scope="col">{t.colAreas}</TableHead>
                  <TableHead scope="col">{t.colEmail}</TableHead>
                  <TableHead scope="col">{t.colBank}</TableHead>
                  <TableHead scope="col">{t.colCreated}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.workers.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>
                      <Link href={`/admin/reinigungskraefte/${w.id}`} className="font-medium text-pine hover:underline">
                        {w.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {w.email}
                      <span className="block text-xs text-muted-grey">{w.phone || '–'}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="worker" status={w.workerStatus} />
                    </TableCell>
                    <TableCell className="max-w-[220px] text-xs text-muted-grey">
                      {w.workerProfile?.serviceAreas?.length ? w.workerProfile.serviceAreas.join(', ') : '–'}
                    </TableCell>
                    <TableCell>
                      <Verified ok={w.emailVerified} />
                    </TableCell>
                    <TableCell>
                      <Verified ok={w.bankDetails?.status === 'saved'} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-grey">{f.dateTime(w.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-3 md:hidden">
            {data.workers.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/admin/reinigungskraefte/${w.id}`}
                  className="block rounded-2xl border border-border bg-white p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-charcoal">{w.name}</p>
                    <StatusBadge kind="worker" status={w.workerStatus} />
                  </div>
                  <p className="text-sm text-muted-grey">{w.email}</p>
                  {w.workerProfile?.serviceAreas?.length ? (
                    <p className="mt-2 text-xs text-muted-grey">{w.workerProfile.serviceAreas.join(', ')}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>

          <PaginationBar pagination={data.pagination} disabled={loading} onPageChange={(page) => setParams({ page })} />
        </div>
      )}
    </>
  );
}

export default function AdminWorkersPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <WorkersList />
    </Suspense>
  );
}
