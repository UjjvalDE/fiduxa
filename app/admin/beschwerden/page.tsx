'use client';

import { Suspense, useId } from 'react';
import Link from 'next/link';
import { MessageSquareWarning } from 'lucide-react';

import { Label } from '@/componets/ui/lable';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componets/ui/table';
import { qs } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminComplaintsResponse, ComplaintStatus } from '@/lib/types';

import { EmptyState, ErrorState, ListSkeleton, NativeSelect, PageHeader, PaginationBar } from '../_components/states';
import { useApi, useQueryParams } from '../_components/use-api';
import { ComplaintStatusBadge } from './_components';
import messages from './_messages';

const KEYS = ['status', 'worker', 'page'] as const;
const STATUSES: ComplaintStatus[] = ['open', 'in_review', 'resolved', 'rejected'];

function ComplaintsList() {
  const t = useMessages(messages);
  const f = useFormat();
  const { values, setParams } = useQueryParams(KEYS);
  const statusId = useId();
  const workerId = useId();
  const { data, error, loading, reload } = useApi<AdminComplaintsResponse>(`/admin/complaints${qs({ ...values, limit: 20 })}`);

  return (
    <>
      <PageHeader title={t.title} description={t.description} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-48 space-y-1.5">
          <Label htmlFor={statusId}>{t.filterStatus}</Label>
          <NativeSelect id={statusId} value={values.status} onChange={(e) => setParams({ status: e.target.value })}>
            <option value="">{t.all}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t.status[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="w-60 space-y-1.5">
          <Label htmlFor={workerId}>{t.filterWorker}</Label>
          <NativeSelect id={workerId} value={values.worker} onChange={(e) => setParams({ worker: e.target.value })}>
            <option value="">{t.all}</option>
            {(data?.workers ?? []).map((w) => (
              <option key={w._id} value={w._id}>
                {w.name} ({w.n})
              </option>
            ))}
          </NativeSelect>
        </div>
        {data && <p className="pb-2 text-sm text-muted-grey">{t.counts(data.counts.open, data.counts.in_review)}</p>}
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <ListSkeleton label={t.loading} />
      ) : data.complaints.length === 0 ? (
        <EmptyState icon={MessageSquareWarning} title={t.emptyTitle} description={t.emptyText} />
      ) : (
        <div aria-busy={loading}>
          <div className="overflow-x-auto rounded-2xl border border-border bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-cream/60">
                  <TableHead scope="col">{t.cols.created}</TableHead>
                  <TableHead scope="col">{t.cols.booking}</TableHead>
                  <TableHead scope="col">{t.cols.customer}</TableHead>
                  <TableHead scope="col">{t.cols.worker}</TableHead>
                  <TableHead scope="col">{t.cols.category}</TableHead>
                  <TableHead scope="col">{t.cols.status}</TableHead>
                  <TableHead scope="col">{t.cols.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.complaints.map((c) => (
                  <TableRow key={c._id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-grey">{f.dateTime(c.createdAt)}</TableCell>
                    <TableCell>
                      <Link href={`/admin/beschwerden/${c._id}`} className="font-medium text-pine hover:underline">
                        {c.bookingRef}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{c.customer?.name ?? '–'}</TableCell>
                    <TableCell className="text-sm">{c.worker?.name ?? '–'}</TableCell>
                    <TableCell className="text-sm">{t.categories[c.category]}</TableCell>
                    <TableCell>
                      <ComplaintStatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-grey">{c.actionTypes.map((a) => t.actionNames[a]).join(', ') || '–'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationBar pagination={data.pagination} disabled={loading} onPageChange={(page) => setParams({ page })} />
        </div>
      )}
    </>
  );
}

export default function AdminComplaintsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ComplaintsList />
    </Suspense>
  );
}
