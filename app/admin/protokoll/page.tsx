'use client';

import { Suspense, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Filter, ScrollText } from 'lucide-react';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { qs } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AuditLog, Pagination } from '@/lib/types';

import { EmptyState, ErrorState, ListSkeleton, NativeSelect, PageHeader, PaginationBar } from '../_components/states';
import { useApi, useQueryParams } from '../_components/use-api';
import messages from './_messages';

const KEYS = ['entityId', 'action', 'page'] as const;

function entityHref(log: AuditLog): string | null {
  if (log.entityType === 'Booking') return `/admin/buchungen/${log.entityId}`;
  if (log.entityType === 'BusinessRequest') return `/admin/anfragen/${log.entityId}`;
  if (log.entityType === 'Payment') return '/admin/zahlungen';
  if (log.entityType === 'User') {
    if (log.action.startsWith('worker.')) return `/admin/reinigungskraefte/${log.entityId}`;
    if (log.action.startsWith('customer.')) return `/admin/kunden/${log.entityId}`;
  }
  return null;
}

function compactJson(value: unknown): string {
  if (value === null || value === undefined) return '–';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function JsonCell({ label, value }: { label: string; value: unknown }) {
  const t = useMessages(messages);
  const text = compactJson(value);
  if (text === '–' || text === '{}') return <span className="text-muted-grey">–</span>;
  if (text.length <= 80) {
    return <code className="break-all rounded bg-cream px-1.5 py-0.5 font-mono text-xs text-charcoal">{text}</code>;
  }
  return (
    <details className="text-xs">
      <summary className="cursor-pointer rounded text-pine hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {t.show(label)}
      </summary>
      <pre className="mt-1 max-h-60 max-w-md overflow-auto whitespace-pre-wrap break-all rounded bg-cream p-2 font-mono text-charcoal">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function AuditList() {
  const router = useRouter();
  const { values, setParams } = useQueryParams(KEYS);
  const [entityDraft, setEntityDraft] = useState(values.entityId);
  const ids = { entity: useId(), action: useId() };
  const t = useMessages(messages);
  const f = useFormat();
  useEffect(() => setEntityDraft(values.entityId), [values.entityId]);

  const { data, error, loading, reload } = useApi<{ logs: AuditLog[]; pagination: Pagination }>(
    `/admin/audit-logs${qs({ ...values, limit: 25 })}`
  );
  const hasFilters = Boolean(values.entityId || values.action);

  return (
    <>
      <PageHeader title={t.title} description={t.description} />

      <form
        role="search"
        aria-label={t.filterForm}
        className="mb-4 grid gap-3 rounded-2xl border border-border bg-white p-4 sm:grid-cols-[1fr_260px_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ entityId: entityDraft.trim() });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor={ids.entity}>{t.entityId}</Label>
          <Input
            id={ids.entity}
            value={entityDraft}
            onChange={(e) => setEntityDraft(e.target.value)}
            placeholder={t.entityPlaceholder}
            className="font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={ids.action}>{t.action}</Label>
          <NativeSelect id={ids.action} value={values.action} onChange={(e) => setParams({ action: e.target.value })}>
            <option value="">{t.allActions}</option>
            {Object.entries(t.actions).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="outline">
            <Filter className="mr-2 h-4 w-4" aria-hidden="true" />
            {t.filter}
          </Button>
          {hasFilters && (
            <Button type="button" variant="ghost" onClick={() => router.replace('/admin/protokoll')}>
              {t.reset}
            </Button>
          )}
        </div>
      </form>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <ListSkeleton label={t.loading} />
      ) : data.logs.length === 0 ? (
        <EmptyState icon={ScrollText} title={t.emptyTitle} description={hasFilters ? t.emptyFiltered : undefined} />
      ) : (
        <div aria-busy={loading}>
          <div className="overflow-x-auto rounded-2xl border border-border bg-white">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">{t.caption}</caption>
              <thead>
                <tr className="border-b border-border bg-cream/60 text-left text-xs font-medium text-muted-grey">
                  <th scope="col" className="px-4 py-3">
                    {t.colTime}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t.colActor}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t.colAction}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t.colEntity}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t.colBefore}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t.colAfter}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border align-top">
                {data.logs.map((log) => {
                  const href = entityHref(log);
                  return (
                    <tr key={log._id}>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-grey">{f.dateTime(log.createdAt)}</td>
                      <td className="px-4 py-3">
                        {log.actor ? (
                          <>
                            <span className="text-charcoal">{log.actor.name}</span>
                            <span className="block text-xs text-muted-grey">{log.actor.email}</span>
                          </>
                        ) : (
                          <span className="text-muted-grey">{t.system}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-charcoal">{t.actions[log.action] ?? log.action}</span>
                        <span className="block font-mono text-[11px] text-muted-grey">{log.action}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-charcoal">{t.entities[log.entityType] ?? log.entityType}</span>
                        <span className="block font-mono text-[11px]">
                          {href ? (
                            <Link href={href} className="text-pine hover:underline">
                              {log.entityId}
                            </Link>
                          ) : (
                            <span className="text-muted-grey">{log.entityId}</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <JsonCell label={t.colBefore} value={log.before} />
                      </td>
                      <td className="px-4 py-3">
                        <JsonCell label={t.colAfter} value={log.after} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar pagination={data.pagination} disabled={loading} onPageChange={(page) => setParams({ page })} />
        </div>
      )}
    </>
  );
}

export default function AdminAuditLogPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <AuditList />
    </Suspense>
  );
}
