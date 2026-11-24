'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { CircleAlert } from 'lucide-react';

import { Tabs, TabsList, TabsTrigger } from '@/componets/ui/tabs';
import { qs } from '@/lib/api';
import { StatusBadge } from '@/componets/site/status-badge';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminPayment, AdminPaymentWithRefunds, Pagination, PaymentMethod } from '@/lib/types';
import { cn } from '@/lib/utils';

import cashMessages from '../_cash-messages';
import moneyMessages from '../_money-messages';
import { RefundDialog, refundableCents } from '../_components/refund-dialog';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, PaginationBar } from '../_components/states';
import { useApi, useQueryParams } from '../_components/use-api';
import messages from './_messages';

const KEYS = ['status', 'page', 'bookingId'] as const;

const STATUS_CLASSES: Record<AdminPaymentWithRefunds['status'], string> = {
  partially_refunded: 'bg-amber-50 text-amber-800 border-amber-200',
  created: 'bg-gray-100 text-gray-700 border-gray-200',
  processing: 'bg-sky-50 text-sky-800 border-sky-200',
  paid: 'bg-mint text-pine border-sage',
  failed: 'bg-red-50 text-red-700 border-red-200',
  expired: 'bg-gray-100 text-gray-600 border-gray-200',
  refunded: 'bg-amber-50 text-amber-800 border-amber-200',
};

const TAB_STATUSES: AdminPayment['status'][] = ['paid', 'processing', 'failed', 'refunded'];

interface PaymentsResponse {
  onlinePaymentAvailable: boolean;
  /** Online methods that are configured on the server */
  methods?: PaymentMethod[];
  pagination: Pagination;
  payments: AdminPaymentWithRefunds[];
}

type OnlineProvider = Exclude<AdminPayment['provider'], 'cash'>;

const PROVIDER_NAMES: Record<OnlineProvider, string> = { stripe: 'Stripe', paypal: 'PayPal' };
const PROVIDER_KEYS: Record<OnlineProvider, string> = {
  stripe: 'STRIPE_SECRET_KEY',
  paypal: 'PAYPALAPIKEY / PAYPALSECRET_KEY',
};
const PROVIDER_CLASSES: Record<AdminPayment['provider'], string> = {
  stripe: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  paypal: 'bg-sky-50 text-sky-800 border-sky-200',
  cash: 'bg-lime-50 text-lime-800 border-lime-200',
};

/** Display name of a provider; cash is translated ("Bar") */
const providerName = (provider: AdminPayment['provider'] | PaymentMethod | undefined, cashLabel = 'Bar') =>
  provider === 'cash' ? cashLabel : PROVIDER_NAMES[provider ?? 'stripe'] ?? provider ?? 'Stripe';

function PaymentsList() {
  const t = useMessages(messages);
  const cash = useMessages(cashMessages);
  const tm = useMessages(moneyMessages).refund;
  const f = useFormat();
  const { values: params, setParams } = useQueryParams(KEYS);
  const status = params.status ?? '';
  const page = Number(params.page) || 1;

  const { data, error, loading, reload } = useApi<PaymentsResponse>(
    `/admin/payments${qs({ status, page, limit: 20, bookingId: params.bookingId })}`
  );

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.description}
      />

      {data && !data.onlinePaymentAvailable && (
        <div className="mb-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="m-0">
            {t.notConfiguredBefore} <code>STRIPE_SECRET_KEY</code> {t.notConfiguredMiddle} <code>STRIPE_WEBHOOK_SECRET</code>{' '}
            {t.notConfiguredIn} <code>server/.env</code>
            {t.notConfiguredAfter.startsWith('.') ? '' : ' '}
            {t.notConfiguredAfter}
          </p>
        </div>
      )}

      {data && data.onlinePaymentAvailable && data.methods && (
        <div className="mb-4 space-y-1 text-sm text-muted-grey">
          <p className="flex flex-wrap items-center gap-2">
            {t.activeMethods}
            {data.methods.map((method) => (
              <span
                key={method}
                className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold', PROVIDER_CLASSES[method])}
              >
                {providerName(method, cash.provider)}
              </span>
            ))}
          </p>
          {(['stripe', 'paypal'] as const)
            .filter((method) => !data.methods?.includes(method))
            .map((method) => (
              <p key={method} className="text-xs text-amber-800">
                {t.methodMissing(PROVIDER_NAMES[method], PROVIDER_KEYS[method])}
              </p>
            ))}
        </div>
      )}

      {params.bookingId && (
        <p className="mb-4 text-sm text-muted-grey">
          {t.filteredByBooking}{' '}
          <button type="button" className="font-semibold text-pine underline" onClick={() => setParams({ bookingId: '', page: '' })}>
            {t.removeFilter}
          </button>
        </p>
      )}

      <Tabs value={status} onValueChange={(value) => setParams({ status: value, page: '' })} className="mb-4">
        <TabsList aria-label={t.tabsLabel} className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="">{t.all}</TabsTrigger>
          {TAB_STATUSES.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t.status[value]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading && !data ? (
        <ListSkeleton label={t.loading} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.payments.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyText} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border bg-white">
            <table className="w-full min-w-[860px] text-sm">
              <caption className="sr-only">{t.caption}</caption>
              <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.colBooking}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.colCustomer}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.colAmount}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.colProvider}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.colStatus}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.colCreated}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.colPaid}</th>
                  <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">{t.colActions}</span></th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment._id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      {payment.booking ? (
                        <Link href={`/admin/buchungen/${payment.booking._id}`} className="font-semibold text-pine hover:underline">
                          {payment.booking.reference}
                        </Link>
                      ) : (
                        '–'
                      )}
                      {payment.booking && (
                        <div className="mt-1">
                          <StatusBadge kind="booking" status={payment.booking.status} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>{payment.customer?.name ?? '–'}</div>
                      <div className="text-xs text-muted-grey">{payment.customer?.email}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">{f.euro(payment.amountCents)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                          PROVIDER_CLASSES[payment.provider] ?? PROVIDER_CLASSES.stripe
                        )}
                      >
                        {providerName(payment.provider, cash.provider)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                          STATUS_CLASSES[payment.status]
                        )}
                      >
                        {t.status[payment.status] ?? payment.status}
                      </span>
                      {payment.failureReason && payment.status !== 'expired' && (
                        <div className="mt-1 text-xs text-red-700">{payment.failureReason}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-grey">{f.dateTime(payment.createdAt)}</td>
                    <td className="px-4 py-3 text-muted-grey">{f.dateTime(payment.paidAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {payment.status === 'paid' && payment.provider === 'cash' && (
                        <span className="whitespace-nowrap text-xs text-muted-grey">{cash.noRefund}</span>
                      )}
                      {(payment.status === 'paid' || payment.status === 'partially_refunded') && payment.provider !== 'cash' && (
                        <div className="flex flex-col items-end gap-1">
                          {(payment.refundedCents ?? 0) > 0 && (
                            <span className="text-xs text-muted-grey">{tm.remaining(f.euro(refundableCents(payment)))}</span>
                          )}
                          <RefundDialog payment={payment} providerName={providerName(payment.provider)} label={t.refund} onDone={reload} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar pagination={data.pagination} onPageChange={(next) => setParams({ page: next })} />
        </>
      )}
    </>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <PaymentsList />
    </Suspense>
  );
}
