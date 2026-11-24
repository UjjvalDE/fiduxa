// Status helpers for the customer account (instant booking + payment flow).
import type { Booking, BookingStatus } from '@/lib/types';

export const DEFAULT_CANCELLATION_HOURS = 24;

const CURRENT_STATUSES = ['payment_pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'expired'] as const;
type CurrentStatus = (typeof CURRENT_STATUSES)[number];

/** Key into the `nextAction` messages; legacy quotation statuses share one text */
export const nextActionKey = (status: BookingStatus): CurrentStatus | 'legacy' =>
  (CURRENT_STATUSES as readonly string[]).includes(status) ? (status as CurrentStatus) : 'legacy';

/** Hold ran out: status `expired`, or `payment_pending` past `holdExpiresAt` (server job not run yet) */
export const isHoldExpired = (booking: Pick<Booking, 'status' | 'holdExpiresAt'>, now = Date.now()) =>
  booking.status === 'expired' ||
  (booking.status === 'payment_pending' && !!booking.holdExpiresAt && new Date(booking.holdExpiresAt).getTime() <= now);

/** Reserved slot that still has to be paid online */
export const needsPayment = (booking: Pick<Booking, 'status' | 'holdExpiresAt' | 'payment'>, now = Date.now()) =>
  booking.status === 'payment_pending' &&
  !isHoldExpired(booking, now) &&
  booking.payment?.status !== 'paid' &&
  booking.payment?.status !== 'pending';

/** Amount of the booking (fixed price) */
export const bookingAmount = (booking: Pick<Booking, 'payment' | 'estimate'>) =>
  booking.payment?.amountCents ?? booking.estimate?.totalCents ?? null;

const LEGACY_SLOT_START: Record<string, string> = { morning: '08:00', afternoon: '13:00' };

/** Start of the appointment as a real instant (slot times are Berlin local time) */
export function slotStartInstant(preferredDate: string, slot: string): Date | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(preferredDate ?? '');
  const time = /^(\d{2}):(\d{2})$/.exec(LEGACY_SLOT_START[slot] ?? slot ?? '');
  if (!day || !time) return null;
  const [y, m, d] = [Number(day[1]), Number(day[2]), Number(day[3])];
  // Berlin offset on that day (+1 / +2 h), measured at noon UTC
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12));
  const berlinHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(noonUtc));
  const offsetHours = berlinHour - 12;
  return new Date(Date.UTC(y, m - 1, d, Number(time[1]), Number(time[2])) - offsetHours * 3600 * 1000);
}

/** Statuses the customer may cancel online (server rules) */
export const isCancellableStatus = (status: BookingStatus) => status === 'payment_pending' || status === 'confirmed';

/** Confirmed bookings: only until `cutoffHours` before the start */
export function isBeforeCutoff(booking: Pick<Booking, 'status' | 'preferredDate' | 'slot'>, cutoffHours: number, now = Date.now()) {
  if (booking.status !== 'confirmed') return true;
  const start = slotStartInstant(booking.preferredDate, booking.slot);
  if (!start) return true; // let the server decide
  return now <= start.getTime() - cutoffHours * 3600 * 1000;
}

export const firstName = (name: string | undefined) => (name ? name.trim().split(/\s+/)[0] : '');

export const paymentHref = (id: string) => `/zahlung/${encodeURIComponent(id)}`;
