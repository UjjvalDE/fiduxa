'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Banknote,
  CalendarPlus,
  Circle,
  CircleCheck,
  CircleX,
  CreditCard,
  LoaderCircle,
  MessageSquare,
  PawPrint,
  Repeat,
  Search,
  Sparkles,
  TimerOff,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { ApiError, api } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import catalogue from '@/lib/i18n/messages/catalogue';
import common from '@/lib/i18n/messages/common';
import profileMessages from '@/lib/i18n/messages/profile';
import type { Booking, BookingPayment, BookingStatus, BookingWithSeries, CancelPreview, CleanerCard as CleanerCardData, CustomerReview, PublicPricing } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CleanerAvatar } from '@/componets/site/cleaner-avatar';
import { MessageThread } from '@/componets/site/message-thread';
import { RatingBadge } from '@/componets/site/star-rating';
import { StatusBadge } from '@/componets/site/status-badge';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/componets/ui/alert-dialog';
import { Textarea } from '@/componets/ui/tesxtarea';
import { ErrorBox, FormField, textareaClass } from '../../buchung/_components/form-field';
import { EstimateBreakdown } from '../../buchung/_components/estimate-panel';
import { PricingBreakdown } from '../../_shared/price-breakdown';
import { HoldCountdown } from '../../zahlung/_components/countdown';
import messages from '../_messages';
import putzplanMessages from '../_putzplan-messages';
import feedbackMessages from './feedback-messages';
import { slotRange } from '../../_shared/slot-range';
import { ReviewSection } from './review-section';
import { ComplaintSection } from './complaint-section';
import { CustomerAdjustments } from './price-adjustments';
import { EditBooking } from './booking-edit';
import {
  DEFAULT_CANCELLATION_HOURS,
  bookingAmount,
  firstName,
  isCancellableStatus,
  isHoldExpired,
  needsPayment,
  isAwaitingConfirmation,
  nextActionKey,
  paymentHref,
  slotStartInstant,
} from './booking-helpers';

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-border bg-white p-5 sm:p-6', className)}>
      <h2 className="mb-4 mt-0 text-lg font-bold tracking-tight text-pine-dark">{title}</h2>
      {children}
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-bold uppercase tracking-wide text-muted-grey">{label}</dt>
      <dd className="m-0 text-sm text-charcoal">{children}</dd>
    </div>
  );
}

