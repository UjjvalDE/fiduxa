// Booking wizard state, steps and session-storage draft.
import type { Condition, Frequency, ServiceId } from '@/lib/types';

const SERVICE_SLUG_TO_ID: Record<string, ServiceId> = {
  wohnungsreinigung: 'home-cleaning',
  grundreinigung: 'deep-cleaning',
  umzugsreinigung: 'end-of-tenancy',
  'buero-reinigung': 'business-cleaning',
};

export type HouseholdServiceId = Exclude<ServiceId, 'business-cleaning'>;
export const HOUSEHOLD_SERVICES: HouseholdServiceId[] = ['home-cleaning', 'deep-cleaning', 'end-of-tenancy'];

export const AREA_MIN = 15;
export const AREA_MAX = 1000;
export const AREA_DEFAULT = 60;
export const MAX_DAYS_AHEAD = 90;

/** Step keys – labels come from the message module (steps.<key>) */
export const STEPS = ['postcode', 'details', 'checkout'] as const;

export const STEP_POSTCODE = 0;
export const STEP_DETAILS = 1;
export const STEP_CHECKOUT = 2;

export const STEP_COUNT = STEPS.length;
/** Index of the virtual confirmation step (shown after submission) */
export const CONFIRMATION_STEP = STEP_COUNT;

export interface Draft {
  step: number;
  serviceId: HouseholdServiceId | null;
  postcode: string;
  /** Postcode that the API confirmed as serviceable */
  verifiedPostcode: string | null;
  areaM2: number | null;
  condition: Condition;
  extras: string[];
  frequency: Frequency;
  /** Chosen day (YYYY-MM-DD) */
  date: string;
  /** Availability window of the chosen start time – sent as `slotId` */
  windowId: string | null;
  /** Chosen start time ("08:00") – sent as `startTime` */
  startTime: string;
  /** start + duration ("11:00") – display only, refreshed with the duration */
  endTime: string;
  /** Hours chosen by the customer (minutes); null = follow the recommendation */
  durationMinutes: number | null;
  /** true once the customer changed the hours manually (stepper or chip) */
  durationTouched: boolean;
  /** Pets in the home (null = not answered yet) */
  pets: boolean | null;
}

export interface Contact {
  name: string;
  email: string;
  phone: string;
  address: string;
  accessNotes: string;
  notes: string;
}

export const EMPTY_DRAFT: Draft = {
  step: 0,
  serviceId: null,
  postcode: '',
  verifiedPostcode: null,
  areaM2: AREA_DEFAULT,
  condition: 'normal',
  extras: [],
  frequency: 'one-time',
  date: '',
  windowId: null,
  startTime: '',
  endTime: '',
  durationMinutes: null,
  durationTouched: false,
  pets: null,
};

export const EMPTY_CONTACT: Contact = { name: '', email: '', phone: '', address: '', accessNotes: '', notes: '' };

/** Which wizard step owns each API field (for mapping 422 errors back) */
export const FIELD_STEP: Record<string, number> = {
  serviceId: STEP_POSTCODE,
  postcode: STEP_POSTCODE,
  frequency: STEP_DETAILS,
  areaM2: STEP_DETAILS,
  condition: STEP_DETAILS,
  durationMinutes: STEP_DETAILS,
  extras: STEP_DETAILS,
  preferredDate: STEP_DETAILS,
  slotId: STEP_DETAILS,
  startTime: STEP_DETAILS,
  pets: STEP_DETAILS,
  name: STEP_CHECKOUT,
  email: STEP_CHECKOUT,
  phone: STEP_CHECKOUT,
  address: STEP_CHECKOUT,
  accessNotes: STEP_CHECKOUT,
  notes: STEP_CHECKOUT,
  account: STEP_CHECKOUT,
  terms: STEP_CHECKOUT,
  earlyStartConsent: STEP_CHECKOUT,
  paymentMethod: STEP_CHECKOUT,
  promoCode: STEP_CHECKOUT,
  giftCardCodes: STEP_CHECKOUT,
};

/** DOM id of the card that holds each field (scroll target), in page order */
export const FIELD_CARD: [string, string][] = [
  ['serviceId', 'card-service'],
  ['postcode', 'card-service'],
  ['areaM2', 'card-property'],
  ['condition', 'card-property'],
  ['durationMinutes', 'card-duration'],
  ['extras', 'card-extras'],
  ['frequency', 'card-frequency'],
  ['pets', 'card-pets'],
  ['preferredDate', 'card-date'],
  ['slotId', 'card-date'],
  ['startTime', 'card-date'],
  ['account', 'card-account'],
  ['name', 'card-contact'],
  ['email', 'card-contact'],
  ['phone', 'card-contact'],
  ['address', 'card-contact'],
  ['accessNotes', 'card-contact'],
  ['notes', 'card-notes'],
  ['promoCode', 'card-price'],
  ['giftCardCodes', 'card-price'],
  ['paymentMethod', 'card-payment'],
  ['terms', 'card-terms'],
  ['earlyStartConsent', 'card-terms'],
];

