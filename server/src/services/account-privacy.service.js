// GDPR self-service: data export (Art. 15/20) and account deletion (Art. 17).
//
// Deletion = anonymisation. Bookings, invoices and payout records are
// accounting documents and must be kept for 10 years (§ 147 AO, § 14b UStG);
// every personal detail on them is replaced, the account is deactivated and
// all sessions are invalidated (tokenVersion++).
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

import Booking from "../models/booking.model.js";
import BookingMessage from "../models/booking-message.model.js";
import Complaint from "../models/complaint.model.js";
import GiftCard from "../models/gift-card.model.js";
import Payout from "../models/payout.model.js";
import PersonalCode from "../models/personal-code.model.js";
import Review from "../models/review.model.js";
import User from "../models/user.model.js";
import { httpError } from "../utils/helpers.js";
import { todayInBerlin } from "../utils/helpers.js";
import { recordAudit } from "./audit.service.js";
import { removeStoredKeys } from "./file-store.service.js";

export const RETENTION_YEARS = 10;
const TOMBSTONE_EMAIL = "tombstone@anonymised.invalid";
const DELETED_CUSTOMER = "Gelöschter Kunde";
const DELETED_WORKER = "Gelöschte Reinigungskraft";
const REMOVED = "entfernt";

/** Statuses that still need the customer (upcoming or unpaid work) */
const OPEN_CUSTOMER_STATUSES = ["payment_pending", "confirmed", "in_progress"];
const OPEN_WORKER_STATUSES = ["confirmed", "in_progress"];
/** Cleaner earnings not paid out yet – payout records + bank details are kept until settled */
const UNPAID_PAYOUT_STATUSES = ["pending", "processing", "on_hold"];

const openBookingsFor = (user) =>
  user.role === "worker"
    ? Booking.find({ assignedWorker: user._id, status: { $in: OPEN_WORKER_STATUSES }, preferredDate: { $gte: todayInBerlin() } })
    : Booking.find({ customer: user._id, status: { $in: OPEN_CUSTOMER_STATUSES } });

const unpaidEarnings = async (workerId) => {
  const rows = await Booking.find({ assignedWorker: workerId, "workerPayout.status": { $in: UNPAID_PAYOUT_STATUSES } }).select("workerPayout").lean();
  return { count: rows.length, cents: rows.reduce((sum, b) => sum + (b.workerPayout?.amountCents ?? 0) - (b.workerPayout?.cashHeldCents ?? 0), 0) };
};

