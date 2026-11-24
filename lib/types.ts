// Shared API types – mirror server/src models & responses (see server/API.md).

export type Role = 'consumer' | 'worker' | 'admin';

export type WorkerStatus =
  | 'not_applicable'
  | 'invited'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type Locale = 'de' | 'en' | 'pl';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  /** Customers confirm their email (unlocks the welcome discount) */
  emailVerified?: boolean;
  preferredLanguage?: Locale;
  workerStatus?: WorkerStatus;
  createdAt?: string;
}

export type ServiceId = 'home-cleaning' | 'deep-cleaning' | 'end-of-tenancy' | 'business-cleaning';
export type Condition = 'basic' | 'normal' | 'moderate' | 'heavy';
export type Frequency = 'one-time' | 'weekly' | 'biweekly' | 'monthly';
/** Slot start time "HH:MM" (legacy bookings: "morning" | "afternoon") */
export type SlotId = string;

export interface Service {
  id: ServiceId;
  slug: string;
  name: string;
  nameEn: string;
  bookingMode: 'request' | 'business-request';
  frequencies: Frequency[];
  included: string[];
  excluded: string[];
}

export interface Extra {
  id: string;
  label: string;
  labelEn: string;
  description: string;
  minutes: number;
  priceCents: number;
  icon: string; // Lucide icon name (kebab-case)
}

export interface PublicPricing {
  currency: 'EUR';
  hourlyRateCents: number;
  minimumMinutes: number;
  maximumMinutes: number;
  durationStepMinutes: number;
  minimumChargeCents: number;
  areaM2PerHour: number;
  conditionFactor: Record<Condition, number>;
  frequencyDiscount: Record<Frequency, number>;
  pricesIncludeVat: boolean;
  /** Minutes a slot stays reserved while the customer pays */
  holdMinutes: number;
  cancellationCutoffHours: number;
  maxBookingDaysAhead: number;
  /** Start times are offered every N minutes inside the availability windows */
  startStepMinutes?: number;
  /** Customers may pay the cleaner in cash after the job */
  cashEnabled?: boolean;
}

export interface Estimate {
  /** Booked duration (customer choice, or the recommendation by default) */
  durationMinutes: number;
  /** Server recommendation from area, condition and extras */
  recommendedMinutes: number;
  minimumMinutes: number;
  maximumMinutes: number;
  durationStepMinutes: number;
  belowRecommendation: boolean;
  hourlyRateCents: number;
  labourCents: number;
  extraFeesCents: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: 'EUR';
  pricesIncludeVat: boolean;
  conditionFactor: number;
  extras: { id: string; label: string; minutes: number; priceCents: number }[];
  calculatedAt: string;
  disclaimer: string;
}

/** Public availability slot (GET /bookings/availability?date=) */
/** A start time that fits the job's total duration (GET /bookings/availability?date=&duration=) */
export interface Slot {
  /** Availability window id – send as `slotId` together with `startTime` */
  id: string;
  windowId?: string;
  startTime: string; // "08:00"
  endTime: string; // start + duration, e.g. "11:30"
  available: boolean;
  remaining: number;
}

/** GET /bookings/availability/days */
export interface AvailableDay {
  date: string; // YYYY-MM-DD
  freeSlots: number;
}

/** Admin view of a slot (GET /admin/slots) */
export interface AdminSlot {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  capacity: number;
  booked: number;
  /** Team-minutes still free (windows) or free places (legacy fixed slots) */
  remaining: number;
  /** Window length in minutes (null = legacy fixed start) */
  windowMinutes?: number | null;
  capacityMinutes?: number | null;
  bookedMinutes?: number;
  utilisationPct?: number | null;
  active: boolean;
  note: string;
  bookings: {
    id: string;
    reference: string;
    status: BookingStatus;
    customerName: string;
    workerName: string | null;
    startTime?: string;
    endTime?: string;
    durationMinutes?: number | null;
  }[];
}

