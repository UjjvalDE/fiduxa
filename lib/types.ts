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
  /** Duration multiplier per m² (deep cleaning 1.4, end-of-tenancy 1.6) */
  timeFactor?: number;
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
  bathroomMinutes?: number;
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
    /** Time multiplier per home condition; "normal" is the fixed ×1 reference */
    conditionFactor: { basic: number; normal: number; moderate: number; heavy: number };
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
  workerPay: {
    hourlyRateCents: number;
    payoutDelayDays: number;
    payModel: 'commission' | 'hourly';
    commissionTiers: CommissionTiersConfig;
  };
  finance?: FinanceAssumptions;
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
  /** my-bookings: date is past, cleaner has not confirmed the job yet */
  awaitingConfirmation?: boolean;
  reference: string;
  customer: string | PersonRef;
  serviceId: ServiceId;
  areaM2: number;
  bathrooms?: number;
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
    grossCents?: number;
    commissionCents?: number;
    /** immutable snapshot of how the pay was calculated at completion */
    basis?: 'commission' | 'hourly';
    commissionPct?: number;
    tierKey?: CommissionTierKey;
    earnedAt: string;
    dueAt: string;
    status: 'pending' | 'on_hold' | 'processing' | 'paid';
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
  /** What YOU earn for this job (current tier % or hourly rate) */
  pay?: JobPayPreview | null;
}

export interface JobPayPreview {
  amountCents: number;
  basis: 'commission' | 'hourly';
  commissionPct?: number;
  /** true once the amount is the immutable completion record */
  final?: boolean;
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
  /** Cleaner pay: final record after completion, preview before */
  pay?: JobPayPreview | null;
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
  /** currently being sent via the payout provider */
  processingCents?: number;
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
    payoutMethod: PayoutMethod;
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
/** pending = waiting · due = eligible · on_hold · processing = payout under way · paid */
export type PayoutStatus = 'pending' | 'due' | 'on_hold' | 'processing' | 'paid';

/** How a cleaner wants to be paid out */
export interface PayoutMethod {
  type: 'bank' | 'paypal';
  paypalEmail: string;
}

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
  /** processing = sent to the provider · paid · failed (earnings released) */
  status: 'processing' | 'paid' | 'failed';
  provider?: 'bank' | 'paypal';
  failureReason?: string;
  amountCents: number;
  jobCount: number;
  paidAt: string;
  bankAccountLast4: string;
  note: string;
}

