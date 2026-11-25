// Fiduxa dummy marketplace dataset: 100 customers (90 verified), 20 cleaners
// (12 approved/active, 3 pending, 2 inactive, 1 suspended, 2 onboarding
// incomplete), 900 completed + 450 upcoming bookings, extra cancelled /
// refunded / expired samples, reviews, TEST payments, commission records and
// payouts. Every record carries testData = TEST_DATA_TAG; cleanup removes
// ONLY tagged records.
//
//   npm run seed:dummy            generate (no-op when the dataset exists)
//   npm run seed:dummy -- --reset clean + regenerate
//   npm run seed:dummy:verify     validate counts, integrity, money
//   npm run seed:dummy:clean      remove generated records only
//
// Prices come from the live estimate engine and settings; commission comes
// from the real tier engine (tierForCounters) evaluated chronologically, so
// every historical earning reflects the tier the cleaner had at that moment.
import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import User from "../models/user.model.js";
import Booking from "../models/booking.model.js";
import Review from "../models/review.model.js";
import Payment from "../models/payment.model.js";
import Payout from "../models/payout.model.js";
import AvailabilitySlot from "../models/availability-slot.model.js";
import Promotion from "../models/promotion.model.js";
import PromotionRedemption from "../models/promotion-redemption.model.js";
import AuditLog from "../models/audit-log.model.js";
import { TEST_DATA_TAG } from "../models/plugins/test-data.plugin.js";
import { loadSettings } from "../services/settings.service.js";
import { createEstimate } from "../services/estimate.service.js";
import { computeDiscount } from "../services/promotion.service.js";
import { vatContained } from "../services/quote.service.js";
import { commissionCounters, refreshWorkerTier, tierForCounters } from "../services/commission.service.js";
import { encryptBankDetails } from "../utils/bank-encryption.js";
import { slotStartInstant, todayInBerlin, DAY_MS } from "../utils/helpers.js";
import { EXTRAS, extraAvailableFor } from "../data/catalogue.js";
import { OPERATIONS, PRICING, WORKER_PAY } from "../config/pricing.js";

const TAG = TEST_DATA_TAG;
const EMAIL_DOMAIN = "dummy.fiduxa.invalid"; // .invalid never resolves – no real mail
export const DUMMY_PASSWORD = "DummyTest#2026";
const BUSY = ["payment_pending", "confirmed", "in_progress", "completed"];

// ---------------------------------------------------------------------------
// Deterministic randomness (same dataset on every run)
// ---------------------------------------------------------------------------
let seedState = 20261121;
const rand = () => {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs.at(-1)[0];
};

// ---------------------------------------------------------------------------
// Fictional reference data
// ---------------------------------------------------------------------------
const FIRST = [
  "Anja", "Bernd", "Clara", "Dennis", "Elif", "Florian", "Greta", "Hannes", "Ilka", "Jonas", "Katrin", "Lars", "Mira",
  "Niklas", "Oksana", "Paul", "Rieke", "Sven", "Tamara", "Ulf", "Vera", "Wiebke", "Yusuf", "Zoe", "Agnieszka", "Bastian",
  "Carina", "Dorian", "Emre", "Frieda", "Gregor", "Helena", "Ivo", "Jana", "Kai", "Leonie", "Malte", "Nele", "Olaf",
  "Pia", "Quentin", "Romy", "Selin", "Till", "Ute", "Vincent", "Wanda", "Xenia", "Yara", "Zeynep", "Marek", "Ewa",
];
const LAST = [
  "Altmann", "Brendel", "Conrad", "Dietz", "Eberle", "Falk", "Gerlach", "Hollmann", "Imhof", "Jansen", "Kessler",
  "Lorenz", "Martens", "Nowicki", "Oswald", "Pohl", "Quast", "Reimers", "Sauer", "Thiele", "Ullrich", "Voss", "Wendt",
  "Yilmaz", "Zielinski", "Brandt", "Dahlke", "Engel", "Fuchs", "Grabowski", "Haas", "Jäger", "Kowalczyk", "Lindner",
  "Meinke", "Nitsche", "Ostrowski", "Peschel", "Rademacher", "Seidel", "Tews", "Uhlig", "Vogt", "Winkler", "Ziegler",
];
const STREETS = [
  "Ahornweg", "Birkenallee", "Lindenstraße", "Kastanienhof", "Fliederweg", "Eichengrund", "Am Ententeich",
  "Weidenring", "Holunderpfad", "Rosengasse", "Lerchenstraße", "Finkenweg", "Am Mühlbach", "Seeuferstraße",
  "Waldblick", "Sonnenhang", "Kranichweg", "Tulpenstraße", "Wiesengrund", "Ulmenallee",
];
const POSTCODES = [
  ["10115", "Mitte"], ["10119", "Mitte"], ["10178", "Mitte"], ["10243", "Friedrichshain"], ["10245", "Friedrichshain"],
  ["10405", "Prenzlauer Berg"], ["10437", "Prenzlauer Berg"], ["10551", "Moabit"], ["10553", "Moabit"],
  ["10585", "Charlottenburg"], ["10627", "Charlottenburg"], ["10707", "Wilmersdorf"], ["10715", "Wilmersdorf"],
  ["10777", "Schöneberg"], ["10827", "Schöneberg"], ["10961", "Kreuzberg"], ["10999", "Kreuzberg"],
  ["12043", "Neukölln"], ["12049", "Neukölln"], ["12099", "Tempelhof"], ["12161", "Friedenau"], ["12203", "Lichterfelde"],
  ["13347", "Wedding"], ["13353", "Wedding"], ["13405", "Reinickendorf"], ["14050", "Westend"], ["14197", "Wilmersdorf"],
];
const DISTRICTS = [...new Set(POSTCODES.map(([, d]) => d))];
// Bundesnetzagentur range reserved for fiction/drama: +49 30 23125 000–999
const phoneFor = (n) => `+49 30 23125${String(n).padStart(3, "0")}`;

const NOTES = [
  "Schlüssel liegt beim Nachbarn im 2. OG.", "Bitte die Schuhe ausziehen, danke!", "Katze ist scheu, bitte Türen geschlossen halten.",
  "Parkett bitte nur nebelfeucht wischen.", "Klingel defekt – bitte kurz anrufen.", "Putzmittel stehen unter der Spüle.",
  "Bitte besonders auf die Küche achten.", "Fenster im Wohnzimmer bitte auslassen.", "", "", "",
];
const REVIEW_TEXT = {
  5: ["Alles blitzsauber, sehr gründlich und freundlich!", "Super Arbeit, gerne wieder.", "Pünktlich, zuverlässig und top Ergebnis.",
      "Wohnung glänzt, vielen Dank!", "Sehr sorgfältig, auch an Ecken gedacht, die ich vergessen hatte.", "Perfekt wie immer."],
  4: ["Gute Arbeit, nur das Bad hätte etwas gründlicher sein können.", "Sauber und nett, kam 10 Minuten später.",
      "Insgesamt zufrieden, kleine Stellen übersehen.", "Freundlich und flott, gutes Ergebnis."],
  3: ["Okay, aber einige Stellen wurden ausgelassen.", "Hat etwas länger gedauert als geplant, Ergebnis mittelmäßig.",
      "Grundsätzlich in Ordnung, Küche war nicht ganz sauber."],
};