/** Admin → Einstellungen (GET/PUT /admin/settings) */
export interface PlatformSettings {
  pricing: {
    hourlyRateCents: number;
    minimumMinutes: number;
    maximumMinutes: number;
    roundingMinutes: 15 | 30 | 60;
    areaM2PerHour: number;
    /** 0.19 = 19 % (0 for Kleinunternehmer) */
    vatRate?: number;
    frequencyDiscount: { weekly: number; biweekly: number; monthly: number };
  };
  extras: {
    id: string;
    label: string;
    labelEn: string;
    minutes: number;
    priceCents: number;
    active: boolean;
    defaultMinutes?: number;
  }[];
  booking: {
    startStepMinutes: 15 | 30 | 60;
    maxBookingDaysAhead: number;
    cancellationCutoffHours: number;
    teamBufferMinutes: number;
  };
  payments: {
    cashEnabled: boolean;
    paypalEnabled: boolean;
    stripeEnabled: boolean;
    paypalConfigured: boolean;
    stripeConfigured: boolean;
  };
  workerPay: { hourlyRateCents: number; payoutDelayDays: number };
  giftCards?: {
    enabled: boolean;
    presetAmountsCents: number[];
    minCustomCents: number;
    maxCustomCents: number;
    validityYears: number;
    maxPerBooking: number;
  };
}

/** GET /admin/admins */
export interface AdminAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  preferredLanguage: Locale;
  invitationPending: boolean;
  isMe: boolean;
  createdAt: string;
}

/** Cash to collect for a cash booking (worker job views) */
export interface JobCash {
  amountCents: number;
  collectedCents: number | null;
  collected: boolean;
}

export type BookingStatus =
  | 'payment_pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired'
  // legacy (earlier quotation flow)
  | 'pending_quotation'
  | 'quotation_sent'
  | 'accepted'
  | 'rejected';

export interface Quotation {
  amountCents: number;
  currency: 'EUR';
  message?: string;
  validUntil: string;
  sentAt: string;
  sentBy?: string | { _id: string; name: string };
  emailStatus?: 'not_sent' | 'sent' | 'failed';
  respondedAt?: string;
}

export type BookingPaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'refund_pending' | 'refunded';

export interface BookingPayment {
  status: BookingPaymentStatus;
  amountCents?: number;
  currency?: 'EUR';
  paidAt?: string;
  refundedAt?: string;
  checkoutSessionId?: string | null;
  method?: 'stripe' | 'paypal' | 'cash' | 'invoice' | 'gift_card';
  cashCollectedCents?: number;
  cashCollectedAt?: string;
}

export interface PaymentSummary {
  bookingId: string;
  reference: string;
  bookingStatus: BookingStatus;
  amountCents: number | null;
  currency: 'EUR';
  payment: BookingPayment;
  holdExpiresAt: string | null;
  onlinePaymentAvailable: boolean;
  /** Online methods the customer can choose */
  methods?: PaymentMethod[];
}

export interface AdminPayment {
  _id: string;
  booking: { _id: string; reference: string; status: BookingStatus; preferredDate: string } | null;
  customer: { _id: string; name: string; email: string } | null;
  provider: 'stripe' | 'paypal' | 'cash';
  checkoutSessionId: string;
  paymentIntentId: string | null;
  amountCents: number;
  currency: 'EUR';
  status: 'created' | 'processing' | 'paid' | 'failed' | 'expired' | 'refunded';
  paidAt?: string;
  refundedAt?: string;
  failureReason?: string;
  createdAt: string;
}

