'use client';

import Link from 'next/link';
import { AlertTriangle, Clock, ExternalLink, History, Mail, PawPrint, Phone, ScrollText } from 'lucide-react';

import { MessageThread } from '@/componets/site/message-thread';

import { StatusBadge } from '@/componets/site/status-badge';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import catalogue, { type ExtraId } from '@/lib/i18n/messages/catalogue';
import common from '@/lib/i18n/messages/common';
import type { Booking } from '@/lib/types';

import adminMessages from '../../_messages';
import bookingMessages, { LANGUAGE_NAMES } from '../_messages';
import { AdminNotes, AssignWorker, StatusActions } from '../../_components/booking-actions';
import { EditBookingButton } from '../../_components/booking-edit';
import { ChangeLogCard, FeedbackCard } from '../../_components/booking-insights';
import { QuotationHistory } from '../../_components/booking-quotation';
import { BookingPaymentCard } from '../../_components/booking-payment';
import { BookingPricingCard } from '../../_components/booking-pricing';
import { WorkerPayoutCard } from '../../_components/payout-parts';
import { historyActor } from '../../_components/labels';
import { DetailSkeleton, ErrorState, InfoList, PageHeader, SectionCard } from '../../_components/states';
import { useApi } from '../../_components/use-api';

function EstimateBreakdown({ booking }: { booking: Booking }) {
  const t = useMessages(bookingMessages);
  const f = useFormat();
  const e = booking.estimate;
  if (!e) return null;
  const rows: [string, string][] = [
    [t.detail.labour(f.hours(e.durationMinutes), f.euro(e.hourlyRateCents)), f.euro(e.labourCents)],
    [t.detail.extraFees, f.euro(e.extraFeesCents)],
    [t.detail.subtotal, f.euro(e.subtotalCents)],
  ];
  if (e.discountCents) rows.push([t.detail.discount, `− ${f.euro(e.discountCents)}`]);

  return (
    <SectionCard
      id="schaetzung"
      title={t.detail.estimateSection}
      description={t.detail.estimateDescription(
        f.dateTime(e.calculatedAt),
        e.conditionFactor != null ? f.number(e.conditionFactor) : '–'
      )}
    >
      <dl className="divide-y divide-border text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2">
            <dt className="text-muted-grey">{label}</dt>
            <dd className="text-charcoal">{value}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 py-2 font-semibold">
          <dt className="text-pine-dark">
            {t.detail.total}
            {e.pricesIncludeVat ? t.detail.inclVat : ''}
          </dt>
          <dd className="text-pine-dark">{f.euro(e.totalCents)}</dd>
        </div>
      </dl>
    </SectionCard>
  );
}

