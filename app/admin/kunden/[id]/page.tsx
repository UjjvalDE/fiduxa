'use client';

import Link from 'next/link';
import { CalendarSearch, Mail, Phone, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';

import { StatusBadge } from '@/componets/site/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componets/ui/table';
import { api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { Booking } from '@/lib/types';

import { ConfirmAction } from '../../_components/confirm-action';
import {
  ActiveBadge,
  DetailSkeleton,
  EmptyState,
  ErrorState,
  InfoList,
  PageHeader,
  SectionCard,
} from '../../_components/states';
import { useApi } from '../../_components/use-api';
import messages from '../_messages';

interface CustomerDetail {
  customer: { id: string; name: string; email: string; phone?: string; isActive: boolean; createdAt: string };
  bookings: (Pick<Booking, '_id' | 'reference' | 'serviceId' | 'status' | 'preferredDate' | 'slot' | 'createdAt'> & {
    estimate?: { totalCents: number };
    quotation?: { amountCents: number };
  })[];
}

export default function AdminCustomerDetailPage({ params }: { params: { id: string } }) {
  const { data, error, errorStatus, reload, setData } = useApi<CustomerDetail>(`/admin/customers/${params.id}`);
  const t = useMessages(messages);
  const c = useMessages(common);
  const f = useFormat();

  if (error && !data) {
    return (
      <>
        <PageHeader title={t.customer} backHref="/admin/kunden" backLabel={t.allCustomers} />
        <ErrorState message={error} onRetry={errorStatus === 404 || errorStatus === 400 ? undefined : reload} />
      </>
    );
  }
  if (!data) return <DetailSkeleton />;

  const { customer, bookings } = data;

  const toggle = async () => {
    const isActive = !customer.isActive;
    await api.patch(`/admin/customers/${customer.id}/status`, { isActive });
    setData((prev) => (prev ? { ...prev, customer: { ...prev.customer, isActive } } : prev));
    toast.success(isActive ? t.activated : t.deactivated);
  };

  return (
    <>
      <PageHeader
        backHref="/admin/kunden"
        backLabel={t.allCustomers}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {customer.name}
            <ActiveBadge active={customer.isActive} />
          </span>
        }
        description={t.registeredAt(f.dateTime(customer.createdAt))}
        actions={
          customer.isActive ? (
            <ConfirmAction
              trigger={
                <>
                  <UserX className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t.deactivate}
                </>
              }
              triggerClassName="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
              title={t.deactivateTitle}
              description={t.deactivateText}
              confirmLabel={t.deactivate}
              destructive
              onConfirm={toggle}
            />
          ) : (
            <ConfirmAction
              trigger={
                <>
                  <UserCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t.activate}
                </>
              }
              title={t.activateTitle}
              description={t.activateText}
              confirmLabel={t.activate}
              onConfirm={toggle}
            />
          )
        }
      />

      <div className="space-y-4">
        <SectionCard id="kontakt" title={t.contact}>
          <InfoList
            items={[
              [
                t.email,
                <a key="m" href={`mailto:${customer.email}`} className="inline-flex items-center gap-1 text-pine hover:underline">
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  {customer.email}
                </a>,
              ],
              [
                t.phone,
                customer.phone ? (
                  <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1 text-pine hover:underline">
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    {customer.phone}
                  </a>
                ) : (
                  '–'
                ),
              ],
            ]}
          />
        </SectionCard>

        <SectionCard id="buchungen" title={t.bookingsTitle(bookings.length)}>
          {bookings.length === 0 ? (
            <EmptyState icon={CalendarSearch} title={t.noBookings} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{t.colReference}</TableHead>
                    <TableHead scope="col">{t.colService}</TableHead>
                    <TableHead scope="col">{t.colDate}</TableHead>
                    <TableHead scope="col">{t.colStatus}</TableHead>
                    <TableHead scope="col" className="text-right">
                      {t.colAmount}
                    </TableHead>
                    <TableHead scope="col">{t.colCreated}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((b) => (
                    <TableRow key={b._id}>
                      <TableCell>
                        <Link href={`/admin/buchungen/${b._id}`} className="font-mono text-xs font-semibold text-pine hover:underline">
                          {b.reference}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{c.services[b.serviceId] ?? b.serviceId}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{f.date(b.preferredDate)}</TableCell>
                      <TableCell>
                        <StatusBadge kind="booking" status={b.status} />
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {f.euro(b.quotation?.amountCents ?? b.estimate?.totalCents)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-grey">{f.dateTime(b.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}