export interface PersonRef {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface StatusHistoryEntry {
  status: string;
  changedAt: string;
  changedBy?: string | { _id: string; name: string; role: Role };
  note?: string;
}

export interface Booking {
  _id: string;
  reference: string;
  customer: string | PersonRef;
  serviceId: ServiceId;
  areaM2: number;
  condition: Condition;
  frequency: Frequency;
  extras: string[];
  customerDetails: {
    name: string;
    email?: string;
    phone: string;
    postcode: string;
    address: string;
    accessNotes?: string;
  };
  preferredDate: string; // ISO, UTC midnight of the calendar day
  slot: SlotId;
  slotEnd?: string;
  availabilitySlot?: string | null;
  /** Reservation expiry while payment is pending */
  holdExpiresAt?: string | null;
  locale?: Locale;
  notes?: string;
  /** Pets in the home */
  pets?: boolean;
  estimate: Estimate;
  status: BookingStatus;
  statusHistory?: StatusHistoryEntry[];
  emailStatus?: 'not_sent' | 'sent' | 'failed';
  quotation?: Quotation;
  quotationHistory?: (Quotation & { version: number })[];
  assignedWorker?: PersonRef | null;
  assignedAt?: string;
  job?: {
    onTheWayAt?: string;
    startedAt?: string;
    completedAt?: string;
    workerNote?: string;
    issueReported?: string;
    /** Checklist task keys ticked by the cleaner on completion */
    checklistDone?: string[];
  };
  /** Open-job marketplace info (admin view; hidden from customers) */
  jobOffer?: {
    notifiedAt?: string;
    declinedBy?: (string | { _id: string; name: string })[];
    releasedBy?: (string | { _id: string; name: string })[];
    unassignedAlertSentAt?: string;
  };
  cancellation?: { cancelledAt?: string; reason?: string };
  payment?: BookingPayment;
  consents?: { earlyStartRequestedAt?: string };
  adminNotes?: string;
  /** Final price snapshot (promotion, VAT, gift cards, payable) – newer bookings only */
  pricing?: BookingPricing;
  /** Cleaner pay for this job (admin/worker views) */
  workerPayout?: {
    amountCents: number;
    rateCents: number;
    minutes: number;
    earnedAt: string;
    dueAt: string;
    status: 'pending' | 'on_hold' | 'paid';
    paidAt?: string;
    /** Cash the cleaner kept from the customer (deducted from the pay) */
    cashHeldCents?: number;
  };
  createdAt: string;
  updatedAt: string;
}

/** An open job offered to cleaners (GET /worker/jobs/open) – no customer identity before accepting */
export interface OpenJob {
  _id: string;
  reference: string;
  serviceId: ServiceId;
  areaM2: number;
  condition: Condition;
  frequency: Frequency;
  extras: string[];
  estimate: { durationMinutes: number; extras: Estimate['extras'] };
  postcode: string;
  preferredDate: string;
  slot: string;
  slotEnd?: string;
  pets?: boolean;
  /** Customer pays the cleaner in cash */
  cash?: boolean;
}

/** Booking as seen by a worker (no prices, no customer email) */
export type WorkerJob = Pick<
  Booking,
  '_id' | 'reference' | 'serviceId' | 'areaM2' | 'condition' | 'extras' | 'notes' | 'preferredDate' | 'slot' | 'status' | 'job' | 'pets' | 'workerPayout'
> & {
  estimate: { durationMinutes: number; extras: Estimate['extras'] };
  customerDetails: { name: string; phone: string; address: string; postcode: string; accessNotes?: string };
  /** Only for cash bookings */
  cash?: JobCash | null;
};

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface BankSummary {
  accountHolder: string;
  iban: string;
  status?: 'saved' | 'missing';
}

export interface WorkerProfile {
  address: string;
  serviceAreas: string[];
  experienceYears: number;
  bio?: string;
  languages?: string[];
  specialties?: string[];
  petsOk?: boolean;
  bringsSupplies?: boolean;
  publicVisible?: boolean;
}

export interface AdminWorker {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive?: boolean;
  emailVerified: boolean;
  workerStatus: WorkerStatus;
  workerProfile: WorkerProfile;
  bankDetails: BankSummary;
  workerReview?: { reviewedAt: string | null; reviewedBy: string | null; note: string };
  createdAt?: string;
  submittedAt?: string;
}

export interface WeeklyWindow {
  /** 1 = Monday … 7 = Sunday */
  weekday: number;
  start: string;
  end: string;
}

export interface Holiday {
  id: string;
  from: string; // YYYY-MM-DD
  to: string;
  note: string;
}

export interface WorkerStats {
  ratingAvg: number | null;
  ratingCount: number;
  ratingDetails: { punctuality: number | null; quality: number | null; friendliness: number | null } | null;
  jobsCompleted: number;
  jobsHandedBack: number;
  reliabilityPct: number | null;
  punctualityPct: number | null;
  repeatCustomers: number;
}

export interface EarningsSummary {
  thisMonthCents: number;
  /** Cash kept from customers (already deducted from pending/due/paid, which are net) */
  cashHeldCents?: number;
  pendingCents: number;
  dueCents: number;
  onHoldCents: number;
  paidCents: number;
  totalCents: number;
  nextDueAt: string | null;
  payoutDelayDays: number;
  rateCents?: number;
  defaultRateCents?: number;
}

export interface WorkerOverview {
  worker: {
    id: string;
    name: string;
    email: string;
    phone: string;
    workerStatus: WorkerStatus;
    workerProfile: WorkerProfile;
    avatarUrl: string | null;
    availability: WeeklyWindow[];
    holidays: Holiday[];
    payRateCents: number;
    bankDetails: BankSummary;
    reviewNote: string;
    memberSince: string;
  };
  checklist: { emailVerified: boolean; profileComplete: boolean; bankDetailsComplete: boolean };
  canAccessJobs: boolean;
  stats: WorkerStats | null;
  earnings: EarningsSummary | null;
  upcomingCount: number;
  options: { specialties: string[]; languages: string[] };
}

/** pending = waiting period · due = ready for transfer · on_hold · paid */
export type PayoutStatus = 'pending' | 'due' | 'on_hold' | 'paid';

export interface EarningJob {
  cashHeldCents?: number;
  /** amountCents − cashHeldCents (can be negative) */
  netCents?: number;
  _id: string;
  reference: string;
  serviceId: ServiceId;
  date: string;
  slot: string;
  slotEnd?: string;
  amountCents: number;
  minutes: number;
  rateCents: number;
  earnedAt: string;
  dueAt: string;
  paidAt: string | null;
  status: PayoutStatus;
}

export interface WorkerPayoutRecord {
  _id: string;
  reference: string;
  amountCents: number;
  jobCount: number;
  paidAt: string;
  bankAccountLast4: string;
  note: string;
}

export interface WorkerEarningsResponse {
  summary: EarningsSummary & { rateCents: number; defaultRateCents: number };
  bank: { accountHolder: string; iban: string | null };
  jobs: EarningJob[];
  payouts: WorkerPayoutRecord[];
}

export interface CalendarJob {
  _id: string;
  reference: string;
  serviceId: ServiceId;
  date: string;
  slot: string;
  slotEnd: string;
  status: BookingStatus;
  durationMinutes: number | null;
  postcode: string;
  /** Customer pays in cash */
  cash?: boolean;
}

export interface WorkerCalendarResponse {
  from: string;
  to: string;
  jobs: CalendarJob[];
  holidays: Holiday[];
  availability: WeeklyWindow[];
}

/** Short public card of a cleaner (customer booking page, cleaner list) */
export interface CleanerCard {
  id: string;
  firstName: string;
  avatarUrl: string | null;
  experienceYears: number;
  specialties: string[];
  languages: string[];
  petsOk: boolean;
  ratingAvg?: number | null;
  ratingCount?: number;
  jobsCompleted?: number;
  reliabilityPct?: number | null;
  serviceAreas?: string[];
}

export interface PublicReview {
  _id: string;
  rating: number;
  comment: string;
  author: string;
  createdAt: string;
}

export interface CleanerProfile extends CleanerCard {
  bio: string;
  serviceAreas: string[];
  bringsSupplies: boolean;
  memberSince: string;
  stats: WorkerStats;
  reviews: PublicReview[];
}

export interface BookingMessage {
  _id: string;
  body: string;
  authorRole: Role;
  authorName: string;
  mine: boolean;
  createdAt: string;
}

export interface MessagesResponse {
  messages: BookingMessage[];
  canWrite: boolean;
  hasCleaner: boolean;
}

export interface CustomerReview {
  rating: number;
  punctuality?: number;
  quality?: number;
  friendliness?: number;
  comment: string;
  createdAt: string;
}

/** Online methods redirect to the provider; cash = pay the cleaner after the job */
export type PaymentMethod = 'stripe' | 'paypal' | 'cash';

export interface AdminReview {
  _id: string;
  rating: number;
  punctuality?: number;
  quality?: number;
  friendliness?: number;
  comment: string;
  hidden: boolean;
  createdAt: string;
  customer: { _id: string; name: string; email: string } | null;
  worker: { _id: string; name: string } | null;
  booking: { _id: string; reference: string; preferredDate: string } | null;
}

export interface OpenPayoutGroup {
  worker: { _id: string; name: string; email: string; bankAccountLast4: string; bankAccountHolder: string };
  dueCents: number;
  pendingCents: number;
  onHoldCents: number;
  jobs: {
    _id: string;
    reference: string;
    date: string;
    amountCents: number;
    minutes: number;
    earnedAt: string;
    dueAt: string;
    status: PayoutStatus;
    /** Cash the cleaner kept from the customer (deducted from the pay) */
    cashHeldCents?: number;
    /** amountCents − cashHeldCents (can be negative) */
    netCents?: number;
  }[];
}

export interface OpenPayoutsResponse {
  payoutDelayDays: number;
  defaultRateCents: number;
  totals: { dueCents: number; pendingCents: number; onHoldCents: number };
  groups: OpenPayoutGroup[];
}

export interface AdminPayoutRecord {
  _id: string;
  reference: string;
  amountCents: number;
  jobCount: number;
  paidAt: string;
  bankAccountLast4: string;
  note: string;
  worker: { _id: string; name: string; email: string } | null;
  createdBy: { _id: string; name: string } | null;
}

export interface AdminCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  bookingCount: number;
  completedCount: number;
  lastBookingAt: string | null;
}