function StatusTimeline({ booking }: { booking: Booking }) {
  const t = useMessages(bookingMessages);
  const a = useMessages(adminMessages);
  const c = useMessages(common);
  const f = useFormat();
  const entries = [...(booking.statusHistory ?? [])].reverse();
  const statusLabel = (status: string) =>
    (c.bookingStatus as Record<string, { label: string }>)[status]?.label ?? status;
  return (
    <SectionCard id="statusverlauf" title={t.detail.timeline}>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-grey">{t.detail.noHistory}</p>
      ) : (
        <ol className="relative space-y-4 border-l border-border pl-5">
          {entries.map((entry, i) => (
            <li key={`${entry.changedAt}-${i}`} className="relative">
              <span
                className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white ${i === 0 ? 'bg-pine' : 'bg-sage'}`}
                aria-hidden="true"
              />
              <p className="text-sm font-semibold text-charcoal">{statusLabel(entry.status)}</p>
              <p className="text-xs text-muted-grey">
                {f.dateTime(entry.changedAt)} · {historyActor(entry, a.ui.system)}
              </p>
              {entry.note && <p className="mt-1 text-sm text-charcoal">{entry.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

/** Reservation notice for unpaid bookings */
function HoldNotice({ booking }: { booking: Booking }) {
  const t = useMessages(bookingMessages);
  const f = useFormat();
  if (booking.status !== 'payment_pending') return null;
  const expiresAt = booking.holdExpiresAt ? new Date(booking.holdExpiresAt) : null;
  const expired = expiresAt ? expiresAt.getTime() < Date.now() : false;
  return (
    <div role="status" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="flex items-center gap-2 font-semibold">
        <Clock className="h-4 w-4" aria-hidden="true" />
        {t.detail.holdTitle}
      </p>
      {expiresAt && (
        <p className="mt-1">{expired ? t.detail.holdExpired : t.detail.holdActive(f.dateTime(booking.holdExpiresAt))}</p>
      )}
      {booking.payment?.method === 'invoice' && <p className="mt-1">{t.detail.invoiceMode}</p>}
      <p className="mt-1">{t.detail.holdManual}</p>
    </div>
  );
}

export default function AdminBookingDetailPage({ params }: { params: { id: string } }) {
  const t = useMessages(bookingMessages);
  const c18 = useMessages(common);
  const cat = useMessages(catalogue);
  const f = useFormat();
  const a = useMessages(adminMessages);
  const { locale } = useLocale();
  const { data, error, errorStatus, reload } = useApi<{ booking: Booking }>(`/admin/bookings/${params.id}`);

  if (error && !data) {
    return (
      <>
        <PageHeader title={t.detail.title} backHref="/admin/buchungen" backLabel={t.detail.allBookings} />
        <ErrorState message={error} onRetry={errorStatus === 404 || errorStatus === 400 ? undefined : reload} />
      </>
    );
  }
  if (!data) return <DetailSkeleton />;

  const b = data.booking;
  const c = b.customerDetails;
  const slotLabel = f.slot(b.slot, b.slotEnd);
  const serviceName = c18.services[b.serviceId] ?? b.serviceId;
  const extraLabel = (id: string, fallback: string) => cat.extras[id as ExtraId]?.label ?? fallback;
  const fullAddress = `${c.address}, ${c.postcode} Berlin`;
  const customerId = typeof b.customer === 'object' && b.customer ? b.customer._id : b.customer;

  return (
    <>
      <PageHeader
        backHref="/admin/buchungen"
        backLabel={t.detail.allBookings}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{b.reference}</span>
            <StatusBadge kind="booking" status={b.status} />
            {b.payment && <StatusBadge kind="payment" status={b.payment.status} />}
          </span>
        }
        description={`${serviceName} · ${f.dateLong(b.preferredDate)} · ${slotLabel} · ${t.detail.received(f.dateTime(b.createdAt))}`}
        actions={
          <>
            <EditBookingButton booking={b} onChanged={reload} />
            <Link
              href={`/admin/protokoll?entityId=${b._id}`}
              className="inline-flex items-center gap-2 rounded-md border border-input bg-white px-3 py-2 text-sm font-medium text-pine hover:bg-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ScrollText className="h-4 w-4" aria-hidden="true" />
              {t.detail.audit}
            </Link>
          </>
        }
      />

      <HoldNotice booking={b} />

      {b.job?.issueReported && (
        <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {t.detail.issueReported}
          </p>
          <p className="mt-1 whitespace-pre-line break-words">{b.job.issueReported}</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard id="kunde" title={t.detail.customerSection}>
            <InfoList
              items={[
                [
                  t.detail.name,
                  customerId ? (
                    <Link href={`/admin/kunden/${customerId}`} className="text-pine hover:underline">
                      {c.name}
                    </Link>
                  ) : (
                    c.name
                  ),
                ],
                [
                  t.detail.email,
                  c.email ? (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-pine hover:underline">
                      <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                      {c.email}
                    </a>
                  ) : (
                    '–'
                  ),
                ],
                [
                  t.detail.phone,
                  <a key="tel" href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-pine hover:underline">
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    {c.phone}
                  </a>,
                ],
                [
                  t.detail.address,
                  <a
                    key="map"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-pine hover:underline"
                  >
                    {c.address}, {c.postcode}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">{t.detail.opensMaps}</span>
                  </a>,
                ],
                [t.detail.access, c.accessNotes ? <span className="whitespace-pre-line">{c.accessNotes}</span> : '–'],
                [t.detail.notes, b.notes ? <span className="whitespace-pre-line">{b.notes}</span> : '–'],
                [
                  t.detail.pets,
                  b.pets ? (
                    <span key="pets" className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      <PawPrint className="h-3.5 w-3.5" aria-hidden="true" />
                      {t.detail.petsYes}
                    </span>
                  ) : (
                    a.ui.no
                  ),
                ],
                [t.detail.language, b.locale ? LANGUAGE_NAMES[locale][b.locale] ?? b.locale : '–'],
              ]}
            />
          </SectionCard>

          <SectionCard id="objekt" title={t.detail.objectSection}>
            <InfoList
              items={[
                [t.detail.service, serviceName],
                [t.detail.area, `${f.number(b.areaM2)} m²`],
                [t.detail.condition, c18.conditions[b.condition]?.label ?? b.condition],
                [t.detail.frequency, c18.frequencies[b.frequency] ?? b.frequency],
                [t.detail.appointment, `${f.date(b.preferredDate)}, ${slotLabel}`],
                [t.detail.duration, f.hours(b.estimate?.durationMinutes)],
              ]}
            />
            <div className="mt-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.detail.extras}</h3>
              {b.estimate?.extras?.length ? (
                <ul className="mt-2 divide-y divide-border rounded-xl border border-border text-sm">
                  {b.estimate.extras.map((x) => (
                    <li key={x.id} className="flex justify-between gap-3 px-3 py-2">
                      <span className="text-charcoal">{extraLabel(x.id, x.label)}</span>
                      <span className="whitespace-nowrap text-muted-grey">
                        {c18.units.minutesShort(x.minutes)} · {f.euro(x.priceCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-grey">{t.detail.noExtras}</p>
              )}
            </div>
          </SectionCard>

          <QuotationHistory booking={b} />
          <EstimateBreakdown booking={b} />
          <MessageThread path={`/admin/bookings/${b._id}/messages`} viewer="admin" />
        </div>

        <div className="space-y-4">
          <StatusActions booking={b} onChanged={reload} />
          <AssignWorker booking={b} onChanged={reload} />
          <BookingPricingCard booking={b} />
          <BookingPaymentCard booking={b} onChanged={reload} />
          <WorkerPayoutCard booking={b} onChanged={reload} />

          {(b.job?.onTheWayAt || b.job?.startedAt || b.job?.completedAt || b.job?.workerNote) && (
            <SectionCard id="einsatz" title={t.detail.jobSection}>
              <InfoList
                className="sm:grid-cols-1"
                items={[
                  [t.detail.onTheWay, f.dateTime(b.job?.onTheWayAt)],
                  [t.detail.started, f.dateTime(b.job?.startedAt)],
                  [t.detail.completed, f.dateTime(b.job?.completedAt)],
                  [t.detail.workerNote, b.job?.workerNote ? <span className="whitespace-pre-line">{b.job.workerNote}</span> : '–'],
                ]}
              />
            </SectionCard>
          )}

          {b.status === 'cancelled' && b.cancellation && (
            <SectionCard id="storno" title={t.detail.cancellationSection}>
              <InfoList
                className="sm:grid-cols-1"
                items={[
                  [t.detail.cancelledAt, f.dateTime(b.cancellation.cancelledAt)],
                  [t.detail.reason, b.cancellation.reason || '–'],
                ]}
              />
            </SectionCard>
          )}

          <FeedbackCard booking={b} />
          <AdminNotes booking={b} />
          <ChangeLogCard booking={b} />
          <StatusTimeline booking={b} />

          <Link
            href={`/admin/protokoll?entityId=${b._id}`}
            className="flex items-center gap-2 rounded-2xl border border-border bg-white p-4 text-sm font-medium text-pine hover:bg-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <History className="h-4 w-4" aria-hidden="true" />
            {t.detail.allChanges}
          </Link>
        </div>
      </div>
    </>
  );
}
