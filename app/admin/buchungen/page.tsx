'use client';

import { Suspense, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarSearch, Search, X } from 'lucide-react';

import { StatusBadge } from '@/componets/site/status-badge';
import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componets/ui/table';
import { qs } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { Booking, BookingStatus, Pagination } from '@/lib/types';

import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  NativeSelect,
  PageHeader,
  PaginationBar,
} from '../_components/states';
import { useApi, useQueryParams } from '../_components/use-api';
import cashMessages from '../_cash-messages';
import bookingMessages from './_messages';

const KEYS = ['status', 'search', 'from', 'to', 'assigned', 'workerId', 'sort', 'page'] as const;

const CURRENT_STATUSES: BookingStatus[] = ['payment_pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'expired'];
const LEGACY_STATUSES: BookingStatus[] = ['pending_quotation', 'quotation_sent', 'accepted', 'rejected'];

function Amount({ booking }: { booking: Booking }) {
  const f = useFormat();
  const amount = booking.payment?.amountCents ?? booking.quotation?.amountCents ?? booking.estimate?.totalCents;
  return <span className="font-semibold text-pine-dark">{f.euro(amount)}</span>;
}

/** Payment badge + hold expiry / invoice hint */
function PaymentInfo({ booking }: { booking: Booking }) {
  const t = useMessages(bookingMessages);
  const cash = useMessages(cashMessages);
  const f = useFormat();
  if (!booking.payment) return <span className="text-muted-grey">–</span>;
  const hold =
    booking.status === 'payment_pending' && booking.holdExpiresAt ? new Date(booking.holdExpiresAt) : null;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <StatusBadge kind="payment" status={booking.payment.status} />
      {hold && (
        <span className={hold.getTime() < Date.now() ? 'text-xs text-red-700' : 'text-xs text-amber-800'}>
          {hold.getTime() < Date.now() ? t.list.holdExpired : t.list.holdUntil(f.dateTime(booking.holdExpiresAt))}
        </span>
      )}
      {booking.payment.method === 'invoice' && <span className="text-xs text-muted-grey">{t.list.invoice}</span>}
      {booking.payment.method === 'cash' && <span className="text-xs text-muted-grey">{cash.provider}</span>}
    </span>
  );
}

