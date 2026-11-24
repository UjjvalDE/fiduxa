'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/componets/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/componets/ui/tabs';
import { api, qs } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminEmail, AdminEmailListResponse, AdminEmailStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ConfirmAction } from '../_components/confirm-action';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, PaginationBar } from '../_components/states';
import { useApi, useErrorText, useQueryParams } from '../_components/use-api';
import messages from './_messages';

const KEYS = ['status', 'search', 'page'] as const;

const TAB_STATUSES: AdminEmailStatus[] = ['queued', 'sent', 'failed'];

const STATUS_CLASSES: Record<AdminEmailStatus, string> = {
  queued: 'bg-amber-50 text-amber-800 border-amber-200',
  sent: 'bg-mint text-pine border-sage',
  failed: 'bg-red-50 text-red-700 border-red-200',
};

function EmailList() {
  const t = useMessages(messages);
  const f = useFormat();
  const errorText = useErrorText();
  const { values: params, setParams } = useQueryParams(KEYS);
  const status = (params.status ?? '') as AdminEmailStatus | '';
  const page = Number(params.page) || 1;
  const search = params.search ?? '';
  const [draft, setDraft] = useState(search);

  useEffect(() => setDraft(search), [search]);

  const { data, error, loading, reload } = useApi<AdminEmailListResponse>(
    `/admin/emails${qs({ status, search, page, limit: 25 })}`
  );

  const resend = async (email: AdminEmail) => {
    try {
      const res = await api.post<{ email: AdminEmail }>(`/admin/emails/${email._id}/resend`);
      const next = res.email.status;
      if (next === 'sent') toast.success(t.resent);
      else if (next === 'queued') toast.warning(t.resentQueued);
      else toast.error(t.resentFailed);
      reload();
    } catch (err) {
      throw new Error(errorText(err));
    }
  };

  const count = (value: AdminEmailStatus) => data?.counts?.[value];

  return (
    <>
      <PageHeader title={t.title} description={t.description} />

      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setParams({ search: draft.trim(), page: '' });
        }}
      >
        <label className="flex-1 min-w-[240px] text-sm">
          <span className="mb-1 block font-medium text-charcoal">{t.searchLabel}</span>
          <Input
            type="search"
            value={draft}
            placeholder={t.searchPlaceholder}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
      </form>

      <Tabs value={status} onValueChange={(value) => setParams({ status: value, page: '' })} className="mb-4">
        <TabsList aria-label={t.tabsLabel} className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="">{t.all}</TabsTrigger>
          {TAB_STATUSES.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t.status[value]}
              {count(value) !== undefined && (
                <span className="ml-1.5 rounded-full bg-cream px-1.5 text-xs tabular-nums text-muted-grey">{count(value)}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading && !data ? (
        <ListSkeleton label={t.loading} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.emails.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyText} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border bg-white">
            <table className="w-full min-w-[900px] text-sm">
              <caption className="sr-only">{t.caption}</caption>
              <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.colRecipient}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.colSubject}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.colStatus}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.colAttempts}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.colCreated}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.colSent}</th>
                  <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">{t.colActions}</span></th>
                </tr>
              </thead>
              <tbody>
                {data.emails.map((email) => (
                  <tr key={email._id} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-charcoal">{email.to}</div>
                      {email.bookingRef && (
                        <Link href={`/admin/buchungen?search=${encodeURIComponent(email.bookingRef)}`} className="text-xs text-pine hover:underline">
                          {email.bookingRef}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>{email.subject}</div>
                      {email.template && <div className="text-xs text-muted-grey">{email.template}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                          STATUS_CLASSES[email.status]
                        )}
                      >
                        {t.status[email.status] ?? email.status}
                      </span>
                      {email.lastError && email.status !== 'sent' && (
                        <div className="mt-1 max-w-xs break-words text-xs text-red-700">{email.lastError}</div>
                      )}
                      {email.status === 'queued' && email.nextAttemptAt && (
                        <div className="mt-1 text-xs text-muted-grey">{t.nextAttempt(f.dateTime(email.nextAttemptAt))}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{email.attempts}</td>
                    <td className="px-4 py-3 text-muted-grey">{f.dateTime(email.createdAt)}</td>
                    <td className="px-4 py-3 text-muted-grey">
                      {f.dateTime(email.sentAt)}
                      {email.resentAt && <div className="text-xs">{t.resentAt(f.dateTime(email.resentAt))}</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ConfirmAction
                        trigger={
                          <>
                            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" /> {t.resend}
                          </>
                        }
                        triggerSize="sm"
                        triggerVariant={email.status === 'failed' ? 'default' : 'outline'}
                        title={t.resendTitle}
                        description={t.resendText(email.to)}
                        confirmLabel={t.resendConfirm}
                        onConfirm={() => resend(email)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar pagination={data.pagination} onPageChange={(next) => setParams({ page: next })} />
        </>
      )}
    </>
  );
}

export default function EmailsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <EmailList />
    </Suspense>
  );
}