/** What deleting would do – shown before the confirmation (GET /users/me/deletion-check) */
export const deletionPreview = async (user) => {
  const full = await User.findById(user._id).select("+password");
  const open = user.role === "admin" ? [] : await openBookingsFor(user).select("reference preferredDate slot status").sort({ preferredDate: 1 }).limit(20).lean();
  const unpaid = user.role === "worker" ? await unpaidEarnings(user._id) : { count: 0, cents: 0 };
  return {
    role: user.role,
    canDelete: user.role !== "admin" && open.length === 0,
    blockedBy: user.role === "admin" ? "ADMIN" : open.length ? (user.role === "worker" ? "OPEN_JOBS" : "OPEN_BOOKINGS") : null,
    confirmWith: full?.password ? "password" : "email",
    openBookings: open.map((b) => ({ id: b._id, reference: b.reference, preferredDate: b.preferredDate, slot: b.slot, status: b.status })),
    unpaidEarnings: unpaid,
    retentionYears: RETENTION_YEARS,
  };
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const BOOKING_EXPORT_FIELDS =
  "reference serviceId areaM2 condition frequency extras customerDetails preferredDate slot slotEnd locale notes pets estimate pricing status statusHistory.status statusHistory.changedAt payment.status payment.method payment.amountCents payment.paidAt payment.refundedAt payment.cashCollectedCents cancellation.cancelledAt cancellation.reason feedback.customer job.completedAt invoice.number invoice.issuedAt invoice.totalCents invoice.vatCents invoice.taxDeductible createdAt updatedAt";

/** Everything we store about the user, as plain JSON */
export const exportUserData = async (user) => {
  const id = user._id;
  const [bookings, reviewsWritten, reviewsReceived, messages, giftCards, personalCodes, payouts, assignedJobs, complaints] = await Promise.all([
    Booking.find({ customer: id }).select(BOOKING_EXPORT_FIELDS).sort({ createdAt: -1 }).lean(),
    Review.find({ customer: id }).select("booking worker rating punctuality quality friendliness comment recommend createdAt").lean(),
    user.role === "worker" ? Review.find({ worker: id }).select("booking rating punctuality quality friendliness comment createdAt").lean() : [],
    BookingMessage.find({ author: id }).select("booking body createdAt").sort({ createdAt: 1 }).lean(),
    GiftCard.find({ purchaser: id }).select("code status initialCents balanceCents recipientName recipientEmail message deliverAt deliveredAt expiresAt createdAt").lean(),
    PersonalCode.find({ customer: id }).select("code status expiresAt usedAt createdAt").lean(),
    user.role === "worker" ? Payout.find({ worker: id }).select("reference status provider amountCents bookings paidAt createdAt").lean() : [],
    user.role === "worker"
      ? Booking.find({ assignedWorker: id }).select("reference serviceId preferredDate slot slotEnd status job workerPayout createdAt").sort({ preferredDate: -1 }).lean()
      : [],
    // Complaints the customer filed (no internal office notes; photos as metadata only)
    Complaint.find({ customer: id }).select("bookingRef category description status resolution.message resolution.at photos.name photos.size createdAt").sort({ createdAt: -1 }).lean(),
  ]);

  const profile = {
    id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    preferredLanguage: user.preferredLanguage,
    emailVerified: Boolean(user.emailVerified),
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    linkedLogins: {
      google: user.oauth?.googleSub ? { linkedAt: user.oauth.googleLinkedAt ?? null } : null,
      apple: user.oauth?.appleSub ? { linkedAt: user.oauth.appleLinkedAt ?? null, privateRelayEmail: Boolean(user.oauth.applePrivateEmail) } : null,
    },
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    household: user.household ?? null,
    legalConsent: user.legalConsent ?? null,
    recurringCleanerPreference: user.recurringCleanerPreference ?? null,
    ...(user.role === "worker" && {
      workerStatus: user.workerStatus,
      workerProfile: user.workerProfile,
      availability: user.availability,
      holidays: user.holidays,
      bankAccountLast4: user.bankAccountLast4,
      bankAccountHolder: user.bankAccountHolder,
      payoutMethod: user.payoutMethod,
    }),
  };

  const invoices = bookings
    .filter((b) => b.invoice?.number)
    .map((b) => ({ number: b.invoice.number, issuedAt: b.invoice.issuedAt, totalCents: b.invoice.totalCents, vatCents: b.invoice.vatCents, taxDeductible: b.invoice.taxDeductible, bookingReference: b.reference }));

  return {
    exportedAt: new Date().toISOString(),
    format: "fiduxa-user-export/1",
    retentionNote: `Buchungen und Rechnungen werden nach § 147 AO ${RETENTION_YEARS} Jahre aufbewahrt.`,
    profile,
    bookings,
    invoices,
    reviews: { written: reviewsWritten, received: reviewsReceived },
    messages,
    giftCards: giftCards.map((g) => ({ ...g, code: g.status === "pending_payment" ? undefined : g.code })),
    personalCodes,
    complaints,
    ...(user.role === "worker" && { assignedJobs, payouts }),
  };
};

// ---------------------------------------------------------------------------
// Deletion / anonymisation
// ---------------------------------------------------------------------------

/** Throws 409 while the account still has open obligations */
export const assertDeletable = async (user) => {
  if (user.role === "admin") throw httpError(403, "Admin accounts cannot be deleted here. Ask another administrator.");
  if (user.role === "consumer") {
    const open = await openBookingsFor(user).select("reference preferredDate status").limit(20).lean();
    if (open.length) {
      throw Object.assign(httpError(409, "You still have an upcoming or unpaid booking. Please cancel it first or contact us."), {
        code: "OPEN_BOOKINGS",
        bookings: open.map((b) => ({ id: b._id, reference: b.reference, preferredDate: b.preferredDate, status: b.status })),
      });
    }
  } else if (user.role === "worker") {
    const open = await openBookingsFor(user).select("reference preferredDate status").limit(20).lean();
    if (open.length) {
      throw Object.assign(httpError(409, "You are still assigned to upcoming jobs. Please release them first or contact the office."), {
        code: "OPEN_JOBS",
        bookings: open.map((b) => ({ id: b._id, reference: b.reference, preferredDate: b.preferredDate, status: b.status })),
      });
    }
  }
};

/** Placeholder account that anonymised reviews point to */
const tombstoneUser = async () => {
  const existing = await User.findOne({ email: TOMBSTONE_EMAIL }).select("_id");
  if (existing) return existing._id;
  const created = await User.create({
    name: DELETED_CUSTOMER,
    email: TOMBSTONE_EMAIL,
    password: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
    role: "consumer",
    isActive: false,
    anonymisedAt: new Date(),
  });
  return created._id;
};

/**
 * Anonymise a user and the personal data on their records. Idempotent.
 * Returns a summary of what was changed.
 */
export const anonymiseUser = async (user, { actorId, reason = "", self = false } = {}) => {
  const id = user._id;
  const now = new Date();
  const isWorker = user.role === "worker";
  const anonEmail = `deleted+${id}@anonymised.invalid`;
  const before = { name: user.name, email: user.email, role: user.role };

  // 1. Bookings: customer details (kept for accounting with the invoice)
  const bookingUpdate = await Booking.updateMany(
    { customer: id },
    {
      $set: {
        "customerDetails.name": DELETED_CUSTOMER,
        "customerDetails.email": anonEmail,
        "customerDetails.phone": "",
        "customerDetails.address": REMOVED,
        "customerDetails.accessNotes": "",
        notes: "",
      },
    }
  );

  // 2. Reviews stay (ratings are the cleaner's track record) but point to the tombstone
  let reviews = 0;
  if (!isWorker) {
    const tombstone = await tombstoneUser();
    reviews = (await Review.updateMany({ customer: id }, { $set: { customer: tombstone } })).modifiedCount;
  }

  // 3. Messages written by the user
  const messages = (await BookingMessage.updateMany({ author: id }, { $set: { body: "[gelöscht]" } })).modifiedCount;

  // 4. Personal codes (welcome offer) are revoked
  const codes = (await PersonalCode.updateMany({ customer: id, status: { $in: ["issued", "reserved"] } }, { $set: { status: "revoked" } })).modifiedCount;

  // 5. Gift cards bought by the user: sender data removed (the card itself stays valid for the recipient)
  await GiftCard.updateMany({ purchaser: id }, { $set: { senderName: DELETED_CUSTOMER, senderEmail: "", message: "" } });

  // 5b. Complaints filed by the customer: free text, photos and office notes
  //     erased; category / status / remedies stay (cleaner's history, accounting)
  //     (stored photo files are deleted from object storage below)
  const complaintPhotoKeys = (await Complaint.find({ customer: id, anonymisedAt: { $exists: false } }).select("photos.storageKey").lean())
    .flatMap((c) => (c.photos ?? []).map((p) => p.storageKey));
  const complaintsAnonymised = (
    await Complaint.updateMany(
      { customer: id, anonymisedAt: { $exists: false } },
      { $set: { description: "[gelöscht]", photos: [], "resolution.message": "", "internalNotes.$[].body": "[gelöscht]", anonymisedAt: now } }
    )
  ).modifiedCount;

  // 6. Cleaner: unpaid earnings? Payout details stay until the last payout settles.
  const unpaid = isWorker ? await unpaidEarnings(id) : { count: 0, cents: 0 };
  const retainPayout = unpaid.count > 0;

  // 7. Verification documents (ID, permit …): file bytes erased, metadata kept for the audit trail
  let documentsPurged = 0;
  const fileKeys = [...complaintPhotoKeys];
  if (isWorker) {
    const docs = await User.findById(id).select("documents");
    documentsPurged = docs?.documents?.length ?? 0;
    if (documentsPurged) {
      fileKeys.push(...docs.documents.map((d) => d.storageKey));
      await User.updateOne(
        { _id: id },
        { $unset: { "documents.$[].data": "", "documents.$[].storageKey": "", "documents.$[].sha256": "" }, $set: { "documents.$[].name": REMOVED, "documents.$[].purgedAt": now } }
      );
    }
  }

  // 8. The account itself
  const fresh = await User.findById(id).select("+password +avatarData");
  fresh.name = isWorker ? DELETED_WORKER : DELETED_CUSTOMER;
  fresh.email = anonEmail;
  fresh.phone = "";
  fresh.password = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
  fresh.passwordChangedAt = now;
  fresh.tokenVersion = (fresh.tokenVersion ?? 0) + 1;
  fresh.isActive = false;
  fresh.anonymisedAt = now;
  fresh.emailVerified = false;
  fresh.household = undefined;
  fresh.recurringCleanerPreference = undefined;
  fresh.passwordResetTokenHash = undefined;
  fresh.passwordResetExpires = undefined;
  fresh.emailVerificationTokenHash = undefined;
  fresh.emailVerificationExpires = undefined;
  fresh.avatarData = undefined;
  if (fresh.avatarKey) fileKeys.push(fresh.avatarKey);
  fresh.avatarKey = "";
  // Unlink social logins: signing in with Google/Apple again starts a new account
  fresh.oauth = undefined;
  fresh.avatarType = "";
  fresh.avatarUpdatedAt = null;
  if (isWorker) {
    fresh.workerStatus = "suspended";
    fresh.workerProfile = { address: "", serviceAreas: [], experienceYears: 0, bio: "", languages: [], specialties: [], petsOk: false, bringsSupplies: false, publicVisible: false };
    fresh.availability = [];
    fresh.holidays = [];
    fresh.workEligibility = { nationality: "", euCitizen: null, declaredAt: null };
    if (retainPayout) {
      // § 147 AO + open payouts: keep IBAN/PayPal until settled (purged by the documentExpiryWatch job)
      fresh.payoutRetainedUntilSettled = true;
    } else {
      clearPayoutDetails(fresh);
    }
  }
  await fresh.save();

  // Object storage: best-effort, failures are queued and retried by the housekeeping job
  const files = await removeStoredKeys(fileKeys, "account.anonymised");

  await recordAudit({
    actor: actorId ?? id,
    action: self ? "account.deleted.self" : "customer.deleted",
    entityType: "User",
    entityId: id,
    before,
    after: { reason, unpaidEarningsCents: unpaid.cents, payoutDetailsRetained: retainPayout, documentsPurged, filesDeleted: files.deleted, filesQueued: files.queued, bookingsAnonymised: bookingUpdate.modifiedCount, reviewsUnlinked: reviews, messages, codesRevoked: codes, complaintsAnonymised, retentionYears: RETENTION_YEARS },
  });

  return { unpaidEarningsCents: unpaid.cents, payoutDetailsRetained: retainPayout, documentsPurged, filesDeleted: files.deleted, filesQueued: files.queued, bookingsAnonymised: bookingUpdate.modifiedCount, reviewsUnlinked: reviews, messagesAnonymised: messages, codesRevoked: codes, complaintsAnonymised, retentionYears: RETENTION_YEARS };
};

const clearPayoutDetails = (worker) => {
  worker.bankDetailsEncrypted = undefined;
  worker.bankDetailsIv = undefined;
  worker.bankDetailsAuthTag = undefined;
  worker.bankAccountLast4 = "";
  worker.bankAccountHolder = "";
  worker.payoutMethod = { type: "bank", paypalEmail: "" };
  worker.payoutRetainedUntilSettled = false;
};

/** Deleted cleaners whose last payout has settled: erase the retained bank details */
export const purgeSettledPayoutDetails = async () => {
  const workers = await User.find({ role: "worker", payoutRetainedUntilSettled: true }).limit(200);
  let purged = 0;
  for (const worker of workers) {
    if ((await unpaidEarnings(worker._id)).count > 0) continue;
    clearPayoutDetails(worker);
    await worker.save();
    await recordAudit({ actor: null, action: "account.payout_details.purged", entityType: "User", entityId: worker._id, after: { reason: "all payouts settled" } });
    purged += 1;
  }
  return purged;
};