export type BusinessRequestStatus =
  | 'new_request'
  | 'under_review'
  | 'site_visit_required'
  | 'quote_draft'
  | 'sent_to_customer'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'contracted'
  | 'scheduled';

export interface BusinessRequest {
  _id: string;
  reference: string;
  company: { name: string; legalForm?: string; vatId?: string; contactPerson: string; email: string; phone: string };
  site: { address: string; postcode: string; accessInstructions?: string; parkingNotes?: string };
  premises: {
    type: 'office' | 'shop' | 'practice' | 'stairwell' | 'other';
    areaM2: number;
    floors: number;
    rooms: number;
    sanitaryFacilities: number;
    hasKitchenette: boolean;
  };
  service: {
    types: ('maintenance' | 'deep-clean' | 'windows' | 'carpet' | 'disinfection' | 'custom')[];
    frequency: 'one-time' | 'daily' | 'several-weekly' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
    preferredTime?: string;
    description?: string;
  };
  operations?: {
    startDate?: string;
    contractDuration?: string;
    materialsProvidedBy?: 'fiduxa' | 'customer' | 'to-discuss';
    securityRequirements?: string;
  };
  consent: { privacyAcceptedAt: string; marketing: boolean };
  status: BusinessRequestStatus;
  adminNotes?: string;
  createdAt: string;
}

