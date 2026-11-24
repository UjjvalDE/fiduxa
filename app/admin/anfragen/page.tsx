'use client';

import { Suspense, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Building2, Search } from 'lucide-react';

import { StatusBadge } from '@/componets/site/status-badge';
import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componets/ui/table';
import { qs } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { BusinessRequest, BusinessRequestStatus, Pagination } from '@/lib/types';

import { EmptyState, ErrorState, ListSkeleton, NativeSelect, PageHeader, PaginationBar } from '../_components/states';
import { useApi, useQueryParams } from '../_components/use-api';
import messages from './_messages';

const KEYS = ['status', 'search', 'page'] as const;

function RequestsList() {
  const t = useMessages(messages);
  const c = useMessages(common);
  const f = useFormat();
  const { values, setParams } = useQueryParams(KEYS);
  const [draft, setDraft] = useState(values.search);
  const ids = { search: useId(), status: useId() };
  useEffect(() => setDraft(values.search), [values.search]);

  const { data, error, loading, reload } = useApi<{ requests: BusinessRequest[]; pagination: Pagination }>(
    `/admin/business-requests${qs({ ...values, limit: 20 })}`
  );

  return (
    <>
      <PageHeader title={t.title} description={t.description} />

      <form
        role="search"
        aria-label={t.filterForm}
        className="mb-4 grid gap-3 rounded-2xl border border-border bg-white p-4 sm:grid-cols-[1fr_220px]"
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ search: draft.trim() });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor={ids.search}>{t.search}</Label>
          <div className="flex gap-2">
            <Input id={ids.search} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.searchPlaceholder} />
            <Button type="submit" variant="outline" size="icon" aria-label={t.searchButton}>
              <Search className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={ids.status}>{t.status}</Label>
          <NativeSelect id={ids.status} value={values.status} onChange={(e) => setParams({ status: e.target.value })}>
            <option value="">{t.allStatuses}</option>
            {(Object.keys(c.businessStatus) as BusinessRequestStatus[]).map((s) => (
              <option key={s} value={s}>
                {c.businessStatus[s].label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </form>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <ListSkeleton label={t.loading} />
      ) : data.requests.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t.emptyTitle}
          description={values.status || values.search ? t.emptyFiltered : t.emptyNone}
        />
      ) : (
        <div aria-busy={loading}>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-white md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-cream/60">
                  <TableHead scope="col">{t.colReference}</TableHead>
                  <TableHead scope="col">{t.colCompany}</TableHead>
                  <TableHead scope="col">{t.colContact}</TableHead>
                  <TableHead scope="col">{t.colPremises}</TableHead>
                  <TableHead scope="col">{t.colPostcode}</TableHead>
                  <TableHead scope="col">{t.colStatus}</TableHead>
                  <TableHead scope="col">{t.colCreated}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.requests.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell>
                      <Link href={`/admin/anfragen/${r._id}`} className="font-mono text-xs font-semibold text-pine hover:underline">
                        {r.reference}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium text-charcoal">{r.company.name}</TableCell>
                    <TableCell className="text-sm">
                      {r.company.contactPerson}
                      <span className="block text-xs text-muted-grey">{r.company.email}</span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.premises[r.premises.type] ?? r.premises.type} · {r.premises.areaM2} m²
                    </TableCell>
                    <TableCell className="text-sm">{r.site.postcode}</TableCell>
                    <TableCell>
                      <StatusBadge kind="business" status={r.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-grey">{f.dateTime(r.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-3 md:hidden">
            {data.requests.map((r) => (
              <li key={r._id}>
                <Link
                  href={`/admin/anfragen/${r._id}`}
                  className="block rounded-2xl border border-border bg-white p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-charcoal">{r.company.name}</p>
                      <p className="font-mono text-xs text-muted-grey">{r.reference}</p>
                    </div>
                    <StatusBadge kind="business" status={r.status} />
                  </div>
                  <p className="mt-2 text-sm text-charcoal">
                    {t.premises[r.premises.type] ?? r.premises.type} · {r.premises.areaM2} m² · {r.site.postcode}
                  </p>
                  <p className="text-xs text-muted-grey">{f.dateTime(r.createdAt)}</p>
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

export default function AdminBusinessRequestsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <RequestsList />
    </Suspense>
  );
}
