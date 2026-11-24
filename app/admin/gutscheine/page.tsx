'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { Gift, Search } from 'lucide-react';

import { Input } from '@/componets/ui/input';
import { qs } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminGiftCard, GiftCardStatus, Pagination } from '@/lib/types';
import { cn } from '@/lib/utils';

import { GIFT_CARD_STATUS_CLASSES, maskGiftCode } from '../_components/promo-utils';
import { EmptyState, ErrorState, ListSkeleton, NativeSelect, PageHeader, PaginationBar } from '../_components/states';
import { useApi, useQueryParams } from '../_components/use-api';
import giftCardMessages from './_messages';
import { IssueGiftCardDialog } from './_components/issue-dialog';

const KEYS = ['search', 'status', 'page'] as const;
const STATUSES: GiftCardStatus[] = ['active', 'redeemed', 'disabled', 'expired', 'pending_payment', 'cancelled'];

interface ListResponse {
  giftCards: AdminGiftCard[];
  totals: { soldCents: number; openCents: number; count: number };
  pagination: Pagination;
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-muted-grey">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-pine-dark">{value}</p>
    </div>
  );
}

function GiftCardList() {
  const t = useMessages(giftCardMessages);
  const f = useFormat();
  const { values: params, setParams } = useQueryParams(KEYS);
  const page = Number(params.page) || 1;
  const [search, setSearch] = useState(params.search);

  useEffect(() => {
    const id = setTimeout(() => {
      if (search.trim() !== params.search) setParams({ search: search.trim() });
    }, 350);
    return () => clearTimeout(id);
  }, [search, params.search, setParams]);

  const { data, error, loading, reload } = useApi<ListResponse>(
    `/admin/gift-cards${qs({ search: params.search, status: params.status, page, limit: 25 })}`
  );
  const filtered = Boolean(params.search || params.status);

  return (
    <>
      <PageHeader title={t.title} description={t.description} actions={<IssueGiftCardDialog />} />

      {data && (
        <section aria-label={t.totals.hint} className="mb-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Total label={t.totals.sold} value={f.euro(data.totals.soldCents)} />
            <Total label={t.totals.open} value={f.euro(data.totals.openCents)} />
            <Total label={t.totals.count} value={f.number(data.totals.count)} />
          </div>
          <p className="mt-2 text-xs text-muted-grey">{t.totals.hint}</p>
        </section>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]" role="search">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-grey" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.search}
            aria-label={t.searchLabel}
            className="pl-9"
          />
        </div>
        <NativeSelect value={params.status} onChange={(e) => setParams({ status: e.target.value })} aria-label={t.statusLabel} className="sm:w-56">
          <option value="">{t.statusAll}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t.status[s]}
            </option>
          ))}
        </NativeSelect>
      </div>

      {loading && !data ? (
        <ListSkeleton label={t.loading} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.giftCards.length === 0 ? (
        <EmptyState icon={Gift} title={filtered ? t.emptyFiltered : t.emptyTitle} description={filtered ? undefined : t.emptyText} />
      ) : (
        <>
          <div className={cn('overflow-x-auto rounded-2xl border border-border bg-white', loading && 'opacity-60')}>
            <table className="w-full min-w-[960px] text-sm">
              <caption className="sr-only">{t.caption}</caption>
              <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.cols.code}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.cols.status}</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">{t.cols.initial}</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">{t.cols.balance}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.cols.recipient}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.cols.buyer}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.cols.paid}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.cols.expires}</th>
                </tr>
              </thead>
              <tbody>
                {data.giftCards.map((g) => (
                  <tr key={g._id} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/admin/gutscheine/${g._id}`} className="whitespace-nowrap font-mono font-semibold text-pine hover:underline">
                        {maskGiftCode(g.code)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                          GIFT_CARD_STATUS_CLASSES[g.status]
                        )}
                      >
                        {t.status[g.status] ?? g.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{f.euro(g.initialCents)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{f.euro(g.balanceCents)}</td>
                    <td className="px-4 py-3">
                      <div>{g.recipientName || '–'}</div>
                      <div className="text-xs text-muted-grey">{g.recipientEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      {g.payment?.method === 'admin' ? (
                        <span className="text-xs text-muted-grey">{t.issuedByAdmin}</span>
                      ) : (
                        <>
                          <div>{g.purchaser?.name || g.senderName || '–'}</div>
                          <div className="text-xs text-muted-grey">{g.purchaser?.email || g.senderEmail}</div>
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-grey">{f.dateTime(g.payment?.paidAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-grey">{f.dateTime(g.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar pagination={data.pagination} onPageChange={(next) => setParams({ page: next })} disabled={loading} />
        </>
      )}
    </>
  );
}

export default function GiftCardsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <GiftCardList />
    </Suspense>
  );
}
