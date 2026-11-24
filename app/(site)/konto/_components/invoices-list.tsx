'use client';

// Customer invoices: one per completed cleaning (issued automatically), with
// service, date, duration, amount, payment status and PDF download.
import { useEffect, useState } from 'react';
import { Download, FileText, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import { api, downloadFile } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import common from '@/lib/i18n/messages/common';
import type { CustomerInvoice } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ErrorBox } from '../../buchung/_components/form-field';
import messages, { type InvoicePaymentStatus } from '../_service-messages';

const TONE: Record<InvoicePaymentStatus, string> = {
  paid: 'bg-mint text-pine-dark',
  pending: 'bg-amber-50 text-amber-900',
  unpaid: 'bg-amber-50 text-amber-900',
  failed: 'bg-red-50 text-red-800',
  refunded: 'bg-slate-100 text-charcoal',
  partially_refunded: 'bg-slate-100 text-charcoal',
  refund_pending: 'bg-slate-100 text-charcoal',
};

export function InvoicesList() {
  const t = useMessages(messages).invoices;
  const tc = useMessages(common);
  const f = useFormat();
  const { locale } = useLocale();
  const [invoices, setInvoices] = useState<CustomerInvoice[] | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setInvoices(null);
    api
      .get<{ invoices: CustomerInvoice[]; years: number[] }>(`/customer/invoices${year ? `?year=${year}` : ''}`)
      .then((res) => {
        if (!alive) return;
        setInvoices(res.invoices);
        if (!year) setYears(res.years ?? []);
      })
      .catch((e) => alive && setError(translateApiError(e, locale)));
    return () => {
      alive = false;
    };
  }, [year, locale]);

  const download = async (inv: CustomerInvoice) => {
    setBusy(inv.bookingId);
    try {
      await downloadFile(`/customer/bookings/${inv.bookingId}/invoice`, `${inv.number}.pdf`);
    } catch {
      toast.error(t.downloadError);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="invoices-title" className="rounded-2xl border border-border bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="invoices-title" className="m-0 flex items-center gap-2 text-xl font-bold tracking-tight text-pine-dark">
            <FileText className="h-5 w-5 text-pine" aria-hidden="true" /> {t.title}
          </h1>
          <p className="mb-0 mt-1 text-sm text-muted-grey">{t.intro}</p>
        </div>
        {years.length > 1 && (
          <label className="text-sm font-medium text-charcoal">
            {t.year}{' '}
            <select value={year} onChange={(e) => setYear(e.target.value)} className="ml-1 rounded-md border border-border bg-white px-2 py-1">
              <option value="">{t.allYears}</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && (
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
      )}
      {!error && invoices === null && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-grey">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.loading}
        </p>
      )}
      {invoices?.length === 0 && <p className="mb-0 mt-4 text-sm text-muted-grey">{t.empty}</p>}
      {invoices && invoices.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-grey">
                <th className="py-2 pr-3 font-semibold">{t.number}</th>
                <th className="py-2 pr-3 font-semibold">{t.service}</th>
                <th className="py-2 pr-3 font-semibold">{t.date}</th>
                <th className="py-2 pr-3 font-semibold">{t.duration}</th>
                <th className="py-2 pr-3 text-right font-semibold">{t.amount}</th>
                <th className="py-2 pr-3 font-semibold">{t.status}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const status = inv.paymentStatus ?? 'unpaid';
                return (
                  <tr key={inv.bookingId} className="border-b border-border last:border-0">
                    <td className="py-3 pr-3 font-semibold tabular-nums">{inv.number}</td>
                    <td className="py-3 pr-3">{tc.services[inv.serviceId as keyof typeof tc.services] ?? inv.serviceId}</td>
                    <td className="py-3 pr-3">{f.dateLong(inv.preferredDate)}</td>
                    <td className="py-3 pr-3">{inv.durationMinutes ? f.hours(inv.durationMinutes) : '–'}</td>
                    <td className="py-3 pr-3 text-right font-semibold tabular-nums">{f.euro(inv.totalCents)}</td>
                    <td className="py-3 pr-3">
                      <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-bold', TONE[status] ?? TONE.unpaid)}>
                        {t.paymentStatus[status] ?? status}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button type="button" onClick={() => download(inv)} disabled={busy === inv.bookingId} aria-label={t.downloadLabel(inv.number)} className="button button-quiet button-small">
                        {busy === inv.bookingId ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                        {t.download}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