export interface WorkerEarningsResponse {
  summary: EarningsSummary & { rateCents: number; defaultRateCents: number };
  bank: { accountHolder: string; iban: string | null };
  payoutMethod: PayoutMethod;
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
  worker: {
    _id: string;
    name: string;
    email: string;
    bankAccountLast4: string;
    bankAccountHolder: string;
    /** preferred payout route; paypal target is masked (a•••@domain) */
    payout: { type: 'bank' | 'paypal'; target: string };
  };
  dueCents: number;
  pendingCents: number;
  onHoldCents: number;
  processingCents: number;
  /** what customers paid for these jobs / what stays with the platform */
  grossCents: number;
  commissionCents: number;
  jobs: {
    _id: string;
    reference: string;
    date: string;
    amountCents: number;
    grossCents?: number | null;
    commissionCents?: number | null;
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
  totals: {
    dueCents: number;
    pendingCents: number;
    onHoldCents: number;
    processingCents: number;
    grossCents: number;
    commissionCents: number;
  };
  now?: string;
  groups: OpenPayoutGroup[];
}

export interface AdminPayoutRecord {
  _id: string;
  reference: string;
  /** records from before the status field exist only as paid */
  status?: 'processing' | 'paid' | 'failed';
  provider?: 'bank' | 'paypal';
  paypalEmail?: string;
  providerBatchId?: string | null;
  providerItemId?: string | null;
  failureReason?: string;
  initiatedAt?: string | null;
  amountCents: number;
  jobCount: number;
  paidAt: string | null;
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
  /** Past jobs the cleaner has not confirmed (or reported as not happened) */
  stuckJobs?: number;
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
  | 'already_used'
  /** someone else's personal code */
  | 'not_yours'
  /** verified, personal code not issued yet */
  | 'code_pending';

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
    /** a personal (single-use, own-account) code */
    personal?: boolean;
  } | null;
  welcome: {
    eligible: boolean;
    reason: PromotionReason | null;
    discountType: DiscountType;
    discountValue: number;
    discountCents: number;
    /** The customer's own personal welcome code (only returned to its owner) */
    code?: string | null;
    codeExpiresAt?: string | null;
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

/** GET /users/me/welcome-code */
export interface WelcomeCodeInfo {
  code?: string;
  status: 'issued' | 'reserved' | 'used' | 'expired' | 'revoked' | 'verify_email';
  expiresAt?: string | null;
  discountType?: DiscountType;
  discountValue?: number;
  maxDiscountCents?: number | null;
  minOrderCents?: number;
}

/* ---------- Rating-based commission system ---------- */

export type CommissionTierKey = 'new' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface CommissionTierRequirements {
  minJobs: number;
  minReviews: number;
  minRating: number;
  commissionPct: number;
}

export interface CommissionTiersConfig {
  new: { commissionPct: number };
  bronze: CommissionTierRequirements;
  silver: CommissionTierRequirements;
  gold: CommissionTierRequirements;
  platinum: CommissionTierRequirements;
  diamond: CommissionTierRequirements;
}

export interface CommissionCounters {
  jobsCompleted: number;
  verifiedReviews: number;
  /** 1 decimal, null until the first verified review */
  ratingAvg: number | null;
  reliabilityPct: number | null;
}

export interface CommissionTierState {
  key: CommissionTierKey;
  commissionPct: number;
  /** override wins over the tier percentage */
  effectivePct: number;
  overridden: boolean;
}

export interface NextTierInfo {
  key: CommissionTierKey;
  commissionPct: number;
  requirements: { minJobs: number; minReviews: number; minRating: number };
  /** 0 = requirement met; rating is the required average (0 when met) */
  missing: { jobs: number; reviews: number; rating: number };
}

export interface WorkerPerformanceResponse {
  counters: CommissionCounters;
  tier: CommissionTierState;
  trustScore: number;
  nextTier: NextTierInfo | null;
  payModel: 'commission' | 'hourly';
  tierOrder: CommissionTierKey[];
  tiers: CommissionTiersConfig;
  totals: { grossCents: number; earningsCents: number; commissionCents: number };
}

export interface WorkerReviewItem {
  _id: string;
  rating: number;
  comment: string;
  hidden: boolean;
  dispute: { status: 'open' | 'approved' | 'rejected'; message: string; adminNote: string } | null;
  booking: { reference: string; preferredDate: string } | null;
  createdAt: string;
}

export interface AdminCommissionRow {
  worker: { _id: string; name: string; email: string; isActive?: boolean };
  tier: CommissionTierState;
  override: { commissionPct: number; reason: string; at: string } | null;
  counters: CommissionCounters;
  trustScore: number;
  totals: { grossCents: number; earningsCents: number; commissionCents: number };
}

export interface AdminCommissionOverview {
  tiers: CommissionTiersConfig;
  tierOrder: CommissionTierKey[];
  payModel: 'commission' | 'hourly';
  workers: AdminCommissionRow[];
  totals: { workers: number; grossCents: number; earningsCents: number; commissionCents: number };
}

export interface AdminCommissionWorkerDetail {
  worker: { _id: string; name: string };
  tier: CommissionTierState;
  override: { commissionPct: number; reason: string; at: string } | null;
  counters: CommissionCounters;
  trustScore: number;
  nextTier: NextTierInfo | null;
  transactions: {
    _id: string;
    reference: string;
    date: string;
    grossCents: number;
    amountCents: number;
    commissionCents: number;
    commissionPct?: number;
    tierKey?: CommissionTierKey;
    basis?: 'commission' | 'hourly';
    status: string;
  }[];
}

export interface AdminCommissionReport {
  rows: { _id: string; name: string; tierKey: CommissionTierKey | null; jobs: number; grossCents: number; earningsCents: number; commissionCents: number }[];
  totals: { jobs: number; grossCents: number; earningsCents: number; commissionCents: number };
}

/* ---------- Finance dashboard ---------- */

export interface FinanceAssumptions {
  incomeTaxRatePct: number;
  vatBasis: 'full' | 'commission';
  monthlyFixedCostsCents: number;
  fees: { paypal: { pct: number; fixedCents: number }; stripe: { pct: number; fixedCents: number } };
}

export interface FinanceSummary {
  bookings: number;
  grossCents: number;
  vatCents: number;
  netRevenueCents: number;
  cleanerPayCents: number;
  commissionCents: number;
  paymentFeesCents: number;
  fixedCostsCents: number;
  profitBeforeTaxCents: number;
  incomeTaxCents: number;
  profitAfterTaxCents: number;
  marginPct: number | null;
}

export type FinancePeriod = 'today' | 'month' | 'year' | 'all';

export interface FinanceOverview {
  today: string;
  year: number;
  period: FinancePeriod;
  years: number[];
  periods: Record<FinancePeriod, FinanceSummary>;
  monthly: (FinanceSummary & { month: string })[];
  breakdown: FinanceSummary;
  byService: { key: string; grossCents: number; bookings: number; feeCents: number }[];
  byMethod: { key: string; grossCents: number; bookings: number; feeCents: number }[];
  pipeline: { cents: number; bookings: number };
  refunds: { cents: number; count: number };
  assumptions: FinanceAssumptions & { vatRate: number };
}

/* ---------- Homepage trust facts + cleaner applications ---------- */

export interface HomeTrust {
  rating: { average: number | null; count: number };
  reviews: { _id: string; rating: number; comment: string; author: string; serviceId: string | null; createdAt: string }[];
  /** share of the job price that goes to the cleaner (from the commission ladder) */
  cleanerShare: { minPct: number; maxPct: number } | null;
  cancellationCutoffHours: number;
}

export type WorkPermit = 'german' | 'eu' | 'settled' | 'residence_work' | 'blue_card' | 'asylum_permit' | 'none';
export type ApplicationHours = '5-15' | '15-30' | '31+';
export type ApplicationExperience = 'none' | 'lt2' | 'gt2' | 'gt5';
export type ExperiencePlace = 'homes' | 'hotels' | 'clinics' | 'offices';
export type ApplicationVehicle = 'car' | 'scooter' | 'bicycle' | 'none';
export type ApplicationSource = 'social' | 'friends' | 'news' | 'event' | 'tv_radio' | 'job_portal' | 'other';
export type ApplicationStatus = 'new' | 'contacted' | 'invited' | 'rejected';

export interface WorkerApplicationInput {
  name: string;
  email: string;
  phone: string;
  postcode: string;
  languages: string[];
  permit: WorkPermit;
  hoursPerWeek: ApplicationHours;
  experience: ApplicationExperience;
  experiencePlaces: ExperiencePlace[];
  vehicle: ApplicationVehicle;
  source: ApplicationSource;
  message?: string;
  locale: Locale;
  privacyAccepted: true;
  cv?: { name: string; dataUrl: string };
  /** honeypot – must stay empty */
  website?: string;
}

export interface AdminApplicationListItem {
  _id: string;
  name: string;
  email: string;
  phone: string;
  postcode: string;
  permit: WorkPermit;
  hoursPerWeek: ApplicationHours;
  experience: ApplicationExperience;
  vehicle: ApplicationVehicle;
  status: ApplicationStatus;
  hasCv: boolean;
  createdAt: string;
}

export interface AdminApplicationDetail extends Omit<WorkerApplicationInput, 'privacyAccepted' | 'cv' | 'website'> {
  _id: string;
  status: ApplicationStatus;
  adminNote: string;
  invitedWorker: string | null;
  cv: { name: string; type: string; size: number } | null;
  privacyAcceptedAt: string;
  createdAt: string;
}

export type AdminEmailStatus = 'queued' | 'sent' | 'failed';

/** Transactional e-mail outbox entry (Admin → E-Mails) */
export interface AdminEmail {
  _id: string;
  to: string;
  subject: string;
  template: string;
  bookingRef: string;
  status: AdminEmailStatus;
  attempts: number;
  lastError: string;
  nextAttemptAt: string | null;
  sentAt?: string | null;
  resentAt?: string | null;
  createdAt: string;
}

export interface AdminEmailListResponse {
  emails: AdminEmail[];
  counts: Partial<Record<AdminEmailStatus, number>>;
  pagination: Pagination;
}
/* [slot-A-types] */
// Recurring cleaning plans ("Putzplan") – GET /customer/series, GET /admin/series
export type SeriesStatus = 'active' | 'paused' | 'ended';
export type SeriesPaymentMethod = 'cash' | 'invoice' | 'online';
export type SeriesFrequency = Exclude<Frequency, 'one-time'>;
export interface SeriesOccurrence {
  _id: string;
  reference: string;
  preferredDate: string;
  slot: string;
  slotEnd?: string;
  status: BookingStatus;
  paymentStatus: BookingPaymentStatus;
  paymentMethod?: string;
  totalCents: number | null;
  holdExpiresAt?: string | null;
  cleaner: { _id: string; name: string } | null;
  /** Still free to skip (before the cancellation cutoff) */
  cancellable: boolean;
}
export interface BookingSeries {
  _id: string;
  status: SeriesStatus;
  frequency: SeriesFrequency;
  intervalDays: number;
  serviceId: ServiceId;
  areaM2: number;
  condition: Condition;
  extras: string[];
  durationMinutes: number;
  startTime: string;
  weekday: number;
  paymentMethod: SeriesPaymentMethod;
  pets: boolean;
  address: { postcode: string; address: string };
  preferredWorker: { _id: string; name: string | null } | null;
  nextDate: string;
  pausedUntil: string | null;
  counters: { generated: number; completed: number };
  createdFrom: string;
  lastGeneratedDate: string | null;
  upcoming: SeriesOccurrence[];
  endedAt: string | null;
  endedReason: 'customer' | 'admin' | 'system' | null;
  createdAt: string;
  updatedAt: string;
}
export interface AdminBookingSeries extends BookingSeries {
  customer: PersonRef | string;
  customerDetails: Booking['customerDetails'];
  notes: string;
  lastProblem: { date: string; reason: 'no_window' | 'no_capacity' | 'pricing' | 'error'; message: string; at: string } | null;
}
/** Booking fields of a plan occurrence (series = plan id, seriesIndex = position; 0 = first booking) */
export type BookingWithSeries = Booking & { series?: string | null; seriesIndex?: number };
export type SeriesAction = 'pause' | 'resume' | 'end';
/* [slot-B-types] */
/* [slot-C-types] */
/** Money policies (admin settings → policies): cancellation fees, cash rules, payouts */
export interface PoliciesSettings {
  cancellation: { freeHours: number; lateFeePct: number; veryLateHours: number; veryLateFeePct: number; cleanerSharePct: number };
  cash: { maxTotalCents: number; minTier: CommissionTierKey; suspendBelowCents: number };
  payouts: { eligibilityDays: number; fastPayoutDays: number; fastPayoutPct: number; fastPayoutMinTier: CommissionTierKey };
  /** Selectable customer payment methods (owner decision: PayPal only for now) */
  paymentMethods?: { enabled: PaymentMethodKey[] };
}
export type CancelFeeTier = 'free' | 'late' | 'very_late';
/** GET /customer/bookings/:id/cancel-preview */
export interface CancelPreview {
  cancellable?: boolean;
  tier: CancelFeeTier;
  feePct: number;
  feeCents: number;
  priceCents: number;
  paidCents: number;
  chargedCents: number;
  refundCents: number;
  outstandingCents: number;
  cleanerCents: number;
  cutoffs: { start: string; freeUntil: string; veryLateFrom: string };
  policy: PoliciesSettings['cancellation'];
}
export type PriceAdjustmentStatus = 'proposed' | 'open' | 'paid' | 'refunded' | 'waived' | 'declined' | 'expired';
/** booking.priceAdjustments[] – price deltas after edits / duration reviews */
export interface PriceAdjustment {
  _id: string;
  deltaCents: number;
  reason: string;
  kind: 'edit' | 'duration';
  minutes?: number;
  status: PriceAdjustmentStatus;
  at: string;
  decidedAt?: string;
  resolvedAt?: string;
  paidVia?: 'online' | 'cash' | 'invoice';
  checkoutUrl?: string;
  /** cleaner = extra-time request during the job */
  origin?: 'admin' | 'cleaner' | 'system';
  expiresAt?: string;
  previousDurationMinutes?: number;
  newSlotEnd?: string;
}
export interface PaymentRefundEntry {
  amountCents: number;
  reason: string;
  refundId: string | null;
  at: string;
}
/** Booking fields added by the money policies (cancellation fee, adjustments, cash feedback) */
export type BookingWithMoney = Booking & {
  priceAdjustments?: PriceAdjustment[];
  cancellation?: Booking['cancellation'] & { feeCents?: number; feePct?: number; cleanerCents?: number; refundCents?: number; charged?: boolean };
  feedback?: { durationMismatch?: boolean; cashMismatch?: boolean; customer?: { actualCashCents?: number } };
};
/** Payment record fields added by partial refunds / adjustment pay links */
export type AdminPaymentWithRefunds = Omit<AdminPayment, 'status'> & {
  status: AdminPayment['status'] | 'partially_refunded';
  purpose?: 'booking' | 'gift_card' | 'adjustment';
  refundedCents?: number;
  refunds?: PaymentRefundEntry[];
};
/* [slot-D-types] */
/* [slot-E-types] */
/* [slot-F-types] */

// [worker/admin feedback / extra time]
export type PaymentMethodKey = 'paypal' | 'stripe' | 'cash';
export type ExtraTimeRequestStatus = PriceAdjustmentStatus;
/** worker job: own extra-time requests (no prices) */
export interface WorkerExtraTimeRequest {
  id: string;
  minutes: number;
  reason: string;
  status: ExtraTimeRequestStatus;
  expiresAt: string | null;
  newSlotEnd: string;
  at: string;
  decidedAt: string | null;
}
export interface FeedbackPendingItem {
  bookingId: string;
  reference: string;
  serviceId: string;
  preferredDate: string;
  completedAt: string | null;
}
type Avg = number | null;
export interface FeedbackCustomerAverages { key: string; count: number; overallExperience: Avg; cleanerRating: Avg; professionalPunctual: Avg; notAsExpected: number }
export interface FeedbackWorkerAverages { key: string; count: number; experience: Avg; customerRating: Avg; homeCondition: Avg; cooperative: Avg; jobDifficulty: Avg; withDifficulties: number }
export interface FeedbackTagCount { tag: string; count: number }
/** GET /admin/feedback (internal) */
export interface AdminFeedbackSummary {
  overall: { customer: FeedbackCustomerAverages | null; worker: FeedbackWorkerAverages | null };
  dismissed: { customer?: number; worker?: number };
  perCleaner: (FeedbackCustomerAverages & { name: string; email: string })[];
  perCustomer: (FeedbackWorkerAverages & { name: string; email: string })[];
  perDistrict: { postcode: string; customer?: FeedbackCustomerAverages; worker?: FeedbackWorkerAverages }[];
  tags: { customerIssues: FeedbackTagCount[]; workerDifficulties: FeedbackTagCount[]; workerConditions: FeedbackTagCount[] };
}

// [customer feedback / extra time / invoices]
/** Price adjustment incl. cleaner extra-time requests (origin "cleaner") */
export type CustomerPriceAdjustment = Omit<PriceAdjustment, 'status'> & {
  status: PriceAdjustmentStatus | 'expired';
  origin?: 'admin' | 'cleaner' | 'system';
  expiresAt?: string;
  previousDurationMinutes?: number;
  newSlotEnd?: string;
};
/** GET /customer/invoices */
export interface CustomerInvoice {
  bookingId: string;
  reference: string;
  serviceId: string;
  preferredDate: string;
  slot?: string;
  slotEnd?: string;
  durationMinutes: number | null;
  paymentStatus?: 'paid' | 'pending' | 'unpaid' | 'failed' | 'refunded' | 'partially_refunded' | 'refund_pending';
  number: string;
  issuedAt: string;
  totalCents: number;
  paymentMethod?: string;
}
/** GET /customer/bookings/feedback/pending */
export interface PendingFeedback {
  bookingId: string;
  reference: string;
  serviceId: string;
  preferredDate: string;
  completedAt: string | null;
  cleanerName?: string;
}