// ---------------------------------------------------------------------------
// Cleaner definitions (ratings/jobs chosen to land in every commission tier)
// ---------------------------------------------------------------------------
const FULL = ["home-cleaning", "deep-cleaning", "end-of-tenancy"];
const W = (days, start, end) => days.map((weekday) => ({ weekday, start, end }));
const MON_FRI = [1, 2, 3, 4, 5];
const MON_SAT = [1, 2, 3, 4, 5, 6];
const CLEANERS = [
  // 12 approved & active — the only ones that receive bookings
  { key: "A", cat: "approved", band: "excellent", rating: 4.95, jobs: 230, reviews: 130, services: FULL, avail: W(MON_SAT, "07:30", "19:00"), exp: 9, expect: "diamond" },
  { key: "B", cat: "approved", band: "excellent", rating: 4.92, jobs: 130, reviews: 75, services: FULL, avail: W(MON_FRI, "08:00", "18:30"), exp: 6, expect: "platinum" },
  { key: "C", cat: "approved", band: "excellent", rating: 5.0, jobs: 30, reviews: 22, services: FULL, avail: W([1, 2, 3, 4, 5, 6, 7], "08:00", "14:00"), exp: 2, expect: "silver" },
  { key: "D", cat: "approved", band: "very_good", rating: 4.82, jobs: 70, reviews: 42, services: FULL, avail: W(MON_FRI, "12:30", "19:30"), exp: 4, expect: "gold" },
  { key: "E", cat: "approved", band: "very_good", rating: 4.76, jobs: 120, reviews: 70, services: FULL, avail: W(MON_SAT, "08:00", "18:00"), exp: 7, expect: "gold" },
  { key: "F", cat: "approved", band: "very_good", rating: 4.72, jobs: 28, reviews: 21, services: ["home-cleaning", "end-of-tenancy"], avail: W([1, 3, 5, 6], "08:00", "18:00"), exp: 3, expect: "silver" },
  { key: "G", cat: "approved", band: "good", rating: 4.65, jobs: 100, reviews: 55, services: FULL, avail: W(MON_FRI, "08:00", "18:30"), exp: 5, expect: "silver" },
  { key: "H", cat: "approved", band: "good", rating: 4.55, jobs: 15, reviews: 10, services: ["home-cleaning"], avail: W([2, 4, 6], "09:00", "17:00"), exp: 1, expect: "bronze" },
  { key: "I", cat: "approved", band: "good", rating: 4.62, jobs: 50, reviews: 32, services: FULL, avail: W(MON_FRI, "08:00", "16:00"), exp: 3, expect: "silver" },
  { key: "J", cat: "approved", band: "average", rating: 4.45, jobs: 92, reviews: 50, services: FULL, avail: W(MON_SAT, "08:00", "18:00"), exp: 6, expect: "new" },
  { key: "K", cat: "approved", band: "average", rating: 4.35, jobs: 20, reviews: 12, services: ["home-cleaning", "deep-cleaning"], avail: W(MON_FRI, "12:00", "19:00"), exp: 2, expect: "new" },
  { key: "L", cat: "approved", band: "new", rating: 4.75, jobs: 15, reviews: 4, services: ["home-cleaning", "deep-cleaning"], avail: W([1, 2, 3, 4], "08:00", "15:00"), exp: 0, expect: "new" },
  // 8 without bookings
  { key: "M", cat: "pending_review", band: "new", services: FULL, avail: W(MON_FRI, "08:00", "17:00"), exp: 2 },
  { key: "N", cat: "pending_review", band: "new", services: ["home-cleaning"], avail: W([1, 3, 5], "09:00", "15:00"), exp: 0 },
  { key: "O", cat: "pending_review", band: "new", services: ["deep-cleaning", "end-of-tenancy"], avail: W(MON_SAT, "08:00", "18:00"), exp: 4 },
  { key: "P", cat: "inactive", band: "new", services: FULL, avail: W(MON_FRI, "08:00", "16:00"), exp: 3 },
  { key: "Q", cat: "inactive", band: "new", services: ["home-cleaning"], avail: W([2, 4], "10:00", "16:00"), exp: 1 },
  { key: "R", cat: "suspended", band: "new", services: FULL, avail: W(MON_FRI, "08:00", "18:00"), exp: 2 },
  { key: "S", cat: "incomplete", band: "new", services: [], avail: [], exp: 0 },
  { key: "T", cat: "incomplete", band: "new", services: [], avail: [], exp: 0 },
];
const LANG_SETS = [["de"], ["de", "en"], ["de", "pl"], ["de", "tr"], ["de", "en", "ru"], ["de", "uk"], ["de", "en", "es"]];
const BIOS = [
  "Ich reinige seit Jahren mit viel Liebe zum Detail und arbeite gern mit umweltfreundlichen Mitteln.",
  "Zuverlässig, pünktlich und gründlich – Küche und Bad sind meine Spezialität.",
  "Erfahrung in Grund- und Umzugsreinigung, ruhig und sorgfältig.",
  "Ich bringe gute Laune und eigenes Material mit.",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const toMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const dayKey = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY_MS);
const isoWeekday = (d) => ((d.getUTCDay() + 6) % 7) + 1; // 1 = Monday
const fmtEuro = (c) => `${(c / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`;
const STARTS = ["08:00", "08:30", "09:00", "10:00", "12:30", "13:00", "13:30", "14:00", "15:00"].map(toMin);
const BUFFER = OPERATIONS.travelBufferMinutes ?? 30;

const assertSafeTarget = (dbName) => {
  const reasons = [];
  if (process.env.NODE_ENV === "production") reasons.push("NODE_ENV=production");
  if (process.env.PAYPAL_MODE === "live") reasons.push("PAYPAL_MODE=live");
  if (/prod/i.test(dbName)) reasons.push(`database name "${dbName}"`);
  if (reasons.length) {
    console.error(`Refusing to touch dummy data: ${reasons.join(", ")}. This seeder is for development/staging only.`);
    process.exit(2);
  }
};

/** Integer star counts (3–5) whose average is as close as possible to `avg`. */
const ratingSet = (n, avg) => {
  const total = Math.min(5 * n, Math.max(3 * n, Math.round(avg * n)));
  const deficit = 5 * n - total;
  const threes = Math.min(Math.floor(deficit / 2), Math.floor(deficit * 0.3));
  const fours = deficit - 2 * threes;
  return shuffle([...Array(threes).fill(3), ...Array(fours).fill(4), ...Array(n - threes - fours).fill(5)]);
};

/** Values in [min,max] for `count` people that sum exactly to `total`. */
const distribute = (count, total, min, max, palette) => {
  const vals = Array.from({ length: count }, () => pick(palette));
  let sum = vals.reduce((s, v) => s + v, 0);
  while (sum !== total) {
    const i = int(0, count - 1);
    if (sum < total && vals[i] < max) (vals[i]++, sum++);
    else if (sum > total && vals[i] > min) (vals[i]--, sum--);
  }
  return vals;
};

/** A booking spec priced by the live estimate engine (≤ 5 h so a day fits two jobs). */
const makeSpec = (customer, { future = false, weekly = false } = {}) => {
  const serviceId = weekly ? "home-cleaning" : weighted([["home-cleaning", 60], ["deep-cleaning", 22], ["end-of-tenancy", 18]]);
  const [lo, hi] = serviceId === "home-cleaning" ? [35, 110] : serviceId === "deep-cleaning" ? [30, 85] : [30, 75];
  let areaM2 = int(lo / 5, hi / 5) * 5;
  const condition = weighted([["basic", 20], ["normal", 50], ["moderate", 22], ["heavy", 8]]);
  const frequency = weekly
    ? "weekly"
    : serviceId === "home-cleaning"
      ? weighted([["one-time", 60], ["biweekly", 22], ["monthly", 18]])
      : "one-time";
  const pool = EXTRAS.filter((e) => e.active !== false && extraAvailableFor(e, serviceId));
  const extras = shuffle(pool).slice(0, weighted([[0, 35], [1, 35], [2, 20], [3, 10]])).map((e) => e.id);
  let estimate = createEstimate({ serviceId, areaM2, condition, frequency, extras });
  while (estimate.durationMinutes > 300 && areaM2 > 30) {
    areaM2 -= 5;
    estimate = createEstimate({ serviceId, areaM2, condition, frequency, extras });
  }
  const rooms = Math.max(1, Math.min(6, Math.round(areaM2 / 25)));
  const baths = areaM2 > 90 ? 2 : 1;
  const note = pick(NOTES);
  return {
    customer,
    serviceId,
    areaM2,
    condition,
    frequency,
    extras: estimate.extras.map((e) => e.id),
    estimate,
    pets: chance(0.25),
    notes: `${rooms} Zimmer, ${baths} Bad${note ? ` – ${note}` : ""}`,
    future,
  };
};

