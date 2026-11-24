'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Power, PowerOff, ScrollText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { StatusBadge } from '@/componets/site/status-badge';
import { Button } from '@/componets/ui/button';
import { api, qs } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { AdminPromotion, AdminPromotionRedemption, Pagination, ServiceId } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ConfirmAction } from '../../_components/confirm-action';
import { discountLabel } from '../../_components/promo-utils';
import { DetailSkeleton, ErrorState, InfoList, PageHeader, PaginationBar, SectionCard } from '../../_components/states';
import { useApi, useErrorText, useQueryParams } from '../../_components/use-api';
import promotionMessages from '../_messages';
import { PromotionStateBadge, usePeriodLabel } from '../_components/promotion-parts';
import { PromotionPreview } from '../_components/promotion-preview';

interface DetailResponse {
  promotion: AdminPromotion;
  redemptions: AdminPromotionRedemption[];
  pagination: Pagination;
}

const REDEMPTION_CLASSES: Record<AdminPromotionRedemption['status'], string> = {
  reserved: 'bg-sky-50 text-sky-800 border-sky-200',
  applied: 'bg-mint text-pine border-sage',
  released: 'bg-gray-100 text-gray-600 border-gray-200',
};

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-grey">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-pine-dark">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-grey">{hint}</p>}
    </div>
  );
}