function BookingsList() {
  const router = useRouter();
  const t = useMessages(bookingMessages);
  const c = useMessages(common);
  const f = useFormat();
  const { values, setParams } = useQueryParams(KEYS);
  const [searchDraft, setSearchDraft] = useState(values.search);
  const ids = { status: useId(), search: useId(), from: useId(), to: useId(), assigned: useId() };

  useEffect(() => setSearchDraft(values.search), [values.search]);

  const path = `/admin/bookings${qs({ ...values, limit: 20 })}`;
  const { data, error, loading, reload } = useApi<{ bookings: Booking[]; pagination: Pagination }>(path);

  const hasFilters = KEYS.some((k) => k !== 'page' && values[k]);
  const workerName =
    values.workerId && data?.bookings.find((b) => b.assignedWorker)?.assignedWorker?.name;

  return (
    <>
      <PageHeader title={t.list.title} description={t.list.description} />

      <form
        className="mb-4 grid gap-3 rounded-2xl border border-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ search: searchDraft.trim() });
        }}
        role="search"
        aria-label={t.list.filterLabel}
      >
        <div className="space-y-1.5 lg:col-span-2">
          <Label htmlFor={ids.search}>{t.list.search}</Label>
          <div className="flex gap-2">
            <Input
              id={ids.search}
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder={t.list.searchPlaceholder}
            />
            <Button type="submit" variant="outline" size="icon" aria-label={t.list.searchButton}>
              <Search className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={ids.status}>{t.list.status}</Label>
          <NativeSelect id={ids.status} value={values.status} onChange={(e) => setParams({ status: e.target.value })}>
            <option value="">{t.list.allStatuses}</option>
            {CURRENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {c.bookingStatus[s].label}
              </option>
            ))}
            <optgroup label={t.list.legacyGroup}>
              {LEGACY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {c.bookingStatus[s].label}
                </option>
              ))}
            </optgroup>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={ids.assigned}>{t.list.assignment}</Label>
          <NativeSelect
            id={ids.assigned}
            value={values.workerId ? '' : values.assigned}
            disabled={Boolean(values.workerId)}
            onChange={(e) => setParams({ assigned: e.target.value })}
          >
            <option value="">{t.list.all}</option>
            <option value="true">{t.list.assigned}</option>
            <option value="false">{t.list.unassigned}</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={ids.from}>{t.list.from}</Label>
          <Input id={ids.from} type="date" value={values.from} onChange={(e) => setParams({ from: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={ids.to}>{t.list.to}</Label>
          <Input
            id={ids.to}
            type="date"
            value={values.to}
            min={values.from || undefined}
            onChange={(e) => setParams({ to: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-6">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-charcoal">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-[#174D3A]"
              checked={values.sort === 'date'}
              onChange={(e) => setParams({ sort: e.target.checked ? 'date' : '' })}
            />
            {t.list.sortByDate}
          </label>
          {values.workerId && (
            <span className="inline-flex items-center gap-2 rounded-full bg-mint px-3 py-1 text-xs font-medium text-pine">
              {t.list.workerFilter(workerName || t.list.workerSelected)}
              <button
                type="button"
                onClick={() => setParams({ workerId: '' })}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t.list.removeWorkerFilter}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          )}
          {hasFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={() => router.replace('/admin/buchungen')}>
              {t.list.resetFilters}
            </Button>
          )}
        </div>
      </form>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <ListSkeleton rows={8} label={t.list.loading} />
      ) : data.bookings.length === 0 ? (
        <EmptyState
          icon={CalendarSearch}
          title={t.list.emptyTitle}
          description={hasFilters ? t.list.emptyFiltered : t.list.emptyAll}
        />
      ) : (
        <div aria-busy={loading}>
          {error && <ErrorState message={error} onRetry={reload} className="mb-3" />}

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-white md:block">
            <Table>
              <caption className="sr-only">{t.list.caption}</caption>
              <TableHeader>
                <TableRow className="bg-cream/60">
                  <TableHead scope="col">{t.list.col.reference}</TableHead>
                  <TableHead scope="col">{t.list.col.customer}</TableHead>
                  <TableHead scope="col">{t.list.col.service}</TableHead>
                  <TableHead scope="col">{t.list.col.date}</TableHead>
                  <TableHead scope="col">{t.list.col.status}</TableHead>
                  <TableHead scope="col">{t.list.col.payment}</TableHead>
                  <TableHead scope="col">{t.list.col.worker}</TableHead>
                  <TableHead scope="col" className="text-right">
                    {t.list.col.amount}
                  </TableHead>
                  <TableHead scope="col">{t.list.col.created}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.bookings.map((b) => (
                  <TableRow
                    key={b._id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admin/buchungen/${b._id}`)}
                  >
                    <TableCell>
                      <Link
                        href={`/admin/buchungen/${b._id}`}
                        className="rounded font-mono text-xs font-semibold text-pine hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {b.reference}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-charcoal">{b.customerDetails.name}</span>
                      <span className="block text-xs text-muted-grey">{b.customerDetails.postcode}</span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.services[b.serviceId] ?? b.serviceId}
                      <span className="block text-xs text-muted-grey">{b.areaM2} m²</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {f.dateShort(b.preferredDate)}
                      <span className="block text-xs text-muted-grey">{f.slot(b.slot, b.slotEnd)}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="booking" status={b.status} />
                    </TableCell>
                    <TableCell>
                      <PaymentInfo booking={b} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {b.assignedWorker?.name ?? <span className="text-muted-grey">–</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <Amount booking={b} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-grey">
                      {f.dateTime(b.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {data.bookings.map((b) => (
              <li key={b._id}>
                <Link
                  href={`/admin/buchungen/${b._id}`}
                  className="block rounded-2xl border border-border bg-white p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-charcoal">{b.customerDetails.name}</p>
                      <p className="font-mono text-xs text-muted-grey">{b.reference}</p>
                    </div>
                    <StatusBadge kind="booking" status={b.status} />
                  </div>
                  <p className="mt-2 text-sm text-charcoal">
                    {c.services[b.serviceId] ?? b.serviceId} · {b.areaM2} m²
                  </p>
                  <p className="text-sm text-muted-grey">
                    {f.dateShort(b.preferredDate)} · {f.slot(b.slot, b.slotEnd)}
                  </p>
                  <div className="mt-2">
                    <PaymentInfo booking={b} />
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2 text-sm">
                    <span className="text-muted-grey">{b.assignedWorker?.name ?? t.list.notAssigned}</span>
                    <Amount booking={b} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <PaginationBar
            pagination={data.pagination}
            disabled={loading}
            onPageChange={(page) => setParams({ page })}
          />
        </div>
      )}
    </>
  );
}

export default function AdminBookingsPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={8} />}>
      <BookingsList />
    </Suspense>
  );
}
