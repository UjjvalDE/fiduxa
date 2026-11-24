'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Sparkles, Tag } from 'lucide-react';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { qs } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminPromotion, PromotionKind } from '@/lib/types';

import { discountLabel } from '../_components/promo-utils';
import { EmptyState, ErrorState, ListSkeleton, NativeSelect, PageHeader } from '../_components/states';
import { useApi, useQueryParams } from '../_components/use-api';
import promotionMessages from './_messages';
import { ActiveToggle, PromotionStateBadge, RulesInfo, usePeriodLabel } from './_components/promotion-parts';
import { TEMPLATES } from './_templates';

const KEYS = ['kind', 'state', 'search'] as const;
const KINDS: PromotionKind[] = ['campaign', 'coupon', 'welcome'];
const STATES: AdminPromotion['state'][] = ['live', 'scheduled', 'ended', 'inactive'];

function PromotionsList() {
  const t = useMessages(promotionMessages);
  const f = useFormat();
  const { values: params, setParams } = useQueryParams(KEYS);
  const [search, setSearch] = useState(params.search);

  // Debounce the search box into the URL
  useEffect(() => {
    const id = setTimeout(() => {
      if (search.trim() !== params.search) setParams({ search: search.trim() });
    }, 350);
    return () => clearTimeout(id);
  }, [search, params.search, setParams]);

  const { data, error, loading, reload, setData } = useApi<{ promotions: AdminPromotion[] }>(
    `/admin/promotions${qs({ kind: params.kind, state: params.state, search: params.search })}`
  );
  const filtered = Boolean(params.kind || params.state || params.search);

  const replace = (p: AdminPromotion) =>
    setData((d) => (d ? { promotions: d.promotions.map((x) => (x._id === p._id ? p : x)) } : d));

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <Button asChild>
            <Link href="/admin/aktionen/neu">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              {t.newPromotion}
            </Link>
          </Button>
        }
      />

      <RulesInfo />

      <section aria-labelledby="templates-title" className="mb-6 rounded-2xl border border-border bg-white p-4 shadow-sm">
        <h2 id="templates-title" className="flex items-center gap-2 text-sm font-semibold text-pine-dark">
          <Sparkles className="h-4 w-4 text-pine" aria-hidden="true" />
          {t.templatesTitle}
        </h2>
        <p className="mt-0.5 text-xs text-muted-grey">{t.templatesHint}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TEMPLATES.map((tpl) => (
            <Link
              key={tpl.key}
              href={`/admin/aktionen/neu?vorlage=${tpl.key}`}
              className="rounded-full border border-border bg-cream px-3 py-1 text-sm font-medium text-pine hover:bg-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t.templates[tpl.key]}
            </Link>
          ))}
        </div>
      </section>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]" role="search" aria-label={t.filters.label}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-grey" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.filters.search}
            aria-label={t.filters.searchLabel}
            className="pl-9"
          />
        </div>
        <NativeSelect value={params.kind} onChange={(e) => setParams({ kind: e.target.value })} aria-label={t.cols.name} className="sm:w-48">
          <option value="">{t.filters.kindAll}</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t.kinds[k]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={params.state} onChange={(e) => setParams({ state: e.target.value })} aria-label={t.cols.state} className="sm:w-44">
          <option value="">{t.filters.stateAll}</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {t.states[s]}
            </option>
          ))}
        </NativeSelect>
      </div>

      {loading && !data ? (
        <ListSkeleton label={t.loading} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.promotions.length === 0 ? (
        <EmptyState
          icon={Tag}
          title={filtered ? t.emptyFiltered : t.emptyTitle}
          description={filtered ? undefined : t.emptyText}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white">
          <table className="w-full min-w-[1100px] text-sm">
            <caption className="sr-only">{t.caption}</caption>
            <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">{t.cols.name}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.cols.code}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.cols.discount}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.cols.period}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.cols.state}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.cols.placement}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">{t.cols.priority}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">{t.cols.used}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">{t.cols.applied}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">{t.cols.discountTotal}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.cols.active}</th>
              </tr>
            </thead>
            <tbody>
              {data.promotions.map((p) => (
                <PromotionRow key={p._id} promo={p} onChanged={replace} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.promotions.length > 0 && (
        <p className="mt-3 text-xs text-muted-grey">
          {f.number(data.promotions.length)} · {t.caption}
        </p>
      )}
    </>
  );
}

function PromotionRow({ promo: p, onChanged }: { promo: AdminPromotion; onChanged: (p: AdminPromotion) => void }) {
  const t = useMessages(promotionMessages);
  const f = useFormat();
  const period = usePeriodLabel();
  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-4 py-3">
        <Link href={`/admin/aktionen/${p._id}`} className="font-semibold text-pine hover:underline">
          {p.name}
        </Link>
        <div className="text-xs text-muted-grey">{t.kinds[p.kind]}</div>
      </td>
      <td className="px-4 py-3">
        {p.code ? <span className="font-mono text-xs font-semibold">{p.code}</span> : <span className="text-xs text-muted-grey">{t.automatic}</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">
        {discountLabel(p, f.euro, f.number)}
        {p.maxDiscountCents != null && p.discountType === 'percent' && (
          <div className="text-xs font-normal text-muted-grey">max. {f.euro(p.maxDiscountCents)}</div>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-grey">{period(p)}</td>
      <td className="px-4 py-3">
        <PromotionStateBadge state={p.state} />
      </td>
      <td className="px-4 py-3 text-xs">{t.placements[p.display?.placement ?? 'none']}</td>
      <td className="px-4 py-3 text-right tabular-nums">{p.display?.priority ?? 0}</td>
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
        {p.usedCount ?? 0} / {p.usageLimit ?? '∞'}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{p.stats?.applied ?? 0}</td>
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{f.euro(p.stats?.discountCents ?? 0)}</td>
      <td className="px-4 py-3">
        <ActiveToggle promo={p} onChanged={onChanged} />
      </td>
    </tr>
  );
}

export default function PromotionsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <PromotionsList />
    </Suspense>
  );
}
