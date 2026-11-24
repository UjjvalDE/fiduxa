// Locale-aware formatting. Use via useFormat() (client) or getFormat() (server).
import { INTL_LOCALE, type Locale } from './config';

const LEGACY_SLOTS: Record<string, [string, string]> = {
  morning: ['08:00', '12:00'],
  afternoon: ['13:00', '17:00'],
};

export function createFormatter(locale: Locale) {
  const tag = INTL_LOCALE[locale];
  const currency = new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR' });
  const hourUnit = { de: 'Std.', en: 'h', pl: 'godz.' }[locale];

  /** Booking calendar dates are stored as UTC midnight → format in UTC */
  const date = (iso: string | Date | undefined | null, options?: Intl.DateTimeFormatOptions) =>
    iso
      ? new Date(iso).toLocaleDateString(tag, {
          timeZone: 'UTC',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          ...options,
        })
      : '–';

  return {
    locale,
    tag,
    /** 12000 → "120,00 €" / "€120.00" */
    euro: (cents: number | undefined | null) => (cents == null ? '–' : currency.format(cents / 100)),
    /** Calendar date of a booking (UTC midnight) */
    date,
    /** "Mittwoch, 19. November 2026" */
    dateLong: (iso: string | Date | undefined | null) =>
      date(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    /** "Mi., 19.11." style short date with weekday */
    dateShort: (iso: string | Date | undefined | null) =>
      date(iso, { weekday: 'short', day: '2-digit', month: '2-digit', year: undefined }),
    /** Real timestamps (createdAt, paidAt …) in Berlin time */
    dateTime: (iso: string | Date | undefined | null) =>
      iso
        ? new Date(iso).toLocaleString(tag, {
            timeZone: 'Europe/Berlin',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '–',
    /** 240 → "4 Std." / "4 h" / "4 godz." */
    hours: (minutes: number | undefined | null) =>
      minutes == null
        ? '–'
        : `${(minutes / 60).toLocaleString(tag, { maximumFractionDigits: 1 })} ${hourUnit}`,
    /** Slot label: "08:00–10:00", "08:00", legacy "morning" → "08:00–12:00" */
    slot: (start: string | undefined | null, end?: string | null) => {
      if (!start) return '–';
      const legacy = LEGACY_SLOTS[start];
      if (legacy) return `${legacy[0]}–${legacy[1]}`;
      return end ? `${start}–${end}` : start;
    },
    number: (value: number, options?: Intl.NumberFormatOptions) => value.toLocaleString(tag, options),
  };
}

export type Formatter = ReturnType<typeof createFormatter>;