export interface ContactMessage {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  status: 'new' | 'in_progress' | 'closed';
  createdAt: string;
}

export interface AuditLog {
  _id: string;
  actor: { _id: string; name: string; email: string } | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface DashboardStats {
  totalBookings: number;
  paymentPending: number;
  confirmedBookings: number;
  inProgressBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  expiredBookings: number;
  todaysJobs: number;
  unassignedUpcoming: number;
  totalCustomers: number;
  refundsPending: number;
  /** Values in MINUTES of team time (window length × teams) */
  nextSevenDays: { slots: number; capacity: number; booked: number; free: number; bookings?: number; unit?: 'minutes' };
  workers: { approved: number; pendingReview: number; invited: number; suspended: number };
  newBusinessRequests: number;
  newContactMessages: number;
  paidRevenueCents: number;
  currency: 'EUR';
}

// ---------------------------------------------------------------------------
// Pricing quote, promotions, gift cards
// ---------------------------------------------------------------------------

export type PromotionKind = 'welcome' | 'campaign' | 'coupon';
export type DiscountType = 'percent' | 'fixed';
export type LocalizedText = Partial<Record<Locale, string>>;

/** Why a promotion / welcome offer does not apply */
export type PromotionReason =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'service'
  | 'min_order'
  | 'limit_reached'
  | 'login_required'
  | 'verify_email'
  | 'first_booking_only'
  | 'already_used';

export type GiftCardReason = 'invalid' | 'not_found' | 'not_active' | 'disabled' | 'expired' | 'empty' | 'too_many' | 'not_needed';

/** POST /bookings/quote → quote (all amounts in cents, computed on the server) */
export interface Quote {
  estimate: Estimate;
  currency: 'EUR';
  lines: {
    labourCents: number;
    extraFeesCents: number;
    subtotalCents: number;
    recurringDiscountCents: number;
    /** after recurring discount, before promotion */
    priceCents: number;
    promotionDiscountCents: number;
    /** final price incl. VAT */
    totalCents: number;
    vatRate: number;
    /** VAT contained in totalCents */
    vatCents: number;
    giftCardCents: number;
    /** what is left to pay (online / cash) */
    payableCents: number;
  };
  promotion: {
    id: string;
    kind: PromotionKind;
    name: string;
    code: string | null;
    discountType: DiscountType;
    discountValue: number;
    discountCents: number;
    title?: LocalizedText;
  } | null;
  codeResult: {
    code: string;
    ok: boolean;
    reason: PromotionReason | null;
    discountCents: number;
    name?: string;
    /** valid, but a better automatic offer was applied instead */
    superseded?: boolean;
  } | null;
  welcome: {
    eligible: boolean;
    reason: PromotionReason | null;
    discountType: DiscountType;
    discountValue: number;
    discountCents: number;
  } | null;
  giftCards: {
    id?: string;
    /** masked, e.g. FIDX-••••-••••-4WXC */
    code: string;
    codeLast4?: string;
    ok: boolean;
    reason: GiftCardReason | null;
    balanceCents?: number;
    appliedCents: number;
    remainingAfterCents?: number;
    expiresAt?: string | null;
  }[];
}

/** Stored on bookings created with the quote engine */
export interface BookingPricing {
  subtotalCents: number;
  recurringDiscountCents: number;
  priceCents: number;
  promotion: { id: string; kind: PromotionKind; name: string; code: string | null; discountType: DiscountType; discountValue: number; discountCents: number } | null;
  promotionDiscountCents: number;
  totalCents: number;
  vatRate: number;
  vatCents: number;
  giftCards?: { giftCard: string; codeLast4: string; amountCents: number; state: 'reserved' | 'captured' | 'released' }[];
  giftCardCents: number;
  payableCents: number;
}

export type PromotionPlacement = 'none' | 'hero' | 'banner' | 'card';
export type PromotionTheme = 'pine' | 'festive' | 'spring' | 'summer' | 'autumn' | 'winter' | 'sale';

export interface PromotionDisplay {
  placement: PromotionPlacement;
  priority: number;
  title: LocalizedText;
  text: LocalizedText;
  ctaText: LocalizedText;
  ctaHref: string;
  imageUrl: string;
  theme: PromotionTheme;
  badge: LocalizedText;
}

/** GET /promotions/active – live banners (display fields are spread in) */
export interface PromotionBanner extends PromotionDisplay {
  id: string;
  kind: PromotionKind;
  code: string | null;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountCents: number | null;
  minOrderCents: number;
  services: string[];
  startsAt: string | null;
  endsAt: string | null;
  firstBookingOnly: boolean;
}

/** Admin promotion (GET /admin/promotions) */
export interface AdminPromotion {
  _id: string;
  name: string;
  kind: PromotionKind;
  code: string | null;
  discountType: DiscountType;
  /** percent: 1–100 · fixed: cents */
  discountValue: number;
  maxDiscountCents: number | null;
  minOrderCents: number;
  services: string[];
  firstBookingOnly: boolean;
  requiresVerifiedEmail: boolean;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  usageLimit: number | null;
  perCustomerLimit: number;
  usedCount: number;
  display: PromotionDisplay;
  state: 'live' | 'scheduled' | 'ended' | 'inactive';
  live: boolean;
  stats: { applied: number; reserved: number; released: number; discountCents: number; orderCents: number };
  createdAt: string;
  updatedAt: string;
}

export interface AdminPromotionRedemption {
  _id: string;
  status: 'reserved' | 'applied' | 'released';
  discountCents: number;
  orderCents: number;
  code: string | null;
  customer: { _id: string; name: string; email: string } | null;
  booking: { _id: string; reference: string; status: BookingStatus; preferredDate: string } | null;
  createdAt: string;
}

export type GiftCardStatus = 'pending_payment' | 'active' | 'redeemed' | 'expired' | 'disabled' | 'cancelled';
export type GiftCardDesign = 'classic' | 'festive' | 'spring' | 'thanks';

/** GET /gift-cards/config */
export interface GiftCardConfig {
  enabled: boolean;
  presetAmountsCents: number[];
  minCustomCents: number;
  maxCustomCents: number;
  validityYears: number;
  maxPerBooking: number;
  designs: GiftCardDesign[];
  methods: ('stripe' | 'paypal')[];
}

/** Customer view of a purchased gift card (code only after payment) */
export interface CustomerGiftCard {
  id: string;
  status: GiftCardStatus;
  amountCents: number;
  balanceCents: number;
  code: string | null;
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  message: string;
  design: GiftCardDesign;
  deliverAt: string | null;
  deliveryStatus: 'pending' | 'sent' | 'failed';
  deliveredAt: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface AdminGiftCard {
  _id: string;
  code: string;
  status: GiftCardStatus;
  initialCents: number;
  balanceCents: number;
  purchaser: { _id: string; name: string; email: string } | null;
  senderName: string;
  senderEmail: string;
  recipientName: string;
  recipientEmail: string;
  message: string;
  design: GiftCardDesign;
  locale: Locale;
  deliverAt: string | null;
  deliveredAt: string | null;
  deliveryStatus: 'pending' | 'sent' | 'failed';
  payment: { method: 'stripe' | 'paypal' | 'admin' | null; paidAt?: string };
  expiresAt: string | null;
  disabledReason: string;
  issuedBy?: { _id: string; name: string } | string | null;
  createdAt: string;
}

export interface GiftCardTransaction {
  _id: string;
  type: 'purchase' | 'issue' | 'reserve' | 'capture' | 'release' | 'refund' | 'adjust' | 'expire';
  /** signed: negative = taken from the card */
  amountCents: number;
  balanceAfterCents: number;
  booking: { _id: string; reference: string; status: BookingStatus; preferredDate: string } | null;
  actor: { _id: string; name: string; email: string; role: Role } | null;
  note: string;
  createdAt: string;
}

/** GET /admin/analytics */
export interface AnalyticsResponse {
  from: string;
  to: string;
  bookings: { created: number; converted: number; conversionRatePct: number | null; byStatus: Record<string, number> };
  revenue: {
    beforeDiscountCents: number;
    promotionDiscountCents: number;
    afterDiscountCents: number;
    paidWithGiftCardsCents: number;
    collectedCents: number;
  };
  promotions: {
    redemptions: number;
    discountCents: number;
    byPromotion: { promotion: { _id: string; name: string; kind?: PromotionKind; code?: string | null }; redemptions: number; discountCents: number; orderCents: number }[];
  };
  firstTimeCustomers: { newCustomers: number; welcomeApplied: number; welcomeReserved: number; welcomeReleased: number };
  giftCards: { soldCount: number; soldCents: number; allTimeIssuedCents: number; allTimeOpenCents: number; redemptionPct: number | null };
}
