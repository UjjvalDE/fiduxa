// Formatting helpers and German labels shared across the app.
import type {
  BookingPaymentStatus,
  BookingStatus,
  BusinessRequestStatus,
  Condition,
  Frequency,
  ServiceId,
  SlotId,
  WorkerStatus,
} from './types';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

/** 12000 → "120,00 €" */
export const formatEuro = (cents: number | undefined | null) => (cents == null ? '–' : euro.format(cents / 100));

/** Booking calendar dates are stored as UTC midnight – format in UTC to avoid off-by-one days */
export const formatDate = (iso: string | Date | undefined | null, options?: Intl.DateTimeFormatOptions) =>
  iso
    ? new Date(iso).toLocaleDateString('de-DE', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        ...options,
      })
    : '–';

/** Long form: "Mittwoch, 19. November 2026" */
export const formatDateLong = (iso: string | Date | undefined | null) =>
  formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Real timestamps (createdAt etc.) shown in Berlin time */
export const formatDateTime = (iso: string | Date | undefined | null) =>
  iso
    ? new Date(iso).toLocaleString('de-DE', {
        timeZone: 'Europe/Berlin',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '–';

/** 240 → "4 Std.", 150 → "2,5 Std." */
export const formatHours = (minutes: number | undefined | null) =>
  minutes == null ? '–' : `${(minutes / 60).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Std.`;

/** "YYYY-MM-DD" for a Date in local time (for <input type="date"> and the API) */
export const toDateInputValue = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const SERVICE_LABELS: Record<ServiceId, string> = {
  'home-cleaning': 'Wohnungsreinigung',
  'deep-cleaning': 'Grundreinigung',
  'end-of-tenancy': 'Umzugsreinigung',
  'business-cleaning': 'Büro- & Gewerbereinigung',
};

export const SERVICE_SLUG_TO_ID: Record<string, ServiceId> = {
  wohnungsreinigung: 'home-cleaning',
  grundreinigung: 'deep-cleaning',
  umzugsreinigung: 'end-of-tenancy',
  'buero-reinigung': 'business-cleaning',
};

export const CONDITION_LABELS: Record<Condition, { label: string; hint: string }> = {
  basic: { label: 'Gepflegt', hint: 'Regelmäßig gereinigt, kaum Verschmutzung' },
  normal: { label: 'Normal', hint: 'Übliche Alltagsverschmutzung' },
  moderate: { label: 'Stärker', hint: 'Länger nicht gereinigt' },
  heavy: { label: 'Sehr stark', hint: 'Starke Verschmutzung, viel zu tun' },
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  'one-time': 'Einmalig',
  weekly: 'Wöchentlich',
  biweekly: 'Alle 2 Wochen',
  monthly: 'Alle 4 Wochen',
};

/** @deprecated legacy slots only – use useFormat().slot(start, end) */
export const SLOT_LABELS: Record<SlotId, string> = {
  morning: 'Vormittags · 08:00–12:00',
  afternoon: 'Nachmittags · 13:00–17:00',
};

type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

/** @deprecated use common messages (lib/i18n/messages/common.ts) */
export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: Tone }> = {
  payment_pending: { label: 'Zahlung ausstehend', tone: 'warning' },
  expired: { label: 'Abgelaufen', tone: 'neutral' },
  pending_quotation: { label: 'In Prüfung', tone: 'warning' },
  quotation_sent: { label: 'Angebot erhalten', tone: 'info' },
  accepted: { label: 'Angebot angenommen', tone: 'info' },
  rejected: { label: 'Angebot abgelehnt', tone: 'neutral' },
  confirmed: { label: 'Bestätigt', tone: 'success' },
  in_progress: { label: 'In Arbeit', tone: 'info' },
  completed: { label: 'Abgeschlossen', tone: 'success' },
  cancelled: { label: 'Storniert', tone: 'danger' },
};

export const WORKER_STATUS: Record<WorkerStatus, { label: string; tone: Tone }> = {
  not_applicable: { label: '–', tone: 'neutral' },
  invited: { label: 'Eingeladen', tone: 'neutral' },
  pending_review: { label: 'Prüfung ausstehend', tone: 'warning' },
  approved: { label: 'Freigegeben', tone: 'success' },
  rejected: { label: 'Abgelehnt', tone: 'danger' },
  suspended: { label: 'Gesperrt', tone: 'danger' },
};

export const BUSINESS_STATUS: Record<BusinessRequestStatus, { label: string; tone: Tone }> = {
  new_request: { label: 'Neu', tone: 'warning' },
  under_review: { label: 'In Prüfung', tone: 'info' },
  site_visit_required: { label: 'Besichtigung nötig', tone: 'info' },
  quote_draft: { label: 'Angebot in Arbeit', tone: 'info' },
  sent_to_customer: { label: 'Angebot gesendet', tone: 'info' },
  accepted: { label: 'Angenommen', tone: 'success' },
  declined: { label: 'Abgelehnt', tone: 'neutral' },
  expired: { label: 'Abgelaufen', tone: 'neutral' },
  contracted: { label: 'Vertrag', tone: 'success' },
  scheduled: { label: 'Eingeplant', tone: 'success' },
};

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-gray-100 text-gray-700 border-gray-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  success: 'bg-mint text-pine border-sage',
  danger: 'bg-red-50 text-red-700 border-red-200',
};

export const PAYMENT_STATUS: Record<BookingPaymentStatus, { label: string; tone: Tone }> = {
  unpaid: { label: 'Offen', tone: 'warning' },
  pending: { label: 'In Bearbeitung', tone: 'info' },
  paid: { label: 'Bezahlt', tone: 'success' },
  failed: { label: 'Fehlgeschlagen', tone: 'danger' },
  refund_pending: { label: 'Erstattung ausstehend', tone: 'warning' },
  refunded: { label: 'Erstattet', tone: 'neutral' },
};