// ---------------------------------------------------------------------------
// Scheduling: per cleaner and day, no overlaps (incl. travel buffer), inside
// the cleaner's weekly hours and outside holidays.
// ---------------------------------------------------------------------------
const makeCalendar = () => new Map(); // cleanerKey → Map(dayKey → [ [start,end] ])
const fitStart = (cal, cleaner, day, duration) => {
  const wd = isoWeekday(day);
  const windows = cleaner.avail.filter((a) => a.weekday === wd);
  if (!windows.length) return null;
  if ((cleaner.holidays ?? []).some((h) => day >= h.from && day <= h.to)) return null;
  const busy = cal.get(cleaner.key)?.get(dayKey(day)) ?? [];
  for (const start of shuffle(STARTS)) {
    const end = start + duration;
    const inWindow = windows.some((w) => start >= toMin(w.start) && end <= toMin(w.end));
    if (!inWindow) continue;
    if (busy.some(([s, e]) => start < e + BUFFER && s < end + BUFFER)) continue;
    return start;
  }
  return null;
};
const occupy = (cal, cleaner, day, start, duration) => {
  if (!cal.has(cleaner.key)) cal.set(cleaner.key, new Map());
  const m = cal.get(cleaner.key);
  const k = dayKey(day);
  if (!m.has(k)) m.set(k, []);
  m.get(k).push([start, start + duration]);
};

