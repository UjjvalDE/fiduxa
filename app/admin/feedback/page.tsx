'use client';

import { Suspense, useState } from 'react';
import { Download, Loader2, Lock, MessageSquareText } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { getStoredToken, qs } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminFeedbackSummary, FeedbackTagCount } from '@/lib/types';
import workerFeedbackMessages from '@/app/worker/_feedback-messages';

import { EmptyState, ErrorState, ListSkeleton, PageHeader, SectionCard } from '../_components/states';
import { useApi, useErrorText, useQueryParams } from '../_components/use-api';
import messages from './_messages';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api/v1').replace(/\/$/, '');
const KEYS = ['from', 'to'] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Col<T> = { key: string; label: string; value: (row: T) => React.ReactNode };

function Table<T>({ rows, cols, empty }: { rows: T[]; cols: Col<T>[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-grey">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-grey">
            {cols.map((c) => (
              <th key={c.key} scope="col" className="whitespace-nowrap px-2 py-2 font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {cols.map((c) => (
                <td key={c.key} className="whitespace-nowrap px-2 py-2 tabular-nums text-charcoal">
                  {c.value(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TagList({ title, tags, names, empty }: { title: string; tags: FeedbackTagCount[]; names: Record<string, string>; empty: string }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-pine-dark">{title}</h3>
      {tags.length === 0 ? (
        <p className="text-sm text-muted-grey">{empty}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {tags.map((tag) => (
            <li key={tag.tag} className="flex justify-between gap-3">
              <span>{names[tag.tag] ?? tag.tag.replace(/_/g, ' ')}</span>
              <span className="font-semibold tabular-nums">{tag.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FeedbackInner() {
  const t = useMessages(messages);
  const wt = useMessages(workerFeedbackMessages).feedback.tags;
  const f = useFormat();
  const errorText = useErrorText();
  const { values, setParams } = useQueryParams(KEYS);
  const from = DATE.test(values.from) ? values.from : '';
  const to = DATE.test(values.to) ? values.to : '';
  const query = qs({ from: from || undefined, to: to || undefined });
  const { data, error, loading, reload } = useApi<AdminFeedbackSummary>(`/admin/feedback${query}`);
  const [exporting, setExporting] = useState(false);

  const avg = (v: number | null | undefined) => (v == null ? '–' : f.number(v));

  const exportCsv = async () => {
    setExporting(true);
    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE}/admin/feedback/export.csv${query}`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(t.exportFailed);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `fiduxa-feedback${from ? `-${from}` : ''}${to ? `-${to}` : ''}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setExporting(false);
    }
  };

  const empty = data && !data.overall.customer && !data.overall.worker;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {t.title}
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
              <Lock className="h-3 w-3" aria-hidden="true" /> {t.internal}
            </span>
          </span>
        }
        description={t.description}
        actions={
          <Button type="button" variant="outline" onClick={exportCsv} disabled={exporting}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}
            {t.exportCsv}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="fb-from">{t.from}</Label>
          <Input id="fb-from" type="date" value={from} onChange={(e) => setParams({ from: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fb-to">{t.to}</Label>
          <Input id="fb-to" type="date" value={to} onChange={(e) => setParams({ to: e.target.value })} />
        </div>
        {(from || to) && (
          <Button type="button" variant="ghost" onClick={() => setParams({ from: '', to: '' })}>
            {t.reset}
          </Button>
        )}
      </div>

      {loading && !data ? (
        <ListSkeleton label={t.loading} />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || empty ? (
        <EmptyState title={t.emptyTitle} description={t.emptyText} icon={MessageSquareText} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title={t.customerSide}>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-grey">{t.cols.count}</dt>
                <dd className="font-semibold">{data.overall.customer?.count ?? 0}</dd>
                <dt className="text-muted-grey">{t.cols.overallExperience}</dt>
                <dd className="font-semibold">{avg(data.overall.customer?.overallExperience)}</dd>
                <dt className="text-muted-grey">{t.cols.cleanerRating}</dt>
                <dd className="font-semibold">{avg(data.overall.customer?.cleanerRating)}</dd>
                <dt className="text-muted-grey">{t.cols.professionalPunctual}</dt>
                <dd className="font-semibold">{avg(data.overall.customer?.professionalPunctual)}</dd>
                <dt className="text-muted-grey">{t.cols.notAsExpected}</dt>
                <dd className="font-semibold">{data.overall.customer?.notAsExpected ?? 0}</dd>
              </dl>
            </SectionCard>
            <SectionCard title={t.workerSide}>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-grey">{t.cols.count}</dt>
                <dd className="font-semibold">{data.overall.worker?.count ?? 0}</dd>
                <dt className="text-muted-grey">{t.cols.customerRating}</dt>
                <dd className="font-semibold">{avg(data.overall.worker?.customerRating)}</dd>
                <dt className="text-muted-grey">{t.cols.homeCondition}</dt>
                <dd className="font-semibold">{avg(data.overall.worker?.homeCondition)}</dd>
                <dt className="text-muted-grey">{t.cols.cooperative}</dt>
                <dd className="font-semibold">{avg(data.overall.worker?.cooperative)}</dd>
                <dt className="text-muted-grey">{t.cols.jobDifficulty}</dt>
                <dd className="font-semibold">{avg(data.overall.worker?.jobDifficulty)}</dd>
              </dl>
            </SectionCard>
          </div>
          <p className="text-xs text-muted-grey">{t.dismissed(data.dismissed.customer ?? 0, data.dismissed.worker ?? 0)}</p>

          <SectionCard title={t.perCleaner}>
            <Table
              rows={data.perCleaner}
              empty={t.none}
              cols={[
                { key: 'name', label: t.cols.name, value: (r) => r.name },
                { key: 'count', label: t.cols.count, value: (r) => r.count },
                { key: 'oe', label: t.cols.overallExperience, value: (r) => avg(r.overallExperience) },
                { key: 'cr', label: t.cols.cleanerRating, value: (r) => avg(r.cleanerRating) },
                { key: 'pp', label: t.cols.professionalPunctual, value: (r) => avg(r.professionalPunctual) },
                { key: 'na', label: t.cols.notAsExpected, value: (r) => r.notAsExpected },
              ]}
            />
          </SectionCard>
          <SectionCard title={t.perCustomer}>
            <Table
              rows={data.perCustomer}
              empty={t.none}
              cols={[
                { key: 'name', label: t.cols.name, value: (r) => `${r.name}${r.email ? ` (${r.email})` : ''}` },
                { key: 'count', label: t.cols.count, value: (r) => r.count },
                { key: 'cr', label: t.cols.customerRating, value: (r) => avg(r.customerRating) },
                { key: 'hc', label: t.cols.homeCondition, value: (r) => avg(r.homeCondition) },
                { key: 'co', label: t.cols.cooperative, value: (r) => avg(r.cooperative) },
                { key: 'ex', label: t.cols.experience, value: (r) => avg(r.experience) },
                { key: 'jd', label: t.cols.jobDifficulty, value: (r) => avg(r.jobDifficulty) },
                { key: 'wd', label: t.cols.withDifficulties, value: (r) => r.withDifficulties },
              ]}
            />
          </SectionCard>
          <SectionCard title={t.perDistrict}>
            <Table
              rows={data.perDistrict}
              empty={t.none}
              cols={[
                { key: 'plz', label: t.cols.postcode, value: (r) => r.postcode || '–' },
                { key: 'cc', label: `${t.cols.count} (${t.cols.customerAvg})`, value: (r) => r.customer?.count ?? 0 },
                { key: 'oe', label: t.cols.overallExperience, value: (r) => avg(r.customer?.overallExperience) },
                { key: 'cr', label: t.cols.cleanerRating, value: (r) => avg(r.customer?.cleanerRating) },
                { key: 'wc', label: `${t.cols.count} (${t.cols.workerAvg})`, value: (r) => r.worker?.count ?? 0 },
                { key: 'hc', label: t.cols.homeCondition, value: (r) => avg(r.worker?.homeCondition) },
                { key: 'jd', label: t.cols.jobDifficulty, value: (r) => avg(r.worker?.jobDifficulty) },
              ]}
            />
          </SectionCard>
          <SectionCard title={t.tags}>
            <div className="grid gap-6 md:grid-cols-3">
              <TagList title={t.customerIssues} tags={data.tags.customerIssues} names={{}} empty={t.none} />
              <TagList title={t.workerDifficulties} tags={data.tags.workerDifficulties} names={wt} empty={t.none} />
              <TagList title={t.workerConditions} tags={data.tags.workerConditions} names={wt} empty={t.none} />
            </div>
          </SectionCard>
        </div>
      )}
    </>
  );
}

export default function AdminFeedbackPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <FeedbackInner />
    </Suspense>
  );
}