const TIME_PATTERN = /^\d{2}:\d{2}$/;
const STORAGE_KEY = 'fiduxa_booking_draft_v3';
/** Drafts from before duration-based start times – service/property are kept, the time is dropped */
const LEGACY_STORAGE_KEY = 'fiduxa_booking_draft_v2';
const OBJECT_ID = /^[a-f\d]{24}$/i;
const CONDITIONS: Condition[] = ['basic', 'normal', 'moderate', 'heavy'];
const FREQUENCIES: Frequency[] = ['one-time', 'weekly', 'biweekly', 'monthly'];

export const isHouseholdService = (value: unknown): value is HouseholdServiceId =>
  typeof value === 'string' && (HOUSEHOLD_SERVICES as string[]).includes(value);

/** Accepts a service id ("home-cleaning") or slug ("wohnungsreinigung") */
export const parseServiceParam = (value: string | null): ServiceId | null => {
  if (!value) return null;
  if (isHouseholdService(value) || value === 'business-cleaning') return value as ServiceId;
  return SERVICE_SLUG_TO_ID[value] ?? null;
};

function readStored(): { data: Partial<Draft>; legacy: boolean } | null {
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (raw) return { data: JSON.parse(raw) as Partial<Draft>, legacy: false };
  const old = window.sessionStorage.getItem(LEGACY_STORAGE_KEY);
  if (!old) return null;
  window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  return { data: JSON.parse(old) as Partial<Draft>, legacy: true };
}

export function loadDraft(): Draft | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = readStored();
    if (!stored) return null;
    const { data, legacy } = stored;
    // A start time is only valid together with its window id and the date
    const hasTime =
      !legacy &&
      typeof data.windowId === 'string' &&
      OBJECT_ID.test(data.windowId) &&
      typeof data.startTime === 'string' &&
      TIME_PATTERN.test(data.startTime);
    // Validate every field – storage content is untrusted
    return {
      step:
        typeof data.step === 'number' && data.step >= 0 && data.step < STEP_COUNT
          ? Math.min(Math.floor(data.step), legacy ? STEP_DETAILS : STEP_COUNT - 1)
          : 0,
      serviceId: isHouseholdService(data.serviceId) ? data.serviceId : null,
      postcode: typeof data.postcode === 'string' ? data.postcode.slice(0, 5) : '',
      verifiedPostcode: typeof data.verifiedPostcode === 'string' ? data.verifiedPostcode : null,
      areaM2: typeof data.areaM2 === 'number' && Number.isFinite(data.areaM2) ? data.areaM2 : AREA_DEFAULT,
      condition: CONDITIONS.includes(data.condition as Condition) ? (data.condition as Condition) : 'normal',
      extras: Array.isArray(data.extras) ? data.extras.filter((x): x is string => typeof x === 'string').slice(0, 20) : [],
      frequency: FREQUENCIES.includes(data.frequency as Frequency) ? (data.frequency as Frequency) : 'one-time',
      // Old drafts had 2-hour slots: keep everything else, the customer picks a new day/time
      date: !legacy && typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : '',
      windowId: hasTime ? (data.windowId as string) : null,
      startTime: hasTime ? (data.startTime as string) : '',
      endTime: hasTime && typeof data.endTime === 'string' && TIME_PATTERN.test(data.endTime) ? data.endTime : '',
      durationMinutes:
        typeof data.durationMinutes === 'number' && Number.isInteger(data.durationMinutes) && data.durationMinutes > 0
          ? data.durationMinutes
          : null,
      durationTouched: data.durationTouched === true && typeof data.durationMinutes === 'number',
      pets: typeof data.pets === 'boolean' ? data.pets : null,
    };
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* storage unavailable – the wizard still works without persistence */
  }
}

export function clearDraft() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

const addDays = (date: Date, days: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

/** Bookable date range as YYYY-MM-DD strings (tomorrow … +90 days) */
export function bookableRange(now = new Date()) {
  return { min: toDateValue(addDays(now, 1)), max: toDateValue(addDays(now, MAX_DAYS_AHEAD)) };
}

/** Local Date → "YYYY-MM-DD" */
export const toDateValue = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "YYYY-MM-DD" → local Date (midnight) */
export const fromDateValue = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** "2026-11-20" → ISO string at UTC midnight, for f.date / f.dateLong */
export const dateValueToIso = (value: string) => `${value}T00:00:00.000Z`;

export const isAreaValid = (area: number | null): area is number =>
  area != null && Number.isFinite(area) && area >= AREA_MIN && area <= AREA_MAX;
