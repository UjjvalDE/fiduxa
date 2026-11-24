'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarPlus, ChevronRight, CreditCard, LoaderCircle, MessageSquare, TimerOff } from 'lucide-react';

import { api, qs } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import common from '@/lib/i18n/messages/common';
import type { Booking, PersonRef } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CleanerAvatar } from '@/componets/site/cleaner-avatar';
import { StatusBadge } from '@/componets/site/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componets/ui/tabs';
import { ErrorBox } from '../../buchung/_components/form-field';
import { HoldCountdown } from '../../zahlung/_components/countdown';
import { slotRange } from '../../_shared/slot-range';
import messages from '../_messages';
import feedbackMessages from './feedback-messages';
import { bookingAmount, firstName, isHoldExpired, needsPayment, nextActionKey, paymentHref } from './booking-helpers';

type Scope = 'upcoming' | 'past';

/** assignedWorker in GET /bookings/my-bookings: `{ _id, name, avatarUpdatedAt }` */
type ListWorker = PersonRef & { avatarUpdatedAt?: string | null };

const assignedCleaner = (booking: Booking) => {
  const w = booking.assignedWorker && typeof booking.assignedWorker === 'object' ? (booking.assignedWorker as ListWorker) : null;
  if (!w?._id) return null;
  const stamp = w.avatarUpdatedAt ? new Date(w.avatarUpdatedAt).getTime() : NaN;
  return {
    name: firstName(w.name),
    avatarUrl: Number.isFinite(stamp) ? `/api/v1/cleaners/${encodeURIComponent(w._id)}/avatar?v=${stamp}` : null,
  };
};

function useBookings(scope: Scope) {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ bookings: Booking[]; unread?: Record<string, number> }>(`/bookings/my-bookings${qs({ scope })}`);
      setBookings(res.bookings);
      setUnread(res.unread ?? {});
    } catch (e) {
      setError(e ?? new Error('unknown'));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  return { bookings, unread, loading, error, reload: load };
}

function BookingCard({ booking, unread, onHoldExpired }: { booking: Booking; unread: number; onHoldExpired: () => void }) {
  const t = useMessages(messages);
  const tf = useMessages(feedbackMessages);
  const cleaner = assignedCleaner(booking);
  const tc = useMessages(common);
  const f = useFormat();
  const payNow = needsPayment(booking);
  const expired = isHoldExpired(booking);
  const title = tc.services[booking.serviceId] ?? booking.serviceId;
  const showPaymentBadge = booking.payment && booking.status !== 'expired' && nextActionKey(booking.status) !== 'legacy';

  return (
    <li className="group relative flex flex-col gap-3 rounded-2xl border border-border bg-white p-5 transition-colors focus-within:ring-2 focus-within:ring-pine focus-within:ring-offset-2 hover:border-sage sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* Stretched link: the whole card opens the details */}
          <Link
            href={`/konto/buchungen/${booking._id}`}
            className="text-base font-bold text-pine-dark outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
          >
            {title}
            <span className="sr-only">{t.list.detailsSr(booking.reference)}</span>
          </Link>
          <StatusBadge kind="booking" status={booking.status} />
          {showPaymentBadge && booking.payment && <StatusBadge kind="payment" status={booking.payment.status} />}
          {unread > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-pine px-2 py-0.5 text-xs font-bold text-white">
              <MessageSquare className="h-3 w-3" aria-hidden="true" /> {tf.messages.badge(unread)}
            </span>
          )}
        </div>
        <p className="mb-0 mt-1 text-sm text-charcoal">
          {f.dateShort(booking.preferredDate)} · <span className="tabular-nums">{slotRange(f, booking.slot, booking.slotEnd, booking.estimate?.durationMinutes)}</span>
        </p>
        <p className="mb-0 mt-1 text-xs text-muted-grey">{t.list.reference(booking.reference)}</p>
        {cleaner && (
          <p className="mb-0 mt-2 flex items-center gap-2 text-sm text-charcoal">
            <CleanerAvatar name={cleaner.name} src={cleaner.avatarUrl} size="sm" alt="" className="!h-8 !w-8 text-xs" />
            <span>
              <span className="text-muted-grey">{t.cleaner.title}:</span> <strong className="text-pine-dark">{cleaner.name}</strong>
            </span>
          </p>
        )}

        {payNow ? (
          <div className="relative z-10 mt-3 flex flex-wrap items-center gap-3">
            <Link
              href={paymentHref(booking._id)}
              className="button button-small focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
            >
              <CreditCard className="h-4 w-4" aria-hidden="true" /> {t.list.payNow}
            </Link>
            {booking.holdExpiresAt && <HoldCountdown expiresAt={booking.holdExpiresAt} compact onExpire={onHoldExpired} />}
          </div>
        ) : expired ? (
          <Link
            href="/buchung"
            className="relative z-10 mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-pine underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
          >
            <TimerOff className="h-4 w-4" aria-hidden="true" /> {t.list.expiredRebook}
          </Link>
        ) : (
          <p className="mb-0 mt-2 text-sm text-muted-grey">{t.nextAction[nextActionKey(booking.status)]}</p>
        )}
      </div>
      <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-center">
        <span className="text-right">
          <span className="block text-xs text-muted-grey">{t.list.price}</span>
          <span className="text-lg font-bold tabular-nums text-pine-dark">{f.euro(bookingAmount(booking))}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-bold text-pine" aria-hidden="true">
          {t.list.details} <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </li>
  );
}

