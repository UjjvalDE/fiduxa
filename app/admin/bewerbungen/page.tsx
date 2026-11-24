'use client';

import { Suspense, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileCheck2, Search, UserPlus } from 'lucide-react';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componets/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/componets/ui/tabs';
import { qs } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminApplicationListItem, ApplicationStatus, Pagination } from '@/lib/types';

import applicationMessages from '../../(site)/reinigungskraft-werden/_messages';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, PaginationBar } from '../_components/states';
import { useApi, useQueryParams } from '../_components/use-api';
import { APPLICATION_STATUSES, ApplicationStatusBadge } from './_status-badge';
import messages from './_messages';

const KEYS = ['status', 'search', 'page'] as const;

interface ApplicationsResponse {
  applications: AdminApplicationListItem[];
  pagination: Pagination;
  counts: Record<ApplicationStatus, number>;
}

const TAB_CLASS = 'gap-1.5 data-[state=active]:bg-mint data-[state=active]:text-pine-dark';

function CountPill({ n }: { n: number | undefined }) {
  if (n === undefined) return null;
  return <span className="rounded-full bg-cream px-1.5 py-px text-[11px] font-semibold tabular-nums text-muted-grey">{n}</span>;
}

function ApplicationsList() {
  const t = useMessages(messages);
  const o = useMessages(applicationMessages).options;
  const f = useFormat();
  const router = useRouter();
  const { values, setParams } = useQueryParams(KEYS);
  const [draft, setDraft] = useState(values.search);
  const searchId = useId();
  useEffect(() => setDraft(values.search), [values.search]);

  const { data, error, loading, reload } = useApi<ApplicationsResponse>(`/admin/applications${qs({ ...values, limit: 20 })}`);
  const counts = data?.counts;
  const total = counts ? APPLICATION_STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0) : undefined;
  const status = (APPLICATION_STATUSES as string[]).includes(values.status) ? values.status : 'all';

  const href = (id: string) => `/admin/bewerbungen/${id}`;

  return (
    <>
      <PageHeader title={t.title} description={t.description} />

      <Tabs value={status} onValueChange={(v) => setParams({ status: v === 'all' ? '' : v })} className="mb-4">
        <TabsList aria-label={t.tabsLabel} className="h-auto flex-wrap justify-start bg-white">
          {APPLICATION_STATUSES.map((s) => (
            <TabsTrigger key={s} value={s} className={TAB_CLASS}>
              {t.status[s]} <CountPill n={counts?.[s]} />
            </TabsTrigger>
          ))}
          <TabsTrigger value="all" className={TAB_CLASS}>
            {t.all} <CountPill n={total} />
          </TabsTrigger>
        </TabsList>
      </Tabs>

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
      ) : data.applications.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={t.emptyTitle}
          description={values.search ? t.emptySearch : values.status ? t.emptyFiltered : t.emptyNone}
        />
      ) : (
        <div aria-busy={loading}>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-white lg:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-cream/60">
                  <TableHead scope="col">{t.colName}</TableHead>
                  <TableHead scope="col">{t.colPostcode}</TableHead>
                  <TableHead scope="col">{t.colPermit}</TableHead>
                  <TableHead scope="col">{t.colHours}</TableHead>
                  <TableHead scope="col">{t.colExperience}</TableHead>
                  <TableHead scope="col">{t.colVehicle}</TableHead>
                  <TableHead scope="col">{t.colCv}</TableHead>
                  <TableHead scope="col">{t.colDate}</TableHead>
                  <TableHead scope="col">{t.colStatus}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.applications.map((a) => (
                  <TableRow key={a._id} className="cursor-pointer" onClick={() => router.push(href(a._id))}>
                    <TableCell>
                      <Link
                        href={href(a._id)}
                        className="font-medium text-pine hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {a.name}
                      </Link>
                      <span className="block text-xs text-muted-grey">{a.email}</span>
                    </TableCell>
                    <TableCell className="tabular-nums">{a.postcode}</TableCell>
                    <TableCell className="max-w-[220px] text-sm">{o.permit[a.permit] ?? a.permit}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{o.hours[a.hoursPerWeek] ?? a.hoursPerWeek}</TableCell>
                    <TableCell className="text-sm">{o.experience[a.experience] ?? a.experience}</TableCell>
                    <TableCell className="text-sm">{o.vehicle[a.vehicle] ?? a.vehicle}</TableCell>
                    <TableCell className="text-sm">
                      {a.hasCv ? (
                        <span className="inline-flex items-center gap-1 text-pine">
                          <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                          {t.yes}
                        </span>
                      ) : (
                        <span className="text-muted-grey">{t.no}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-grey">{f.dateTime(a.createdAt)}</TableCell>
                    <TableCell>
                      <ApplicationStatusBadge status={a.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-3 lg:hidden">
            {data.applications.map((a) => (
              <li key={a._id}>
                <Link
                  href={href(a._id)}
                  className="block rounded-2xl border border-border bg-white p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-charcoal">{a.name}</p>
                    <ApplicationStatusBadge status={a.status} />
                  </div>
                  <p className="text-sm text-muted-grey">
                    {a.postcode} · {f.dateTime(a.createdAt)}
                  </p>
                  <p className="mt-2 text-sm text-charcoal">{o.permit[a.permit] ?? a.permit}</p>
                  <p className="mt-1 text-xs text-muted-grey">
                    {o.hours[a.hoursPerWeek]} · {o.experience[a.experience]} · {o.vehicle[a.vehicle]} · {t.colCv}: {a.hasCv ? t.yes : t.no}
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

export default function AdminApplicationsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ApplicationsList />
    </Suspense>
  );
}
