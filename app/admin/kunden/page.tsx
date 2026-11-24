'use client';

import { Suspense, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Search, Users } from 'lucide-react';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componets/ui/table';
import { qs } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminCustomer, Pagination } from '@/lib/types';

import { ActiveBadge, EmptyState, ErrorState, ListSkeleton, PageHeader, PaginationBar } from '../_components/states';
import { useApi, useQueryParams } from '../_components/use-api';
import messages from './_messages';

const KEYS = ['search', 'page'] as const;

function CustomersList() {
  const t = useMessages(messages);
  const f = useFormat();
  const { values, setParams } = useQueryParams(KEYS);
  const [draft, setDraft] = useState(values.search);
  const searchId = useId();
  useEffect(() => setDraft(values.search), [values.search]);

  const { data, error, loading, reload } = useApi<{ customers: AdminCustomer[]; pagination: Pagination }>(
    `/admin/customers${qs({ ...values, limit: 20 })}`
  );

  return (
    <>
      <PageHeader title={t.title} description={t.description} />

      <form
        role="search"
        aria-label={t.searchForm}
        className="mb-4 flex max-w-xl items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ search: draft.trim() });
        }}
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={searchId}>{t.search}</Label>
          <Input id={searchId} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.searchPlaceholder} />
        </div>
        <Button type="submit" variant="outline">
          <Search className="mr-2 h-4 w-4" aria-hidden="true" />
          {t.searchButton}
        </Button>
      </form>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <ListSkeleton label={t.loading} />
      ) : data.customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t.emptyTitle}
          description={values.search ? t.emptySearch : t.emptyNone}
        />
      ) : (
        <div aria-busy={loading}>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-white md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-cream/60">
                  <TableHead scope="col">{t.colName}</TableHead>
                  <TableHead scope="col">{t.colContact}</TableHead>
                  <TableHead scope="col" className="text-right">
                    {t.colBookings}
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    {t.colCompleted}
                  </TableHead>
                  <TableHead scope="col">{t.colLastBooking}</TableHead>
                  <TableHead scope="col">{t.colRegistered}</TableHead>
                  <TableHead scope="col">{t.colStatus}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/admin/kunden/${c.id}`} className="font-medium text-pine hover:underline">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.email}
                      <span className="block text-xs text-muted-grey">{c.phone || '–'}</span>
                    </TableCell>
                    <TableCell className="text-right">{c.bookingCount}</TableCell>
                    <TableCell className="text-right">{c.completedCount}</TableCell>
                    <TableCell className="text-xs text-muted-grey">{f.dateTime(c.lastBookingAt)}</TableCell>
                    <TableCell className="text-xs text-muted-grey">{f.dateTime(c.createdAt)}</TableCell>
                    <TableCell>
                      <ActiveBadge active={c.isActive} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-3 md:hidden">
            {data.customers.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/kunden/${c.id}`}
                  className="block rounded-2xl border border-border bg-white p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-charcoal">{c.name}</p>
                    <ActiveBadge active={c.isActive} />
                  </div>
                  <p className="text-sm text-muted-grey">{c.email}</p>
                  <p className="mt-2 text-sm text-charcoal">
                    {t.mobileCounts(c.bookingCount, c.completedCount)}
                  </p>
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

export default function AdminCustomersPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <CustomersList />
    </Suspense>
  );
}