/** Cancellation cutoff from GET /pricing (falls back to 24 h) */
function useCancellationHours() {
  const [hours, setHours] = useState(DEFAULT_CANCELLATION_HOURS);
  useEffect(() => {
    let active = true;
    api
      .get<{ pricing: PublicPricing }>('/pricing')
      .then((res) => {
        if (active && res.pricing?.cancellationCutoffHours) setHours(res.pricing.cancellationCutoffHours);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return hours;
}

/** GET /customer/bookings/:id */
interface BookingDetailResponse {
  booking: Booking;
  cleaner: CleanerCardData | null;
  review: CustomerReview | null;
  canReview: boolean;
  unreadMessages: number;
}

export function BookingDetail({ id }: { id: string }) {
  const t = useMessages(messages);
  const tc = useMessages(common);
  const cat = useMessages(catalogue);
  const f = useFormat();
  const { locale } = useLocale();
  const cancellationHours = useCancellationHours();

  const tf = useMessages(feedbackMessages);
  const tpp = useMessages(putzplanMessages);
  const [detail, setDetail] = useState<Omit<BookingDetailResponse, 'booking'>>({ cleaner: null, review: null, canReview: false, unreadMessages: 0 });
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // Re-render when the hold runs out so the page switches to "expired"
  const [, setTick] = useState(0);
  const onHoldExpired = useCallback(() => setTick((n) => n + 1), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<BookingDetailResponse>(`/customer/bookings/${encodeURIComponent(id)}`);
      setBooking(res.booking);
      setDetail({
        cleaner: res.cleaner ?? null,
        review: res.review ?? null,
        canReview: Boolean(res.canReview),
        unreadMessages: res.unreadMessages ?? 0,
      });
    } catch (e) {
      setError(e ?? new Error('unknown'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Content loads client-side, so jump to #nachrichten / #bewertung (email links)
  // or to the review form (?feedback=1 from the feedback email) once it is there
  const loaded = Boolean(booking);
  const scrolledToHash = useRef(false);
  useEffect(() => {
    if (!loaded || scrolledToHash.current) return;
    scrolledToHash.current = true;
    const hash = window.location.hash.slice(1);
    const feedback = new URLSearchParams(window.location.search).get('feedback') === '1';
    const target = hash || (feedback ? 'bewertung' : '');
    if (!target) return;
    window.requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [loaded]);

  const onMessagesRead = useCallback(() => setDetail((d) => (d.unreadMessages ? { ...d, unreadMessages: 0 } : d)), []);

  if (loading && !booking) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-muted-grey" role="status">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.detail.loading}
      </p>
    );
  }

  if (error && !booking) {
    return (
      <div className="grid gap-4">
        <BackLink />
        <ErrorBox message={translateApiError(error, locale)} onRetry={load} />
      </div>
    );
  }

  if (!booking) return null;

  const payNow = needsPayment(booking);
  const expired = isHoldExpired(booking);
  const canCancel = isCancellableStatus(booking.status) && !expired;
  // Mirror of the server rule for PATCH /customer/bookings/:id (server still enforces):
  // editable statuses and more than the cutoff (24 h) before the start
  const editStart = slotStartInstant(booking.preferredDate, booking.slot);
  const canEdit =
    isCancellableStatus(booking.status) && !expired && (!editStart || Date.now() < editStart.getTime() - cancellationHours * 3600 * 1000);
  const worker = booking.assignedWorker && typeof booking.assignedWorker === 'object' ? booking.assignedWorker : null;
  const history = (booking.statusHistory ?? []).slice().sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
  const isLegacy = nextActionKey(booking.status) === 'legacy';
  const awaiting = isAwaitingConfirmation(booking);
  const extraText = cat.extras as Record<string, { label: string } | undefined>;
  const statusLabels = tc.bookingStatus as Record<string, { label: string } | undefined>;
  const tp = tf.pets;

  return (
    <div className="grid gap-5">
      <BackLink />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="!m-0 !text-2xl !leading-tight sm:!text-3xl">{tc.services[booking.serviceId] ?? booking.serviceId}</h1>
            {awaiting ? <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">{t.awaiting.badge}</span> : <StatusBadge kind="booking" status={booking.status} />}
            {booking.payment && !isLegacy && booking.status !== 'expired' && <StatusBadge kind="payment" status={booking.payment.status} />}
            {(booking as BookingWithSeries).series && (
              <Link
                href="/konto/putzplan"
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-sage bg-mint px-2.5 py-0.5 text-xs font-semibold text-pine-dark hover:border-pine"
              >
                <Repeat className="h-3 w-3" aria-hidden="true" /> {tpp.chip}
              </Link>
            )}
          </div>
          <p className="mb-0 mt-2 text-sm text-muted-grey">
            {t.detail.reference} <strong className="text-pine-dark">{booking.reference}</strong> · {t.detail.bookedAt(f.dateTime(booking.createdAt))}
          </p>
          {!payNow && !expired && <p className="mb-0 mt-2 text-sm text-charcoal">{awaiting ? t.awaiting.text : t.nextAction[nextActionKey(booking.status)]}</p>}
        </div>
        {(canEdit || canCancel || booking.status === 'completed') && (
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            {booking.status === 'completed' && HOUSEHOLD_IDS.includes(booking.serviceId) && (
              <Link href={`/buchung?rebook=${encodeURIComponent(booking._id)}`} className="button button-small" data-testid="rebook">
                <CalendarPlus className="h-4 w-4" aria-hidden="true" /> {t.detail.rebook}
              </Link>
            )}
            {canEdit && (
              <EditBooking
                booking={booking}
                onSaved={(next) => {
                  setBooking(next);
                  load();
                }}
              />
            )}
            {canCancel && <CancelBooking booking={booking} onDone={setBooking} />}
          </div>
        )}
      </header>

      {detail.unreadMessages > 0 && (
        <a
          href="#nachrichten"
          className="flex items-center justify-between gap-3 rounded-2xl border border-sage bg-mint px-5 py-3 text-sm font-bold text-pine-dark hover:border-pine"
        >
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" aria-hidden="true" /> {tf.messages.unread(detail.unreadMessages)}
          </span>
          <span className="inline-flex items-center gap-1 text-pine">
            {tf.messages.show} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </a>
      )}

      {payNow && <PayNowCard booking={booking} onHoldExpired={onHoldExpired} />}
      {expired && <ExpiredCard />}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 content-start gap-5">
          <ReviewSection
            bookingId={booking._id}
            cleanerName={detail.cleaner?.firstName ?? (worker ? firstName(worker.name) : '')}
            review={detail.review}
            canReview={detail.canReview}
            plannedDurationMinutes={booking.estimate?.durationMinutes ?? null}
            recurring={booking.frequency !== 'one-time'}
            cash={booking.payment?.method === 'cash' ? { reportedCents: booking.payment.cashCollectedCents ?? null } : null}
            onSaved={(review) => setDetail((d) => ({ ...d, review, canReview: false }))}
          />
          {booking.status !== 'cancelled' && booking.status !== 'expired' && booking.status !== 'payment_pending' && <ComplaintSection bookingId={booking._id} />}
          <CustomerAdjustments booking={booking} onChanged={load} />
          <Card title={t.detail.appointmentTitle}>
            <dl className="m-0 grid gap-4 sm:grid-cols-2">
              <Item label={t.detail.date}>
                {f.dateLong(booking.preferredDate)}
                <br />
                <span className="tabular-nums">{slotRange(f, booking.slot, booking.slotEnd, booking.estimate?.durationMinutes)}</span>
              </Item>
              <Item label={t.detail.frequency}>{tc.frequencies[booking.frequency] ?? booking.frequency}</Item>
              <Item label={t.detail.area}>{booking.areaM2} m²</Item>
              <Item label={t.detail.condition}>{tc.conditions[booking.condition]?.label ?? booking.condition}</Item>
              <Item label={t.detail.duration}>{f.hours(booking.estimate?.durationMinutes)}</Item>
              {worker && (
                <Item label={t.detail.team}>
                  <span className="inline-flex items-center gap-1.5">
                    <UserRound className="h-4 w-4 text-pine" aria-hidden="true" /> {detail.cleaner?.firstName ?? firstName(worker.name)}
                  </span>
                </Item>
              )}
              {typeof booking.pets === 'boolean' && (
                <Item label={tp.petsLabel}>
                  <span className="inline-flex items-center gap-1.5">
                    <PawPrint className="h-4 w-4 text-pine" aria-hidden="true" /> {booking.pets ? tp.petsYes : tp.petsNo}
                  </span>
                </Item>
              )}
            </dl>
            <div className="mt-5 border-t border-border pt-4">
              <h3 className="mb-2 mt-0 text-sm font-bold text-pine-dark">{t.detail.extras}</h3>
              {booking.estimate?.extras?.length ? (
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {booking.estimate.extras.map((e) => (
                    <li key={e.id} className="rounded-full border border-border bg-cream px-3 py-1 text-xs font-semibold text-charcoal">
                      {extraText[e.id]?.label ?? e.label} · +{tc.units.minutesShort(e.minutes)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-sm text-muted-grey">{t.detail.noExtras}</p>
              )}
            </div>
          </Card>

          <Card title={t.detail.addressTitle}>
            <dl className="m-0 grid gap-4 sm:grid-cols-2">
              <Item label={t.detail.address}>
                {booking.customerDetails.address}
                <br />
                {booking.customerDetails.postcode} {t.detail.city}
              </Item>
              <Item label={t.detail.contact}>
                {booking.customerDetails.name}
                <br />
                {booking.customerDetails.phone}
                {booking.customerDetails.email && (
                  <>
                    <br />
                    <span className="break-all">{booking.customerDetails.email}</span>
                  </>
                )}
              </Item>
              <Item label={t.detail.access}>{booking.customerDetails.accessNotes || <span className="text-muted-grey">–</span>}</Item>
              <Item label={t.detail.notes}>
                <span className="whitespace-pre-line">{booking.notes || <span className="text-muted-grey">–</span>}</span>
              </Item>
            </dl>
            {booking.status === 'cancelled' && booking.cancellation?.reason && (
              <p className="mb-0 mt-4 text-sm text-muted-grey">{t.detail.cancelReason(booking.cancellation.reason)}</p>
            )}
          </Card>

          <div id="nachrichten" className="scroll-mt-28">
            <MessageThread path={`/customer/bookings/${encodeURIComponent(booking._id)}/messages`} viewer="consumer" onRead={onMessagesRead} />
          </div>
        </div>

        <div className="grid content-start gap-5">
          {worker && ['confirmed', 'in_progress', 'completed'].includes(booking.status) && (
            <AssignedCleanerCard booking={booking} name={firstName(worker.name)} cleaner={detail.cleaner} />
          )}
          {!worker && booking.status === 'confirmed' && (
            <section
              role="status"
              className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm leading-relaxed text-sky-900"
            >
              <Search className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="m-0">{t.cleaner.searching}</p>
            </section>
          )}
          {booking.payment && !isLegacy && booking.status !== 'expired' && <PaymentCard payment={booking.payment} amountCents={bookingAmount(booking)} />}
          {booking.estimate && (
            <Card title={t.detail.priceTitle}>
              {booking.pricing ? <PricingBreakdown pricing={booking.pricing} estimate={booking.estimate} /> : <EstimateBreakdown estimate={booking.estimate} />}
              <p className="mb-0 mt-3 text-xs leading-relaxed text-muted-grey">{t.detail.priceNote}</p>
            </Card>
          )}
          {history.length > 0 && (
            <Card title={t.detail.history}>
              <ol className="relative m-0 grid list-none gap-4 border-l border-border p-0 pl-5">
                {history.map((entry, index) => {
                  const label = statusLabels[entry.status]?.label ?? entry.status;
                  const last = index === history.length - 1;
                  return (
                    <li key={`${entry.status}-${entry.changedAt}`} className="relative">
                      <span
                        className={cn('absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2', last ? 'border-pine bg-pine' : 'border-sage bg-white')}
                        aria-hidden="true"
                      />
                      <p className={cn('m-0 text-sm', last ? 'font-bold text-pine-dark' : 'text-charcoal')}>{label}</p>
                      <p className="m-0 text-xs text-muted-grey">{f.dateTime(entry.changedAt)}</p>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Assigned cleaner & day-of-job progress ---------- */
function AssignedCleanerCard({ booking, name, cleaner }: { booking: Booking; name: string; cleaner: CleanerCardData | null }) {
  const t = useMessages(messages).cleaner;
  const tf = useMessages(feedbackMessages).cleaner;
  const tp = useMessages(profileMessages);
  const f = useFormat();
  const time = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleTimeString(f.tag, { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
      : null;
  const job = booking.job ?? {};
  const started = Boolean(job.startedAt) || booking.status === 'in_progress' || booking.status === 'completed';
  const completed = Boolean(job.completedAt) || booking.status === 'completed';
  const steps = [
    { key: 'assigned', label: t.assigned, done: true, at: booking.assignedAt ? f.dateTime(booking.assignedAt) : null },
    {
      key: 'onTheWay',
      label: job.onTheWayAt && !started ? t.onTheWaySince(time(job.onTheWayAt) ?? '') : t.onTheWay,
      done: Boolean(job.onTheWayAt) || started,
      at: job.onTheWayAt ? time(job.onTheWayAt) : null,
    },
    { key: 'started', label: t.started, done: started, at: time(job.startedAt) },
    { key: 'completed', label: t.completed, done: completed, at: time(job.completedAt) },
  ];
  const current = steps.reduce((idx, step, i) => (step.done ? i : idx), 0);

  return (
    <Card title={t.title}>
      {cleaner ? (
        <div>
          <div className="flex items-center gap-4">
            <CleanerAvatar name={cleaner.firstName} src={cleaner.avatarUrl} size="lg" alt={tf.photoOf(cleaner.firstName)} className="ring-mint" />
            <div className="grid min-w-0 gap-1">
              <p className="m-0 text-lg font-bold leading-tight text-pine-dark">{cleaner.firstName}</p>
              <RatingBadge avg={cleaner.ratingAvg} count={cleaner.ratingCount} className="w-fit" />
            </div>
          </div>
          <ul className="m-0 mt-4 grid list-none gap-1.5 p-0 text-sm text-charcoal">
            {(cleaner.jobsCompleted ?? 0) > 0 && (
              <li className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-pine" aria-hidden="true" /> {tp.jobsCompleted(cleaner.jobsCompleted ?? 0)}
              </li>
            )}
            {cleaner.reliabilityPct != null && (
              <li className="flex items-center gap-2" title={tp.reliabilityHint}>
                <BadgeCheck className="h-4 w-4 shrink-0 text-pine" aria-hidden="true" /> {tf.reliability(cleaner.reliabilityPct)}
              </li>
            )}
            {cleaner.petsOk && (
              <li className="flex items-center gap-2">
                <PawPrint className="h-4 w-4 shrink-0 text-pine" aria-hidden="true" /> {tp.petsOk}
              </li>
            )}
          </ul>
          {cleaner.specialties.length > 0 && (
            <ul className="m-0 mt-3 flex list-none flex-wrap gap-1.5 p-0" aria-label={tp.skills}>
              {cleaner.specialties.slice(0, 4).map((s) => (
                <li key={s} className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-pine-dark">
                  {tp.specialties[s] ?? s}
                </li>
              ))}
            </ul>
          )}
          <Link href={`/reinigungskraefte/${encodeURIComponent(cleaner.id)}`} className="text-link mt-4">
            {tf.viewProfile} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <p className="m-0 flex items-center gap-2 text-base font-bold text-pine-dark">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-mint text-pine" aria-hidden="true">
            <UserRound className="h-5 w-5" />
          </span>
          {name}
        </p>
      )}
      <ol aria-label={t.progressLabel} aria-live="polite" className="m-0 mt-4 grid list-none gap-3 border-t border-border p-0 pt-4">
        {steps.map((step, i) => (
          <li key={step.key} className="flex items-start gap-3" aria-current={i === current ? 'step' : undefined}>
            {step.done ? (
              <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-pine" aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-sage" aria-hidden="true" />
            )}
            <span className="min-w-0">
              <span className={cn('block text-sm', i === current ? 'font-bold text-pine-dark' : step.done ? 'text-charcoal' : 'text-muted-grey')}>
                {step.label}
                <span className="sr-only"> {step.done ? t.done : t.open}</span>
              </span>
              {/* "Unterwegs seit …" already contains the time while it is the latest step */}
              {step.done && step.at && (step.key !== 'onTheWay' || started) && (
                <span className="block text-xs text-muted-grey">{step.at}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function BackLink() {
  const t = useMessages(messages).detail;
  return (
    <Link href="/konto" className="text-link w-fit">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t.back}
    </Link>
  );
}

const HOUSEHOLD_IDS: string[] = ['home-cleaning', 'deep-cleaning', 'end-of-tenancy'];

/* ---------- Pay now (payment_pending with an active hold) ---------- */
function PayNowCard({ booking, onHoldExpired }: { booking: Booking; onHoldExpired: () => void }) {
  const t = useMessages(messages).pay;
  const f = useFormat();
  const failed = booking.payment?.status === 'failed';
  return (
    <section aria-labelledby="pay-now-title" className="rounded-2xl border border-pine bg-pine-dark p-5 text-white sm:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 id="pay-now-title" className="m-0 text-xl font-bold tracking-tight !text-white">
            {t.title}
          </h2>
          <p className="mb-0 mt-1 text-sm leading-relaxed text-white/75">{failed ? t.failed : t.text}</p>
          {booking.holdExpiresAt && (
            <div className="mt-4">
              <HoldCountdown expiresAt={booking.holdExpiresAt} tone="light" onExpire={onHoldExpired} />
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
          <p className="m-0 text-3xl font-bold tabular-nums text-lime">{f.euro(bookingAmount(booking))}</p>
          <Link href={paymentHref(booking._id)} className="button button-light">
            <CreditCard className="h-4 w-4" aria-hidden="true" /> {failed ? t.retry : t.button}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- Reservation expired ---------- */
function ExpiredCard() {
  const t = useMessages(messages).expired;
  return (
    <section aria-labelledby="expired-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cream text-muted-grey" aria-hidden="true">
          <TimerOff className="h-5 w-5" />
        </span>
        <div>
          <h2 id="expired-title" className="m-0 text-lg font-bold text-pine-dark">
            {t.title}
          </h2>
          <p className="mb-0 mt-1 text-sm leading-relaxed text-muted-grey">{t.text}</p>
        </div>
      </div>
      <Link href="/buchung" className="button button-small shrink-0">
        <CalendarPlus className="h-4 w-4" aria-hidden="true" /> {t.cta}
      </Link>
    </section>
  );
}

/* ---------- Payment status ---------- */
function PaymentCard({ payment, amountCents }: { payment: BookingPayment; amountCents: number | null }) {
  const t = useMessages(messages).payment;
  const f = useFormat();
  return (
    <Card title={t.title}>
      <dl className="m-0 grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-sm text-muted-grey">{t.status}</dt>
          <dd className="m-0">
            <StatusBadge kind="payment" status={payment.status} />
          </dd>
        </div>
        {payment.method && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-sm text-muted-grey">{t.method}</dt>
            <dd className="m-0 text-sm text-charcoal">{t.methods[payment.method]}</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <dt className="text-sm text-muted-grey">{t.amount}</dt>
          <dd className="m-0 text-sm font-bold tabular-nums text-pine-dark">{f.euro(payment.amountCents ?? amountCents)}</dd>
        </div>
        {payment.paidAt && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-sm text-muted-grey">{t.paidAt}</dt>
            <dd className="m-0 text-sm text-charcoal">{f.dateTime(payment.paidAt)}</dd>
          </div>
        )}
        {payment.refundedAt && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-sm text-muted-grey">{t.refundedAt}</dt>
            <dd className="m-0 text-sm text-charcoal">{f.dateTime(payment.refundedAt)}</dd>
          </div>
        )}
      </dl>
      {payment.status === 'refund_pending' && (
        <p className="mb-0 mt-4 rounded-[12px] border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">{t.refundPending}</p>
      )}
      {payment.method === 'invoice' && payment.status === 'unpaid' && <p className="mb-0 mt-4 text-sm text-muted-grey">{t.invoice}</p>}
      {payment.method === 'cash' && <CashNote payment={payment} amountCents={payment.amountCents ?? amountCents} />}
    </Card>
  );
}

/* ---------- Cash at the end of the job ---------- */
function CashNote({ payment, amountCents }: { payment: BookingPayment; amountCents: number | null }) {
  const t = useMessages(messages).payment;
  const f = useFormat();
  const collected = payment.cashCollectedCents != null || payment.status === 'paid';
  return (
    <div className="mt-4 flex items-start gap-3 rounded-[12px] border border-sage bg-mint p-3 text-sm leading-relaxed text-pine-dark">
      <Banknote className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="m-0 font-bold">
          {t.cashTitle(f.euro(amountCents))}{' '}
          <span
            className={cn(
              'ml-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold',
              collected ? 'bg-pine text-white' : 'bg-white text-amber-900 ring-1 ring-amber-200'
            )}
          >
            {collected ? t.cashPaid(f.euro(payment.cashCollectedCents ?? amountCents)) : t.cashOpen}
          </span>
        </p>
        {!collected && <p className="m-0 mt-1 text-muted-grey">{t.cashHint}</p>}
        {collected && payment.cashCollectedAt && <p className="m-0 mt-1 text-xs text-muted-grey">{f.dateTime(payment.cashCollectedAt)}</p>}
      </div>
    </div>
  );
}

/* ---------- Cancel ---------- */
interface CancelResponse {
  status: BookingStatus;
  payment?: BookingPayment;
  refunded?: boolean;
  fee?: { feeCents: number; feePct: number; refundCents: number; outstandingCents: number };
}

type CancelOutcome = 'refunded' | 'partialRefund' | 'feeOutstanding' | 'refundPending' | 'noCharge';

/**
 * Cancellation is always possible online. The dialog first loads the fee the
 * policy applies right now (GET …/cancel-preview) and shows it; the request
 * confirms exactly that fee (409 FEE_CHANGED → the new fee is shown again).
 */
function CancelBooking({ booking, onDone }: { booking: Booking; onDone: (b: Booking) => void }) {
  const t = useMessages(messages).cancel;
  const { locale } = useLocale();
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CancelPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [result, setResult] = useState<{ outcome: CancelOutcome; fee: CancelResponse['fee']; booking: Booking } | null>(null);
  const busyRef = useRef(false);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await api.get<CancelPreview>(`/customer/bookings/${booking._id}/cancel-preview`);
      setPreview(res);
    } catch (e) {
      setError(translateApiError(e, locale));
    } finally {
      setPreviewLoading(false);
    }
  }, [booking._id, locale]);

  const openDialog = () => {
    setOpen(true);
    setError(null);
    loadPreview();
  };

  const close = () => {
    setOpen(false);
    setError(null);
    // Apply the new state only after the dialog closed (the button disappears with it)
    if (result) onDone(result.booking);
  };

  const feeCents = preview?.feeCents ?? 0;
  const paid = (preview?.paidCents ?? 0) > 0 || booking.payment?.status === 'paid';
  const lines: string[] = [];
  if (booking.status === 'payment_pending') lines.push(t.pending);
  else if (preview) {
    if (preview.tier === 'free') {
      lines.push(t.freeUntil(f.dateTime(preview.cutoffs.freeUntil)));
      if (paid) lines.push(t.refundAmount(f.euro(preview.refundCents)));
    } else {
      lines.push(t.feeApplies(preview.feePct, f.euro(preview.feeCents)));
      if (preview.refundCents > 0) lines.push(t.refundAmount(f.euro(preview.refundCents)));
      else if (paid) lines.push(t.noRefund);
      if (preview.outstandingCents > 0) lines.push(t.outstanding(f.euro(preview.outstandingCents)));
    }
  }

  const cancel = async () => {
    if (busyRef.current) return;
    if (reason.trim().length > 1000) {
      setError(t.tooLong);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<CancelResponse>(`/customer/bookings/${booking._id}/cancel`, {
        reason: reason.trim(),
        ...(feeCents > 0 && { confirmFeeCents: feeCents }),
      });
      const fee = res.fee;
      const outcome: CancelOutcome =
        fee && fee.feeCents > 0
          ? fee.outstandingCents > 0
            ? 'feeOutstanding'
            : res.refunded
              ? 'partialRefund'
              : res.payment?.status === 'refund_pending'
                ? 'refundPending'
                : 'noCharge'
          : res.refunded
            ? 'refunded'
            : res.payment?.status === 'refund_pending'
              ? 'refundPending'
              : 'noCharge';
      const now = new Date().toISOString();
      setResult({
        outcome,
        fee,
        booking: {
          ...booking,
          status: res.status ?? 'cancelled',
          payment: res.payment ?? booking.payment,
          holdExpiresAt: null,
          cancellation: { cancelledAt: now, reason: reason.trim() },
          statusHistory: [...(booking.statusHistory ?? []), { status: 'cancelled', changedAt: now }],
        },
      });
      toast.success(t.toast);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'FEE_CHANGED' && e.body) {
        setPreview(e.body as unknown as CancelPreview);
        setError(t.feeChanged);
      } else {
        setError(translateApiError(e, locale));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const resultText = (r: NonNullable<typeof result>) => {
    switch (r.outcome) {
      case 'refunded':
        return t.refunded;
      case 'partialRefund':
        return t.partialRefund(f.euro(r.fee?.refundCents ?? 0), f.euro(r.fee?.feeCents ?? 0));
      case 'feeOutstanding':
        return t.feeOutstanding(f.euro(r.fee?.outstandingCents ?? 0));
      case 'refundPending':
        return t.refundPending;
      default:
        return r.fee && r.fee.feeCents > 0 ? t.feeKept(f.euro(r.fee.feeCents)) : t.noCharge;
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) openDialog();
        else close();
      }}
    >
      <button type="button" onClick={openDialog} className="button button-quiet button-small shrink-0 !text-red-700">
        <CircleX className="h-4 w-4" aria-hidden="true" /> {t.button}
      </button>
      <AlertDialogContent className="w-[calc(100%-32px)] rounded-2xl">
        {result ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-pine-dark">
                <CircleCheck className="h-5 w-5 text-pine" aria-hidden="true" /> {t.doneTitle}
              </AlertDialogTitle>
              <AlertDialogDescription role="status">{resultText(result)}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <button type="button" onClick={close} className="button button-small">
                {t.close}
              </button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-pine-dark">{t.title(booking.reference)}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="grid gap-1 text-sm text-muted-grey">
                  {previewLoading && !preview ? (
                    <p className="m-0 flex items-center gap-2">
                      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.loadingPreview}
                    </p>
                  ) : (
                    lines.map((line, i) => (
                      <p key={i} className={cn('m-0', i === 0 && feeCents > 0 && 'font-semibold text-red-700')}>
                        {line}
                      </p>
                    ))
                  )}
                  <p className="m-0">{t.irreversible}</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <FormField id="cancel-reason" label={t.reason} optional hint={t.reasonHint}>
              {(p) => <Textarea {...p} rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} className={textareaClass} />}
            </FormField>
            {error && <ErrorBox message={error} />}
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel disabled={busy}>{t.keep}</AlertDialogCancel>
              <button
                type="button"
                onClick={cancel}
                disabled={busy || previewLoading || (booking.status !== 'payment_pending' && !preview)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-red-700 px-4 text-sm font-bold text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-70"
              >
                {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {feeCents > 0 ? t.confirmWithFee(f.euro(feeCents)) : t.confirm}
              </button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