// ---------------------------------------------------------------------------
// GENERATE
// ---------------------------------------------------------------------------
const generate = async () => {
  await loadSettings();
  const today = todayInBerlin();
  const now = new Date();
  const passwordHash = await bcrypt.hash(DUMMY_PASSWORD, 12);
  const admin = await User.findOne({ role: "admin", testData: { $exists: false } }).select("_id").lean();
  const log = (m) => console.log(`  • ${m}`);
  console.log(`Generating dummy dataset (tag "${TAG}") …`);

  // ---------- names (unique) ----------
  const names = shuffle(FIRST.flatMap((f) => LAST.map((l) => `${f} ${l}`))).slice(0, 120);

  // ---------- cleaners ----------
  const cleanerDocs = [];
  CLEANERS.forEach((c, i) => {
    const name = names[100 + i];
    const [postcode, district] = POSTCODES[(i * 3) % POSTCODES.length];
    const complete = c.cat !== "incomplete";
    const registered = c.cat === "approved" && c.jobs >= 50 ? new Date(Date.UTC(2025, 9, int(1, 25))) : addDays(today, -int(20, 330));
    c.holidays =
      c.key === "B" ? [{ from: addDays(today, 30), to: addDays(today, 37), note: "Urlaub" }]
      : c.key === "E" ? [{ from: addDays(today, 50), to: addDays(today, 54), note: "Familienbesuch" }]
      : [];
    const bank = complete
      ? (() => {
          const iban = "DE89370400440532013000"; // public example IBAN (documentation sample)
          const enc = encryptBankDetails({ accountHolder: name, iban, bic: "COBADEFFXXX" });
          return {
            bankDetailsEncrypted: enc.encrypted,
            bankDetailsIv: enc.iv,
            bankDetailsAuthTag: enc.authTag,
            bankAccountLast4: iban.slice(-4),
            bankAccountHolder: name,
          };
        })()
      : {};
    const doc = new User({
      name,
      email: `reinigung.${String(i + 1).padStart(2, "0")}@${EMAIL_DOMAIN}`,
      phone: phoneFor(100 + i),
      password: passwordHash,
      role: "worker",
      preferredLanguage: pick(["de", "de", "de", "en", "pl"]),
      emailVerified: true,
      emailVerifiedAt: registered,
      workerStatus: c.cat === "inactive" ? "approved" : c.cat === "incomplete" ? "pending_review" : c.cat,
      isActive: !["inactive", "suspended"].includes(c.cat),
      workerProfile: complete
        ? {
            address: `${pick(STREETS)} ${int(1, 80)}, ${postcode} Berlin`,
            serviceAreas: shuffle(DISTRICTS).slice(0, int(3, 6)).concat(district).filter((v, k, a) => a.indexOf(v) === k),
            experienceYears: c.exp,
            bio: pick(BIOS),
            languages: pick(LANG_SETS),
            specialties: [...c.services, ...shuffle(["windows", "ironing", "oven-fridge", "balcony", "eco-products"]).slice(0, int(0, 3))],
            petsOk: chance(0.7),
            bringsSupplies: chance(0.4),
            publicVisible: c.cat === "approved",
            // Automatic assignment (round 3): home postcode + travel radius,
            // services they do not offer (catalogue IDs)
            homePostcode: postcode,
            maxTravelKm: c.key === "H" || c.key === "L" ? 8 : 14,
            excludedServices: ["home-cleaning", "deep-cleaning", "end-of-tenancy", "business-cleaning"].filter((id) => !c.services.includes(id)),
          }
        : { address: "", serviceAreas: [], languages: ["de"] },
      availability: c.avail,
      // Maximum workload: newer cleaners take at most 3 jobs a day
      workload: c.jobs && c.jobs < 40 ? { maxJobsPerDay: 3, maxHoursPerDay: null, maxJobsPerWeek: null, maxHoursPerWeek: null } : undefined,
      holidays: c.holidays,
      ...bank,
      payoutMethod: { type: "bank" },
      testData: TAG,
      createdAt: registered,
      updatedAt: registered,
    });
    c.doc = doc;
    cleanerDocs.push(doc);
  });
  const approved = CLEANERS.filter((c) => c.cat === "approved");

  // ---------- customers ----------
  const unverifiedIdx = new Set(shuffle([...Array(100).keys()]).slice(0, 10));
  const customers = [];
  for (let i = 0; i < 100; i++) {
    const [postcode] = pick(POSTCODES);
    const verified = !unverifiedIdx.has(i);
    customers.push({
      i,
      verified,
      doc: new User({
        name: names[i],
        email: `kunde.${String(i + 1).padStart(3, "0")}@${EMAIL_DOMAIN}`,
        phone: phoneFor(i),
        password: passwordHash,
        role: "consumer",
        preferredLanguage: weighted([["de", 80], ["en", 12], ["pl", 8]]),
        emailVerified: verified,
        isActive: true,
        testData: TAG,
      }),
      address: `${pick(STREETS)} ${int(1, 120)}${chance(0.3) ? pick(["a", "b"]) : ""}`,
      postcode,
    });
  }
  const verified = customers.filter((c) => c.verified);
  const completedCounts = distribute(90, 900, 5, 20, [5, 6, 7, 8, 8, 9, 10, 10, 10, 11, 12, 12, 13, 15, 16, 18]);
  const pendingCounts = distribute(90, 450, 1, 12, [1, 2, 3, 4, 5, 5, 5, 6, 7, 8, 9, 10]);
  verified.forEach((c, k) => {
    c.completed = completedCounts[k];
    c.pending = pendingCounts[k];
    c.preferred = shuffle(approved).slice(0, 2);
  });
  log(`customers: 100 (verified ${verified.length}, unverified ${customers.length - verified.length})`);

  // ---------- completed specs → cleaners (exact job quotas, capability-aware) ----------
  const completedSpecs = verified.flatMap((c) => Array.from({ length: c.completed }, () => makeSpec(c)));
  const quota = new Map(approved.map((c) => [c.key, c.jobs]));
  const assignCleaner = (spec) => {
    const eligible = approved.filter((c) => quota.get(c.key) > 0 && c.services.includes(spec.serviceId));
    const pref = spec.customer.preferred.filter((c) => eligible.includes(c));
    const chosen = pref.length && chance(0.75) ? pick(pref) : weighted(eligible.map((c) => [c, quota.get(c.key)]));
    if (!chosen) throw new Error("No cleaner quota left – check CLEANERS job totals (must sum to 900).");
    quota.set(chosen.key, quota.get(chosen.key) - 1);
    return chosen;
  };
  // restrictive services first so capability constraints never dead-end
  for (const spec of [...completedSpecs].sort((a, b) => (a.serviceId === "home-cleaning") - (b.serviceId === "home-cleaning"))) {
    spec.cleaner = assignCleaner(spec);
  }

  // ---------- schedule completed jobs in the past (Dec 2025 – yesterday) ----------
  const cal = makeCalendar();
  const histStart = new Date(Date.UTC(2025, 11, 1));
  const histDays = [];
  for (let d = histStart; d < addDays(today, -1); d = addDays(d, 1)) histDays.push(d);
  for (const spec of completedSpecs) {
    let placed = false;
    for (const day of shuffle(histDays)) {
      const start = fitStart(cal, spec.cleaner, day, spec.estimate.durationMinutes);
      if (start == null) continue;
      occupy(cal, spec.cleaner, day, start, spec.estimate.durationMinutes);
      spec.day = day;
      spec.start = start;
      placed = true;
      break;
    }
    if (!placed) throw new Error(`Could not schedule a completed job for cleaner ${spec.cleaner.key}`);
  }

  // ---------- future days without real (admin) windows ----------
  const futureFrom = addDays(today, 2);
  const futureTo = addDays(today, 91);
  const realWindows = await AvailabilitySlot.find({ date: { $gte: futureFrom, $lte: futureTo }, testData: { $exists: false } })
    .select("date")
    .lean();
  const blocked = new Set(realWindows.map((w) => dayKey(w.date)));
  const futureDays = [];
  for (let d = futureFrom; d <= futureTo; d = addDays(d, 1)) if (!blocked.has(dayKey(d))) futureDays.push(d);
  log(`future days available for dummy bookings: ${futureDays.length} (days with your own windows are left untouched)`);

  // ---------- upcoming bookings: weekly series first, then the rest ----------
  const pendingSpecs = [];
  const weeklyCustomers = shuffle(verified.filter((c) => c.pending >= 3 && c.pending <= 6)).slice(0, 12);
  const futureSet = new Set(futureDays.map(dayKey));
  let weeklySeries = 0;
  for (const c of weeklyCustomers) {
    const n = c.pending;
    const proto = makeSpec(c, { future: true, weekly: true });
    const candidates = shuffle(c.preferred.concat(shuffle(approved))).filter((cl) => cl.services.includes("home-cleaning"));
    let done = false;
    for (const cleaner of candidates) {
      for (const first of shuffle(futureDays)) {
        const dates = Array.from({ length: n }, (_, k) => addDays(first, 7 * k));
        if (!dates.every((d) => futureSet.has(dayKey(d)))) continue;
        const start = fitStart(cal, cleaner, first, proto.estimate.durationMinutes);
        if (start == null) continue;
        const ok = dates.every((d) => {
          const busy = cal.get(cleaner.key)?.get(dayKey(d)) ?? [];
          const end = start + proto.estimate.durationMinutes;
          const wd = cleaner.avail.find((a) => a.weekday === isoWeekday(d));
          const holiday = (cleaner.holidays ?? []).some((h) => d >= h.from && d <= h.to);
          return wd && !holiday && start >= toMin(wd.start) && end <= toMin(wd.end) && !busy.some(([s, e]) => start < e + BUFFER && s < end + BUFFER);
        });
        if (!ok) continue;
        for (const d of dates) {
          occupy(cal, cleaner, d, start, proto.estimate.durationMinutes);
          pendingSpecs.push({ ...proto, cleaner, day: d, start, weeklySeries: true });
        }
        done = true;
        weeklySeries++;
        break;
      }
      if (done) break;
    }
    if (done) c.pendingScheduled = n;
  }
  for (const c of verified) {
    const missing = c.pending - (c.pendingScheduled ?? 0);
    for (let k = 0; k < missing; k++) {
      const spec = makeSpec(c, { future: true });
      const order = shuffle(c.preferred).concat(shuffle(approved)).filter((cl, idx, arr) => arr.indexOf(cl) === idx && cl.services.includes(spec.serviceId));
      let placed = false;
      for (const cleaner of order) {
        for (const day of shuffle(futureDays)) {
          const start = fitStart(cal, cleaner, day, spec.estimate.durationMinutes);
          if (start == null) continue;
          occupy(cal, cleaner, day, start, spec.estimate.durationMinutes);
          Object.assign(spec, { cleaner, day, start });
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) throw new Error("Not enough free future capacity for the upcoming bookings.");
      pendingSpecs.push(spec);
    }
  }
  log(`weekly recurring series: ${weeklySeries} customers`);

  // ---------- test coupon (inactive – cannot be redeemed live) ----------
  const coupon = new Promotion({
    name: "[TEST] Stammkunden-Gutschein 10 %",
    kind: "coupon",
    code: "TESTSEED10",
    discountType: "percent",
    discountValue: 10,
    perCustomerLimit: 20,
    startsAt: new Date(Date.UTC(2025, 10, 1)),
    endsAt: addDays(today, 120),
    active: false,
    display: { placement: "none" },
    testData: TAG,
  });

  // ---------- build bookings ----------
  let refNo = 0;
  const ref = () => `TST-${String(++refNo).padStart(5, "0")}`;
  const bookingDocs = [];
  const paymentDocs = [];
  const redemptionDocs = [];
  const windowsByDay = new Map();
  const windowFor = (day) => {
    const k = dayKey(day);
    if (!windowsByDay.has(k)) {
      windowsByDay.set(
        k,
        new AvailabilitySlot({
          date: day,
          startTime: "07:00",
          endTime: "20:00",
          capacity: approved.length,
          booked: 0,
          active: true,
          note: "[TEST-SEED] Dummy-Daten",
          createdBy: admin?._id,
          testData: TAG,
        })
      );
    }
    return windowsByDay.get(k);
  };

  const priceSpec = (spec) => {
    const withCoupon = chance(0.08);
    const priceCents = spec.estimate.totalCents;
    const promotionDiscountCents = withCoupon ? Math.min(computeDiscount(coupon, priceCents), priceCents) : 0;
    const totalCents = priceCents - promotionDiscountCents;
    return {
      withCoupon,
      pricing: {
        subtotalCents: spec.estimate.subtotalCents,
        recurringDiscountCents: spec.estimate.discountCents,
        priceCents,
        promotion: withCoupon
          ? { id: coupon._id, kind: "coupon", name: coupon.name, code: coupon.code, discountType: "percent", discountValue: 10, discountCents: promotionDiscountCents }
          : null,
        promotionDiscountCents,
        totalCents,
        vatRate: PRICING.vatRate,
        vatCents: vatContained(totalCents),
        giftCards: [],
        giftCardCents: 0,
        payableCents: totalCents,
      },
    };
  };

  const baseBooking = (spec, { status, createdAt }) => {
    const c = spec.customer;
    const { withCoupon, pricing } = priceSpec(spec);
    const _id = new mongoose.Types.ObjectId();
    if (withCoupon) {
      redemptionDocs.push(
        new PromotionRedemption({
          promotion: coupon._id,
          kind: "coupon",
          code: coupon.code,
          customer: c.doc._id,
          booking: _id,
          discountCents: pricing.promotionDiscountCents,
          orderCents: pricing.priceCents,
          status: status === "cancelled" || status === "expired" ? "released" : "applied",
          fingerprint: { email: c.doc.email, phone: c.doc.phone.replace(/\D/g, ""), address: `${c.address} ${c.postcode}`.toLowerCase() },
          appliedAt: createdAt,
          testData: TAG,
          createdAt,
          updatedAt: createdAt,
        })
      );
    }
    return {
      _id,
      reference: ref(),
      customer: c.doc._id,
      serviceId: spec.serviceId,
      areaM2: spec.areaM2,
      condition: spec.condition,
      frequency: spec.frequency,
      extras: spec.extras,
      customerDetails: {
        name: c.doc.name,
        email: c.doc.email,
        phone: c.doc.phone,
        postcode: c.postcode,
        address: c.address,
        accessNotes: chance(0.2) ? "Hinterhaus, 3. OG links" : "",
      },
      preferredDate: spec.day,
      slot: toHHMM(spec.start),
      slotEnd: toHHMM(spec.start + spec.estimate.durationMinutes),
      notes: spec.notes,
      pets: spec.pets,
      estimate: { ...spec.estimate, calculatedAt: createdAt },
      pricing,
      locale: c.doc.preferredLanguage,
      consents: { earlyStartRequestedAt: createdAt },
      testData: TAG,
      createdAt,
      updatedAt: createdAt,
    };
  };

  const onlinePayment = (b, provider, paidAt, status = "paid") => {
    paymentDocs.push(
      new Payment({
        purpose: "booking",
        booking: b._id,
        customer: b.customer,
        provider,
        checkoutSessionId: `TEST-${provider.toUpperCase()}-${b.reference}`,
        paymentIntentId: `TEST-CAPTURE-${b.reference}`,
        amountCents: b.pricing.totalCents,
        status,
        paidAt,
        ...(status === "refunded" && { refundedAt: addDays(paidAt, int(1, 4)), refundId: `TEST-REFUND-${b.reference}` }),
        testData: TAG,
        createdAt: paidAt,
        updatedAt: paidAt,
      })
    );
    return { status: status === "refunded" ? "refunded" : "paid", method: provider, amountCents: b.pricing.totalCents, currency: "EUR", paidAt, checkoutSessionId: `TEST-${provider.toUpperCase()}-${b.reference}` };
  };

  // completed (chronological so commission follows the tier at that moment)
  const completedSorted = [...completedSpecs].sort((a, b) => a.day - b.day || a.start - b.start);
  const reviewTargets = new Map(); // cleanerKey → Set(index of their jobs that get reviews)
  for (const cl of approved) {
    const idx = shuffle([...Array(cl.jobs).keys()]).slice(0, cl.reviews);
    cl.ratingQueue = ratingSet(cl.reviews, cl.rating);
    reviewTargets.set(cl.key, new Set(idx));
    cl.done = 0;
    cl.reviewLog = []; // { at, rating }
  }
  const reviewDocs = [];
  for (const spec of completedSorted) {
    const cl = spec.cleaner;
    const createdAt = new Date(addDays(spec.day, -int(3, 25)).getTime() + int(7, 21) * 3600e3);
    const b = baseBooking(spec, { status: "completed", createdAt });
    const startedAt = slotStartInstant(spec.day, b.slot);
    const actual = chance(0.85) ? Math.max(60, spec.estimate.durationMinutes + pick([-30, -15, 0, 0, 0, 15, 30, 45])) : null;
    const completedAt = new Date(startedAt.getTime() + (actual ?? spec.estimate.durationMinutes) * 60e3);
    const method = weighted([["paypal", 45], ["stripe", 30], ["cash", 25]]);
    b.payment =
      method === "cash"
        ? { status: "paid", method: "cash", amountCents: b.pricing.totalCents, currency: "EUR", paidAt: completedAt, cashCollectedCents: b.pricing.totalCents, cashCollectedAt: completedAt, cashCollectedBy: cl.doc._id }
        : onlinePayment(b, method, new Date(createdAt.getTime() + int(2, 30) * 60e3));
    if (method === "cash") {
      paymentDocs.push(
        new Payment({
          purpose: "booking", booking: b._id, customer: b.customer, provider: "cash", checkoutSessionId: `cash-${b._id}`,
          amountCents: b.pricing.totalCents, status: "paid", paidAt: completedAt, testData: TAG, createdAt: completedAt, updatedAt: completedAt,
        })
      );
    }
    b.status = "completed";
    b.assignedWorker = cl.doc._id;
    b.assignedAt = new Date(createdAt.getTime() + int(1, 48) * 3600e3);
    b.statusHistory = [
      { status: "confirmed", changedAt: createdAt, note: "Booked" },
      { status: "in_progress", changedAt: startedAt, changedBy: cl.doc._id, note: "Started by worker" },
      { status: "completed", changedAt: completedAt, changedBy: cl.doc._id, note: "Completed by worker" },
    ];
    b.job = {
      startedAt,
      completedAt,
      workerNote: chance(0.3) ? pick(["Alles erledigt.", "Kühlschrank war nicht geleert – ausgelassen.", "Kundin war sehr zufrieden."]) : "",
      checklistDone: ["kitchen", "bathroom", "living"],
      ...(actual != null && { actualDurationMinutes: actual }),
    };

    // ---- commission: tier as of this completion (real tier engine) ----
    const visible = cl.reviewLog.filter((r) => r.at < completedAt);
    const counters = {
      jobsCompleted: cl.done,
      verifiedReviews: visible.length,
      ratingAvg: visible.length ? visible.reduce((s, r) => s + r.rating, 0) / visible.length : null,
    };
    const gross = b.pricing.totalCents;
    if (WORKER_PAY.payModel === "commission") {
      const tier = tierForCounters(counters);
      const amount = Math.max(0, gross - Math.round((gross * tier.commissionPct) / 100));
      b.workerPayout = {
        amountCents: amount, rateCents: WORKER_PAY.hourlyRateCents, minutes: spec.estimate.durationMinutes, grossCents: gross,
        commissionCents: gross - amount, basis: "commission", commissionPct: tier.commissionPct, tierKey: tier.key,
        cashHeldCents: method === "cash" ? gross : 0, earnedAt: completedAt,
        dueAt: addDays(completedAt, WORKER_PAY.payoutDelayDays), status: "pending",
      };
    } else {
      const amount = Math.round((spec.estimate.durationMinutes / 60) * WORKER_PAY.hourlyRateCents);
      b.workerPayout = {
        amountCents: amount, rateCents: WORKER_PAY.hourlyRateCents, minutes: spec.estimate.durationMinutes, grossCents: gross,
        commissionCents: gross - amount, basis: "hourly", cashHeldCents: method === "cash" ? gross : 0, earnedAt: completedAt,
        dueAt: addDays(completedAt, WORKER_PAY.payoutDelayDays), status: "pending",
      };
    }

    // ---- review (planned subset per cleaner) ----
    const jobIndex = cl.done;
    cl.done++;
    b.feedback = { emailedAt: new Date(completedAt.getTime() + 5 * 60e3), durationMismatch: false };
    if (reviewTargets.get(cl.key).has(jobIndex)) {
      const rating = cl.ratingQueue.pop();
      const at = new Date(Math.min(completedAt.getTime() + int(2, 96) * 3600e3, now.getTime() - 3600e3));
      cl.reviewLog.push({ at, rating });
      const customerDuration = actual != null && chance(0.6) ? (chance(0.08) ? actual + pick([-60, 60, 75]) : actual) : null;
      b.feedback.customer = {
        ...(customerDuration != null && { actualDurationMinutes: Math.max(30, customerDuration) }),
        recommend: rating >= 4,
        ...(spec.frequency !== "one-time" && { keepCleaner: rating >= 4 ? "same" : pick(["different", "auto"]) }),
        submittedAt: at,
      };
      if (customerDuration != null && actual != null && Math.abs(customerDuration - actual) > 30) b.feedback.durationMismatch = true;
      const lang = REVIEW_TEXT[rating];
      reviewDocs.push(
        new Review({
          booking: b._id,
          customer: b.customer,
          worker: cl.doc._id,
          rating,
          punctuality: Math.max(1, Math.min(5, rating + pick([0, 0, 0, -1, 1]))),
          quality: rating,
          friendliness: Math.max(1, Math.min(5, rating + pick([0, 0, 1]))),
          comment: chance(0.75) ? pick(lang) : "",
          recommend: rating >= 4,
          testData: TAG,
          createdAt: at,
          updatedAt: at,
        })
      );
    }
    bookingDocs.push(b);
  }
  if (approved.some((c) => c.ratingQueue.length)) throw new Error("Review plan mismatch.");

  // disputes on a few 3-star reviews (still visible → averages unchanged)
  const threeStars = shuffle(reviewDocs.filter((r) => r.rating === 3)).slice(0, 3);
  threeStars.forEach((r, k) => {
    r.dispute = {
      status: k < 2 ? "open" : "rejected",
      message: "Die Kundin war beim Termin nicht anwesend, die Bewertung bezieht sich nicht auf meine Arbeit.",
      openedAt: new Date(r.createdAt.getTime() + 86400e3),
      ...(k === 2 && { resolvedAt: new Date(r.createdAt.getTime() + 3 * 86400e3), adminNote: "Bewertung bleibt – Leistung wurde laut Kundin erbracht." }),
    };
  });

  // payouts: monthly settlement on the 3rd (bank, recorded by the office)
  const payoutDocs = [];
  const byCleaner = new Map(approved.map((c) => [String(c.doc._id), []]));
  bookingDocs.forEach((b) => byCleaner.get(String(b.assignedWorker))?.push(b));
  const settlementDays = [];
  for (let m = 0; m < 12; m++) {
    const d = new Date(Date.UTC(2026, m, 3, 9, 0));
    if (d < now && d > histStart) settlementDays.push(d);
  }
  // a few recent eligible jobs on hold (e.g. complaint under review)
  const lastSettlement = settlementDays.at(-1);
  const holdCandidates = shuffle(bookingDocs.filter((b) => b.workerPayout.dueAt > lastSettlement && b.workerPayout.dueAt <= now)).slice(0, 5);
  holdCandidates.forEach((b) => (b.workerPayout.status = "on_hold"));
  let payoutNo = 0;
  for (const cl of approved) {
    const jobs = byCleaner.get(String(cl.doc._id));
    for (const day of settlementDays) {
      const batch = jobs.filter((b) => b.workerPayout.status === "pending" && b.workerPayout.dueAt <= day);
      if (!batch.length) continue;
      const amount = batch.reduce((s, b) => s + b.workerPayout.amountCents - (b.workerPayout.cashHeldCents ?? 0), 0);
      const paidAt = new Date(day.getTime() + 3600e3);
      const payout = new Payout({
        worker: cl.doc._id,
        reference: `TEST-AUS-${day.toISOString().slice(0, 7).replace("-", "")}-${cl.key}-${++payoutNo}`,
        status: "paid",
        provider: "bank",
        amountCents: amount,
        currency: "EUR",
        bookings: batch.map((b) => b._id),
        bankAccountLast4: cl.doc.bankAccountLast4,
        initiatedAt: day,
        paidAt,
        createdBy: admin?._id,
        note: amount < 0 ? "[TEST] Verrechnung Barzahlungen" : "[TEST] Monatsabrechnung",
        testData: TAG,
        createdAt: day,
        updatedAt: paidAt,
      });
      payoutDocs.push(payout);
      batch.forEach((b) => Object.assign(b.workerPayout, { status: "paid", paidAt, payout: payout._id }));
    }
  }

  // upcoming bookings (confirmed, inside a test window, assigned)
  let rescheduled = 0;
  for (const spec of pendingSpecs.sort((a, b) => a.day - b.day || a.start - b.start)) {
    const createdAt = new Date(now.getTime() - int(1, 30) * 86400e3 - int(0, 12) * 3600e3);
    const b = baseBooking(spec, { status: "confirmed", createdAt });
    const window = windowFor(spec.day);
    window.booked += 1;
    b.availabilitySlot = window._id;
    b.status = "confirmed";
    b.assignedWorker = spec.cleaner.doc._id;
    b.assignedAt = new Date(createdAt.getTime() + int(1, 24) * 3600e3);
    b.statusHistory = [{ status: "confirmed", changedAt: createdAt, note: "Booked" }];
    const method = weighted([["cash", 50], ["paypal", 30], ["stripe", 20]]);
    b.payment = method === "cash" ? { status: "unpaid", method: "cash", amountCents: b.pricing.totalCents, currency: "EUR" } : onlinePayment(b, method, new Date(createdAt.getTime() + int(2, 30) * 60e3));
    if (!spec.weeklySeries && rescheduled < 30 && chance(0.1)) {
      rescheduled++;
      const from = addDays(spec.day, -pick([1, 2, 7]));
      b.changeLog = [
        {
          at: new Date(createdAt.getTime() + int(2, 48) * 3600e3),
          by: spec.customer.doc._id,
          role: chance(0.7) ? "consumer" : "admin",
          changes: [
            { field: "preferredDate", from: dayKey(from), to: dayKey(spec.day) },
            ...(chance(0.5) ? [{ field: "slot", from: "08:00", to: b.slot }] : []),
          ],
        },
      ];
    }
    bookingDocs.push(b);
  }

  // extra samples (outside the 900/450 targets)
  const extra = { cancelled: 0, refunded: 0, expired: 0 };
  const extraSpecs = shuffle(verified).slice(0, 60);
  extraSpecs.forEach((c, k) => {
    const kind = k < 40 ? "cancelled" : k < 52 ? "refunded" : "expired";
    const future = kind === "cancelled" && k < 15;
    const spec = makeSpec(c, { future });
    spec.day = future ? pick(futureDays) : pick(histDays);
    spec.start = pick(STARTS);
    const createdAt = future ? new Date(now.getTime() - int(1, 20) * 86400e3) : new Date(addDays(spec.day, -int(3, 20)).getTime() + 10 * 3600e3);
    const b = baseBooking(spec, { status: kind, createdAt });
    b.slotReleased = true;
    if (kind === "expired") {
      b.status = "expired";
      b.holdExpiresAt = new Date(createdAt.getTime() + (OPERATIONS.holdMinutes ?? PRICING.holdMinutes ?? 35) * 60e3);
      b.payment = { status: "unpaid", method: "paypal", amountCents: b.pricing.totalCents, currency: "EUR" };
      b.statusHistory = [
        { status: "payment_pending", changedAt: createdAt, note: "Waiting for payment" },
        { status: "expired", changedAt: b.holdExpiresAt, note: "Payment not completed in time" },
      ];
    } else if (kind === "refunded") {
      b.status = "cancelled";
      const paidAt = new Date(createdAt.getTime() + 600e3);
      b.payment = onlinePayment(b, pick(["paypal", "stripe"]), paidAt, "refunded");
      b.payment.refundedAt = addDays(paidAt, 2);
      b.statusHistory = [
        { status: "confirmed", changedAt: createdAt, note: "Booked" },
        { status: "cancelled", changedAt: addDays(paidAt, 2), note: "Cancelled by customer – refunded" },
      ];
    } else {
      b.status = "cancelled";
      b.payment = { status: "unpaid", method: "cash", amountCents: b.pricing.totalCents, currency: "EUR" };
      b.statusHistory = [
        { status: "confirmed", changedAt: createdAt, note: "Booked" },
        { status: "cancelled", changedAt: new Date(createdAt.getTime() + int(1, 5) * 86400e3), note: pick(["Cancelled by customer", "Termin passt nicht mehr"]) },
      ];
    }
    extra[kind]++;
    bookingDocs.push(b);
  });

  // customer registration dates: before their first booking
  for (const c of customers) {
    const mine = bookingDocs.filter((b) => String(b.customer) === String(c.doc._id));
    const first = mine.reduce((m, b) => (b.createdAt < m ? b.createdAt : m), now);
    const registered = c.verified ? new Date(first.getTime() - int(2, 40) * 86400e3) : new Date(now.getTime() - int(1, 60) * 86400e3);
    c.doc.createdAt = registered;
    c.doc.updatedAt = registered;
    if (c.verified) c.doc.emailVerifiedAt = new Date(registered.getTime() + int(5, 600) * 60e3);
  }
  coupon.usedCount = redemptionDocs.filter((r) => r.status !== "released").length;

  // ---------- validate every document with the real schemas, then insert ----------
  const raw = (doc) => {
    const err = doc.validateSync();
    if (err) throw err;
    return doc.toObject({ depopulate: true });
  };
  const insert = async (Model, docs) => {
    if (!docs.length) return 0;
    const objs = docs.map((d) => raw(d instanceof mongoose.Document ? d : new Model(d)));
    for (let i = 0; i < objs.length; i += 500) await Model.collection.insertMany(objs.slice(i, i + 500), { ordered: true });
    return objs.length;
  };
  log(`users: ${await insert(User, [...cleanerDocs, ...customers.map((c) => c.doc)])}`);
  log(`availability windows (test): ${await insert(AvailabilitySlot, [...windowsByDay.values()])}`);
  log(`promotion (test coupon, inactive): ${await insert(Promotion, [coupon])}`);
  log(`bookings: ${await insert(Booking, bookingDocs)}`);
  log(`reviews: ${await insert(Review, reviewDocs)}`);
  log(`payments (TEST): ${await insert(Payment, paymentDocs)}`);
  log(`payouts (TEST): ${await insert(Payout, payoutDocs)}`);
  log(`promotion redemptions: ${await insert(PromotionRedemption, redemptionDocs)}`);
  log(`extra samples: cancelled ${extra.cancelled}, refunded ${extra.refunded}, expired ${extra.expired}; rescheduled upcoming ${rescheduled}`);

  // commission tier cache via the real service (writes audit entries on change)
  for (const cl of approved) await refreshWorkerTier(cl.doc._id, { reason: "dummy_seed" });
  console.log("Generation finished.");
};

// ---------------------------------------------------------------------------
// VERIFY
// ---------------------------------------------------------------------------
const verify = async ({ section } = {}) => {
  await loadSettings();
  const results = [];
  const check = (label, ok, detail = "") => {
    results.push(ok);
    console.log(`  ${ok ? "✔" : "✘"} ${label}${detail !== "" ? `  — ${detail}` : ""}`);
  };
  const today = todayInBerlin();

  const customers = await User.find({ testData: TAG, role: "consumer" }).select("emailVerified").lean();
  const cleaners = await User.find({ testData: TAG, role: "worker" }).select("name email workerStatus isActive workerProfile availability holidays workerCommission").lean();
  const approvedActive = cleaners.filter((c) => c.workerStatus === "approved" && c.isActive);
  const bookings = await Booking.find({ testData: TAG })
    .select("reference customer status preferredDate slot slotEnd serviceId estimate.durationMinutes assignedWorker availabilitySlot pricing payment workerPayout feedback changeLog frequency")
    .lean();

  if (section !== "cleaners") {
    console.log("\nCUSTOMERS");
    const verifiedIds = new Set(customers.filter((c) => c.emailVerified).map((c) => String(c._id)));
    check("total 100", customers.length === 100, customers.length);
    check("verified 90", verifiedIds.size === 90, verifiedIds.size);
    check("unverified 10", customers.length - verifiedIds.size === 10, customers.length - verifiedIds.size);
    check("verification rate 90 %", Math.round((verifiedIds.size / customers.length) * 100) === 90, `${Math.round((verifiedIds.size / Math.max(1, customers.length)) * 100)} %`);

    console.log("\nBOOKINGS (verified customers)");
    const forVerified = bookings.filter((b) => verifiedIds.has(String(b.customer)));
    const completed = forVerified.filter((b) => b.status === "completed");
    const pending = forVerified.filter((b) => b.status === "confirmed" && b.preferredDate >= today);
    check("completed 900", completed.length === 900, completed.length);
    check("pending (upcoming, confirmed) 450", pending.length === 450, pending.length);
    check("average completed 10.0", completed.length / 90 === 10, (completed.length / 90).toFixed(2));
    check("average pending 5.0", pending.length / 90 === 5, (pending.length / 90).toFixed(2));
    check("total 1,350", completed.length + pending.length === 1350, completed.length + pending.length);
    const perCust = new Map();
    completed.forEach((b) => perCust.set(String(b.customer), (perCust.get(String(b.customer)) ?? 0) + 1));
    const counts = [...perCust.values()];
    check("natural spread (min/max completed per customer)", Math.min(...counts) >= 5 && Math.max(...counts) >= 15, `${Math.min(...counts)}–${Math.max(...counts)}`);
    check("unverified customers have no bookings", bookings.every((b) => verifiedIds.has(String(b.customer))));
    check("completed in the past, pending in the future", completed.every((b) => b.preferredDate < today) && pending.every((b) => b.preferredDate > today));
    const byService = Object.fromEntries(["home-cleaning", "deep-cleaning", "end-of-tenancy"].map((s) => [s, forVerified.filter((b) => b.serviceId === s).length]));
    check("all three services represented (≥ 100 each)", Object.values(byService).every((n) => n >= 100), JSON.stringify(byService));
    const extras = { cancelled: bookings.filter((b) => b.status === "cancelled").length, refunded: bookings.filter((b) => b.payment?.status === "refunded").length, expired: bookings.filter((b) => b.status === "expired").length };
    check("extra samples tracked separately", extras.cancelled > 0 && extras.expired > 0, JSON.stringify(extras));
    check("rescheduled / weekly samples present", pending.filter((b) => b.changeLog?.length).length > 0 && pending.filter((b) => b.frequency === "weekly").length > 0,
      `rescheduled ${pending.filter((b) => b.changeLog?.length).length}, weekly ${pending.filter((b) => b.frequency === "weekly").length}`);
  }

  console.log("\nCLEANERS");
  const cat = (c) => (c.workerStatus === "suspended" ? "suspended" : !c.isActive ? "inactive" : c.workerStatus === "approved" ? "approved" : c.workerProfile?.address ? "pending" : "incomplete");
  const cats = cleaners.reduce((m, c) => ((m[cat(c)] = (m[cat(c)] ?? 0) + 1), m), {});
  check("total 20", cleaners.length === 20, cleaners.length);
  check("12 approved · 3 pending · 2 inactive · 1 suspended · 2 incomplete",
    cats.approved === 12 && cats.pending === 3 && cats.inactive === 2 && cats.suspended === 1 && cats.incomplete === 2, JSON.stringify(cats));
  const activeIds = new Set(approvedActive.map((c) => String(c._id)));
  const assigned = bookings.filter((b) => b.assignedWorker && BUSY.includes(b.status));
  check("bookings assigned only to approved & active cleaners", assigned.every((b) => activeIds.has(String(b.assignedWorker))), assigned.length);
  const byId = new Map(cleaners.map((c) => [String(c._id), c]));
  check("cleaner capability matches the service",
    assigned.every((b) => byId.get(String(b.assignedWorker))?.workerProfile?.specialties?.includes(b.serviceId)));
  // overlaps incl. travel buffer
  let overlaps = 0;
  const groups = new Map();
  for (const b of assigned) {
    const k = `${b.assignedWorker}|${dayKey(b.preferredDate)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push([toMin(b.slot), toMin(b.slot) + (b.estimate?.durationMinutes ?? 120)]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < list.length; i++) if (list[i][0] < list[i - 1][1] + BUFFER) overlaps++;
  }
  check("no overlapping cleaner bookings (incl. 30-min travel buffer)", overlaps === 0, overlaps);
  const outside = assigned.filter((b) => {
    const c = byId.get(String(b.assignedWorker));
    const w = c.availability.find((a) => a.weekday === isoWeekday(b.preferredDate));
    const end = toMin(b.slot) + (b.estimate?.durationMinutes ?? 120);
    const holiday = (c.holidays ?? []).some((h) => b.preferredDate >= h.from && b.preferredDate <= h.to);
    return !w || toMin(b.slot) < toMin(w.start) || end > toMin(w.end) || holiday;
  });
  check("every booking inside the cleaner's working hours and outside holidays", outside.length === 0, outside.length);
  const upcoming = assigned.filter((b) => b.status === "confirmed");
  const windows = await AvailabilitySlot.find({ _id: { $in: [...new Set(upcoming.map((b) => String(b.availabilitySlot)))] } }).lean();
  const winById = new Map(windows.map((w) => [String(w._id), w]));
  check("upcoming bookings sit inside an active availability window",
    upcoming.every((b) => {
      const w = winById.get(String(b.availabilitySlot));
      return w && w.active && dayKey(w.date) === dayKey(b.preferredDate) && toMin(b.slot) >= toMin(w.startTime) && toMin(b.slotEnd) <= toMin(w.endTime);
    }));
  check("window counters match their bookings", windows.every((w) => w.booked === upcoming.filter((b) => String(b.availabilitySlot) === String(w._id)).length));
  const realWindowDays = new Set((await AvailabilitySlot.find({ testData: { $exists: false } }).select("date").lean()).map((w) => dayKey(w.date)));
  check("your own availability days stay free of dummy bookings", upcoming.every((b) => !realWindowDays.has(dayKey(b.preferredDate))));

  console.log("\nREVIEWS & TIERS");
  const reviews = await Review.find({ testData: TAG }).select("booking worker rating hidden dispute").lean();
  const bookingById = new Map(bookings.map((b) => [String(b._id), b]));
  check("only completed bookings have reviews", reviews.every((r) => bookingById.get(String(r.booking))?.status === "completed"), reviews.length);
  check("max one review per booking", new Set(reviews.map((r) => String(r.booking))).size === reviews.length);
  check("ratings between 3 and 5", reviews.every((r) => r.rating >= 3 && r.rating <= 5));
  const tierDist = {};
  const bands = { excellent: [4.9, 5], very_good: [4.7, 4.8999], good: [4.5, 4.6999], average: [4.3, 4.4999] };
  for (const c of approvedActive) {
    const def = CLEANERS.find((d) => d.cat === "approved" && byId.get(String(c._id))?.email.endsWith(`.${String(CLEANERS.indexOf(d) + 1).padStart(2, "0")}@${EMAIL_DOMAIN}`));
    const counters = await commissionCounters(c._id);
    const tier = tierForCounters(counters);
    tierDist[tier.key] = (tierDist[tier.key] ?? 0) + 1;
    const mine = reviews.filter((r) => String(r.worker) === String(c._id) && !r.hidden);
    const avg = mine.length ? mine.reduce((s, r) => s + r.rating, 0) / mine.length : null;
    const bandOk = !def || def.band === "new" || (avg >= bands[def.band][0] && avg <= bands[def.band][1] + 1e-9);
    check(
      `${c.name}: ${counters.jobsCompleted} jobs, ${counters.verifiedReviews} reviews, Ø ${avg?.toFixed(2) ?? "–"} → ${tier.key} ${tier.commissionPct} %`,
      (!def || tier.key === def.expect) && bandOk && c.workerCommission?.tierKey === tier.key && Math.abs((avg ?? 0) - (counters.ratingAvg ?? 0)) < 1e-9,
      def ? `expected ${def.expect}` : ""
    );
  }
  check("every commission level represented", ["new", "bronze", "silver", "gold", "platinum", "diamond"].every((k) => tierDist[k]), JSON.stringify(tierDist));
  const newCleaners = cleaners.filter((c) => {
    const n = reviews.filter((r) => String(r.worker) === String(c._id)).length;
    return n < 8;
  });
  check("9 cleaners with insufficient review history (< 8)", newCleaners.length === 9, newCleaners.length);

  {
    console.log("\nPAYMENTS & MONEY");
    const payments = await Payment.find({ testData: TAG }).lean();
    check("all payment references are TEST/cash test records",
      payments.every((p) => p.checkoutSessionId.startsWith("TEST-") || p.checkoutSessionId.startsWith("cash-")), payments.length);
    check("no duplicate transactions", new Set(payments.map((p) => p.checkoutSessionId)).size === payments.length);
    const paidBookings = bookings.filter((b) => b.payment?.status === "paid");
    const payByBooking = new Map(payments.map((p) => [String(p.booking), p]));
    check("every paid booking has a matching payment record with the same amount",
      paidBookings.every((b) => payByBooking.get(String(b._id))?.amountCents === b.pricing.totalCents && b.payment.amountCents === b.pricing.totalCents));
    check("refunded bookings have refunded payments", bookings.filter((b) => b.payment?.status === "refunded").every((b) => payByBooking.get(String(b._id))?.status === "refunded"));
    const done = bookings.filter((b) => b.status === "completed");
    check("pricing: total = price − discount, VAT contained",
      bookings.every((b) => b.pricing.totalCents === b.pricing.priceCents - b.pricing.promotionDiscountCents && b.pricing.vatCents === vatContained(b.pricing.totalCents, b.pricing.vatRate)));
    check("earnings: pay + commission = gross; commission = gross × tier %",
      done.every((b) => {
        const p = b.workerPayout;
        return p.amountCents + p.commissionCents === p.grossCents && p.grossCents === b.pricing.totalCents &&
          (p.basis !== "commission" || p.commissionCents === Math.round((p.grossCents * p.commissionPct) / 100));
      }));
    const payouts = await Payout.find({ testData: TAG }).lean();
    check("payout amounts = Σ net (pay − cash held) of their jobs",
      payouts.every((po) => po.amountCents === po.bookings.reduce((s, id) => {
        const b = bookingById.get(String(id));
        return s + b.workerPayout.amountCents - (b.workerPayout.cashHeldCents ?? 0);
      }, 0)));
    check("paid earnings ↔ payout record", done.every((b) => (b.workerPayout.status === "paid") === Boolean(b.workerPayout.payout)));
    const revenue = done.reduce((s, b) => s + b.pricing.totalCents, 0);
    const commission = done.reduce((s, b) => s + b.workerPayout.commissionCents, 0);
    const earnings = done.reduce((s, b) => s + b.workerPayout.amountCents, 0);
    const now = new Date();
    const dueOpen = done.filter((b) => b.workerPayout.status === "pending" && b.workerPayout.dueAt <= now);
    const waiting = done.filter((b) => b.workerPayout.status === "pending" && b.workerPayout.dueAt > now);
    console.log(`\n  Revenue (completed, incl. VAT): ${fmtEuro(revenue)}`);
    console.log(`  Fiduxa commission:              ${fmtEuro(commission)}`);
    console.log(`  Cleaner earnings:               ${fmtEuro(earnings)}`);
    console.log(`  Payout status: paid ${done.filter((b) => b.workerPayout.status === "paid").length} · due ${dueOpen.length} · waiting ${waiting.length} · on hold ${done.filter((b) => b.workerPayout.status === "on_hold").length} jobs; ${payouts.length} payout records`);
    console.log(`  Payments: ${payments.length} records (${payments.filter((p) => p.status === "paid").length} paid, ${payments.filter((p) => p.status === "refunded").length} refunded)`);
  }

  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${failed ? `✘ ${failed} check(s) FAILED` : `✔ All ${results.length} checks passed`}`);
  return failed;
};

// ---------------------------------------------------------------------------
// CLEAN – removes ONLY records tagged with TAG
// ---------------------------------------------------------------------------
const clean = async () => {
  const testUsers = await User.find({ testData: TAG }).select("_id").lean();
  const testWindows = await AvailabilitySlot.find({ testData: TAG }).select("_id").lean();
  // Never delete a window that a real booking now references
  const usedByReal = await Booking.distinct("availabilitySlot", { availabilitySlot: { $in: testWindows.map((w) => w._id) }, testData: { $exists: false } });
  const removed = {
    bookings: (await Booking.deleteMany({ testData: TAG })).deletedCount,
    reviews: (await Review.deleteMany({ testData: TAG })).deletedCount,
    payments: (await Payment.deleteMany({ testData: TAG })).deletedCount,
    payouts: (await Payout.deleteMany({ testData: TAG })).deletedCount,
    redemptions: (await PromotionRedemption.deleteMany({ testData: TAG })).deletedCount,
    promotions: (await Promotion.deleteMany({ testData: TAG })).deletedCount,
    windows: (await AvailabilitySlot.deleteMany({ testData: TAG, _id: { $nin: usedByReal } })).deletedCount,
    auditLogs: (await AuditLog.deleteMany({ entityId: { $in: testUsers.map((u) => u._id) } })).deletedCount,
    users: (await User.deleteMany({ testData: TAG })).deletedCount,
  };
  console.log("Removed dummy records:", removed);
  if (usedByReal.length) console.log(`Kept ${usedByReal.length} test window(s) that real bookings use (untagged them).`);
  if (usedByReal.length) await AvailabilitySlot.updateMany({ _id: { $in: usedByReal } }, { $unset: { testData: 1 } });
};

// ---------------------------------------------------------------------------
const main = async () => {
  const [cmd = "generate", ...flags] = process.argv.slice(2);
  await mongoose.connect(process.env.MONGODB_URI);
  const dbName = mongoose.connection.db.databaseName;
  assertSafeTarget(dbName);
  console.log(`Database: ${dbName}`);
  let exitCode = 0;
  if (cmd === "generate") {
    const existing = await User.countDocuments({ testData: TAG });
    if (existing && !flags.includes("--reset")) {
      console.log(`Dummy dataset already present (${existing} users) – nothing created. Use --reset to rebuild. Verifying instead:`);
      exitCode = await verify();
    } else {
      if (existing) await clean();
      await generate();
      exitCode = await verify();
    }
  } else if (cmd === "verify") {
    exitCode = await verify({ section: flags.includes("--cleaners") ? "cleaners" : undefined });
  } else if (cmd === "clean") {
    await clean();
  } else {
    console.log("Usage: node src/scripts/seed-dummy.js generate [--reset] | verify [--cleaners] | clean");
  }
  await mongoose.disconnect();
  process.exit(exitCode ? 1 : 0);
};

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
