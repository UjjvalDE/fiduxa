import type { BookingStatus, BusinessRequest, StatusHistoryEntry } from '@/lib/types';

// NOTE: the German label maps below (PREMISES_LABELS …) are legacy – pages use
// translated message modules instead. Kept so older imports keep compiling.

/** Mirrors ALLOWED_TRANSITIONS in server/src/controllers/admin.controller.js */
export const ALLOWED_TRANSITIONS: Partial<Record<BookingStatus, BookingStatus[]>> = {
  payment_pending: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  // legacy quotation-flow records
  pending_quotation: ['cancelled'],
  quotation_sent: ['cancelled'],
  accepted: ['confirmed', 'cancelled'],
};

/** Statuses in which a cleaner can be assigned */
export const ASSIGNABLE_STATUSES: BookingStatus[] = ['confirmed', 'in_progress', 'accepted'];

export const historyActor = (entry: StatusHistoryEntry, systemLabel: string) =>
  entry.changedBy && typeof entry.changedBy === 'object' ? entry.changedBy.name : systemLabel;

export const PREMISES_LABELS: Record<BusinessRequest['premises']['type'], string> = {
  office: 'Büro',
  shop: 'Ladengeschäft',
  practice: 'Praxis',
  stairwell: 'Treppenhaus',
  other: 'Sonstiges',
};

export const B2B_SERVICE_LABELS: Record<BusinessRequest['service']['types'][number], string> = {
  maintenance: 'Unterhaltsreinigung',
  'deep-clean': 'Grundreinigung',
  windows: 'Fensterreinigung',
  carpet: 'Teppichreinigung',
  disinfection: 'Desinfektion',
  custom: 'Individuell',
};

export const B2B_FREQUENCY_LABELS: Record<BusinessRequest['service']['frequency'], string> = {
  'one-time': 'Einmalig',
  daily: 'Täglich',
  'several-weekly': 'Mehrmals pro Woche',
  weekly: 'Wöchentlich',
  biweekly: 'Alle 2 Wochen',
  monthly: 'Monatlich',
  custom: 'Individuell',
};

export const MATERIALS_LABELS: Record<NonNullable<NonNullable<BusinessRequest['operations']>['materialsProvidedBy']>, string> = {
  fiduxa: 'Fiduxa stellt Material',
  customer: 'Kunde stellt Material',
  'to-discuss': 'Nach Absprache',
};

export const CONTACT_STATUS: Record<'new' | 'in_progress' | 'closed', { label: string; className: string }> = {
  new: { label: 'Neu', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  in_progress: { label: 'In Bearbeitung', className: 'bg-sky-50 text-sky-800 border-sky-200' },
  closed: { label: 'Erledigt', className: 'bg-mint text-pine border-sage' },
};

export const AUDIT_ACTIONS: Record<string, string> = {
  'booking.quotation.sent': 'Angebot gesendet',
  'booking.quotation.revised': 'Angebot überarbeitet',
  'booking.status.changed': 'Buchungsstatus geändert',
  'booking.worker.assigned': 'Reinigungskraft zugewiesen',
  'booking.worker.unassigned': 'Zuweisung aufgehoben',
  'customer.activated': 'Kundenkonto aktiviert',
  'customer.deactivated': 'Kundenkonto deaktiviert',
  'worker.invited': 'Reinigungskraft eingeladen',
  'worker.approved': 'Reinigungskraft freigegeben',
  'worker.rejected': 'Reinigungskraft abgelehnt',
  'worker.suspended': 'Reinigungskraft gesperrt',
  'worker.reactivated': 'Reinigungskraft reaktiviert',
  'business-request.status.changed': 'Gewerbeanfrage: Status geändert',
};

/**
 * Parse a German (or plain) euro amount into integer cents without floating point.
 * Accepts "120", "120,5", "120,50", "1.234,56", "1234.56", "1 234,56 €".
 * Returns null for anything invalid.
 */
export function parseEuroToCents(input: string): number | null {
  let value = input.replace(/€|eur/gi, '').replace(/[\s ]/g, '');
  if (!value) return null;
  if (value.includes(',') && value.includes('.')) {
    // "1.234,56" → thousands dots, decimal comma
    if (value.lastIndexOf(',') < value.lastIndexOf('.')) return null;
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (value.includes(',')) {
    value = value.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(value)) {
    // "1.234" → thousands separator
    value = value.replace(/\./g, '');
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const euros = Number(match[1]);
  const cents = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
  const total = euros * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

/** 12050 → "120,50" (for prefilling inputs) */
export const centsToInput = (cents: number) =>
  `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