function PromotionDetail({ id }: { id: string }) {
  const t = useMessages(promotionMessages);
  const td = t.detail;
  const c18 = useMessages(common);
  const f = useFormat();
  const { locale } = useLocale();
  const router = useRouter();
  const errorText = useErrorText();
  const period = usePeriodLabel();
  const { values, setParams } = useQueryParams(['page'] as const);
  const page = Number(values.page) || 1;
  const [toggling, setToggling] = useState(false);

  const { data, error, errorStatus, loading, reload, setData } = useApi<DetailResponse>(
    `/admin/promotions/${id}${qs({ page, limit: 25 })}`
  );

  if (error && !data) {
    return (
      <>
        <PageHeader title={t.title} backHref="/admin/aktionen" backLabel={td.back} />
        <ErrorState message={error} onRetry={errorStatus === 404 || errorStatus === 400 ? undefined : reload} />
      </>
    );
  }
  if (!data) return <DetailSkeleton />;

  const p = data.promotion;
  const s = p.stats ?? { applied: 0, reserved: 0, released: 0, discountCents: 0, orderCents: 0 };
  const used = (p.usedCount ?? 0) > 0 || s.applied + s.reserved + s.released > 0;
  const text = (v: Partial<Record<string, string>> | undefined) => v?.[locale]?.trim() || v?.de?.trim() || '';

  const setActive = async (active: boolean) => {
    setToggling(true);
    try {
      const res = await api.patch<{ promotion: AdminPromotion }>(`/admin/promotions/${p._id}/active`, { active });
      setData((d) => (d ? { ...d, promotion: { ...d.promotion, ...res.promotion, stats: d.promotion.stats } } : d));
      toast.success(active ? t.activated(p.name) : t.deactivated(p.name));
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setToggling(false);
    }
  };

  const remove = async () => {
    await api.delete(`/admin/promotions/${p._id}`);
    toast.success(td.deleted);
    router.push('/admin/aktionen');
  };

  return (
    <>
      <PageHeader
        backHref="/admin/aktionen"
        backLabel={td.back}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {p.name}
            <PromotionStateBadge state={p.state} />
          </span>
        }
        description={`${t.kinds[p.kind]} · ${p.code ? p.code : t.automatic} · ${discountLabel(p, f.euro, f.number)}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/admin/protokoll?entityId=${p._id}`}>
                <ScrollText className="mr-2 h-4 w-4" aria-hidden="true" />
                {td.audit}
              </Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => setActive(!p.active)} disabled={toggling}>
              {p.active ? <PowerOff className="mr-2 h-4 w-4" aria-hidden="true" /> : <Power className="mr-2 h-4 w-4" aria-hidden="true" />}
              {p.active ? td.deactivate : td.activate}
            </Button>
            <Button asChild>
              <Link href={`/admin/aktionen/${p._id}/bearbeiten`}>
                <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                {td.edit}
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label={td.stats} className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label={td.applied} value={f.number(s.applied)} />
        <Stat label={td.reserved} value={f.number(s.reserved)} />
        <Stat label={td.released} value={f.number(s.released)} />
        <Stat label={td.discountTotal} value={f.euro(s.discountCents)} />
        <Stat label={td.orderTotal} value={f.euro(s.orderCents)} />
        <Stat label={td.avgDiscount} value={s.applied ? f.euro(Math.round(s.discountCents / s.applied)) : '–'} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard
            id="einloesungen"
            title={td.redemptions}
            description={td.redemptionHint}
          >
            {data.redemptions.length === 0 ? (
              <p className="text-sm text-muted-grey">{td.noRedemptions}</p>
            ) : (
              <>
                <div className={cn('overflow-x-auto rounded-xl border border-border', loading && 'opacity-60')}>
                  <table className="w-full min-w-[720px] text-sm">
                    <caption className="sr-only">{td.redemptionsCaption}</caption>
                    <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-semibold">{td.colCustomer}</th>
                        <th scope="col" className="px-3 py-2 font-semibold">{td.colBooking}</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">{td.colDiscount}</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">{td.colOrder}</th>
                        <th scope="col" className="px-3 py-2 font-semibold">{td.colStatus}</th>
                        <th scope="col" className="px-3 py-2 font-semibold">{td.colDate}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.redemptions.map((r) => (
                        <tr key={r._id} className="border-b border-border align-top last:border-0">
                          <td className="px-3 py-2">
                            {r.customer ? (
                              <>
                                <Link href={`/admin/kunden/${r.customer._id}`} className="font-medium text-pine hover:underline">
                                  {r.customer.name}
                                </Link>
                                <div className="text-xs text-muted-grey">{r.customer.email}</div>
                              </>
                            ) : (
                              '–'
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {r.booking ? (
                              <>
                                <Link href={`/admin/buchungen/${r.booking._id}`} className="font-mono font-semibold text-pine hover:underline">
                                  {r.booking.reference}
                                </Link>
                                <div className="mt-1">
                                  <StatusBadge kind="booking" status={r.booking.status} />
                                </div>
                              </>
                            ) : (
                              '–'
                            )}
                            {r.code && <div className="mt-1 font-mono text-xs text-muted-grey">{r.code}</div>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">− {f.euro(r.discountCents)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{f.euro(r.orderCents)}</td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                'inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                                REDEMPTION_CLASSES[r.status]
                              )}
                            >
                              {td.redemptionStatus[r.status] ?? r.status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-muted-grey">{f.dateTime(r.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PaginationBar pagination={data.pagination} onPageChange={(next) => setParams({ page: next })} disabled={loading} />
              </>
            )}
          </SectionCard>

          {p.display?.placement && p.display.placement !== 'none' && (
            <SectionCard title={t.form.preview} description={t.placements[p.display.placement]}>
              <PromotionPreview
                content={{
                  placement: p.display.placement,
                  theme: p.display.theme ?? 'pine',
                  title: text(p.display.title) || p.name,
                  text: text(p.display.text),
                  ctaText: text(p.display.ctaText),
                  badge: text(p.display.badge),
                  imageUrl: p.display.imageUrl ?? '',
                  code: p.kind === 'welcome' ? '' : p.code ?? '',
                  codeLabel: t.form.previewCode(p.code ?? ''),
                }}
              />
            </SectionCard>
          )}
        </div>

        <div className="space-y-4">
          <SectionCard title={td.settings}>
            <InfoList
              className="sm:grid-cols-1"
              items={[
                [td.discount, discountLabel(p, f.euro, f.number)],
                [td.maxDiscount, p.maxDiscountCents != null ? f.euro(p.maxDiscountCents) : '–'],
                [td.minOrder, p.minOrderCents ? f.euro(p.minOrderCents) : '–'],
                [
                  td.services,
                  p.services?.length ? p.services.map((sv) => c18.services[sv as ServiceId] ?? sv).join(', ') : td.allServices,
                ],
                [
                  td.conditions,
                  [
                    (p.firstBookingOnly || p.kind === 'welcome') && td.firstBooking,
                    (p.requiresVerifiedEmail || p.kind === 'welcome') && td.verified,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '–',
                ],
                [td.period, period(p)],
                [td.usage, td.usedOf(p.usedCount ?? 0, p.usageLimit != null ? f.number(p.usageLimit) : t.noLimit)],
                [td.perCustomer, f.number(p.perCustomerLimit ?? 1)],
                [td.display, `${t.placements[p.display?.placement ?? 'none']} · ${t.cols.priority} ${p.display?.priority ?? 0}`],
              ]}
            />
          </SectionCard>

          <SectionCard title={td.delete}>
            {used ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-grey">{td.deleteUsed}</p>
                {p.active && (
                  <Button type="button" variant="outline" onClick={() => setActive(false)} disabled={toggling}>
                    <PowerOff className="mr-2 h-4 w-4" aria-hidden="true" />
                    {td.deactivateInstead}
                  </Button>
                )}
              </div>
            ) : (
              <ConfirmAction
                trigger={
                  <>
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    {td.delete}
                  </>
                }
                triggerClassName="text-red-700"
                title={td.deleteTitle(p.name)}
                description={td.deleteText}
                confirmLabel={td.deleteConfirm}
                destructive
                onConfirm={remove}
              />
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}

export default function PromotionDetailPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <PromotionDetail id={params.id} />
    </Suspense>
  );
}