function ScopeList({ scope }: { scope: Scope }) {
  const t = useMessages(messages).list;
  const { locale } = useLocale();
  const { bookings, unread, loading, error, reload } = useBookings(scope);
  // Re-render when a hold runs out so the card switches to "expired"
  const [, setTick] = useState(0);
  const onHoldExpired = useCallback(() => setTick((n) => n + 1), []);

  if (loading && !bookings) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-muted-grey" role="status">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.loading}
      </p>
    );
  }
  if (error) return <ErrorBox message={translateApiError(error, locale)} onRetry={reload} />;
  if (!bookings || bookings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center">
        <p className="m-0 text-base font-bold text-pine-dark">{scope === 'upcoming' ? t.emptyUpcomingTitle : t.emptyPastTitle}</p>
        <p className="mx-auto mb-5 mt-2 max-w-sm text-sm leading-relaxed text-muted-grey">
          {scope === 'upcoming' ? t.emptyUpcomingText : t.emptyPastText}
        </p>
        {scope === 'upcoming' && (
          <Link href="/buchung" className="button button-small">
            {t.bookCta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    );
  }
  return (
    <ul className={cn('m-0 grid list-none gap-3 p-0', loading && 'opacity-60')} aria-busy={loading}>
      {bookings.map((b) => (
        <BookingCard key={b._id} booking={b} unread={unread[b._id] ?? 0} onHoldExpired={onHoldExpired} />
      ))}
    </ul>
  );
}

export function BookingsList() {
  const t = useMessages(messages).list;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="!m-0 !text-2xl !leading-tight sm:!text-3xl">{t.title}</h1>
        <Link href="/buchung" className="button button-small">
          <CalendarPlus className="h-4 w-4" aria-hidden="true" /> {t.newBooking}
        </Link>
      </div>
      <Tabs defaultValue="upcoming">
        <TabsList className="mb-5 h-auto rounded-[12px] border border-border bg-white p-1">
          <TabsTrigger value="upcoming" className="rounded-[10px] px-4 py-2 text-sm font-bold data-[state=active]:bg-mint data-[state=active]:text-pine-dark">
            {t.upcoming}
          </TabsTrigger>
          <TabsTrigger value="past" className="rounded-[10px] px-4 py-2 text-sm font-bold data-[state=active]:bg-mint data-[state=active]:text-pine-dark">
            {t.past}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">
          <ScopeList scope="upcoming" />
        </TabsContent>
        <TabsContent value="past">
          <ScopeList scope="past" />
        </TabsContent>
      </Tabs>
      <div className="mt-8 flex flex-col items-start gap-3 rounded-2xl bg-pine-dark p-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="m-0 text-lg font-bold">{t.promoTitle}</p>
          <p className="m-0 mt-1 text-sm text-white/70">{t.promoText}</p>
        </div>
        <Link href="/buchung" className="button button-light button-small">
          {t.promoCta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
