// Cleaner reliability rules: strikes for late hand-backs and no-shows.
// RELIABILITY.strikeLimit strikes within RELIABILITY.strikeWindowDays pause the
// cleaner (workerStatus stays "approved", reliability.pausedAt is set) until an
// admin lifts the pause. Paused cleaners see no open jobs and get no offers.
import nodemailer from "nodemailer";

import User from "../models/user.model.js";
import { RELIABILITY } from "../config/pricing.js";
import { DAY_MS, escapeHtml } from "../utils/helpers.js";
import { recordAudit } from "./audit.service.js";
import { trySend } from "./email.service.js";

const STRIKES_FOR = { late_release: () => RELIABILITY.strikesPerLateRelease ?? 1, no_show: () => RELIABILITY.strikesPerNoShow ?? 2, other: () => 1 };

/** Strikes that still count (inside the rolling window) */
export const activeStrikes = (user, now = Date.now()) => {
  const since = now - RELIABILITY.strikeWindowDays * DAY_MS;
  return (user?.reliability?.strikes ?? []).filter((s) => new Date(s.at).getTime() >= since);
};

export const isPaused = (user) => Boolean(user?.reliability?.pausedAt);

/** Published rules (shown to cleaners and admins) */
export const reliabilityRules = () => ({
  lateReleaseHours: RELIABILITY.lateReleaseHours,
  strikeLimit: RELIABILITY.strikeLimit,
  strikeWindowDays: RELIABILITY.strikeWindowDays,
  strikesPerLateRelease: RELIABILITY.strikesPerLateRelease ?? 1,
  strikesPerNoShow: RELIABILITY.strikesPerNoShow ?? 2,
});

/** What the cleaner / admin sees */
export const reliabilityView = (user) => {
  const active = activeStrikes(user);
  return {
    strikes: (user?.reliability?.strikes ?? [])
      .map((s) => ({ id: s._id, at: s.at, kind: s.kind, bookingRef: s.bookingRef ?? "", note: s.note ?? "", active: active.includes(s) }))
      .sort((a, b) => new Date(b.at) - new Date(a.at)),
    activeCount: active.reduce((n) => n + 1, 0),
    pausedAt: user?.reliability?.pausedAt ?? null,
    pausedReason: user?.reliability?.pausedReason ?? "",
    rules: reliabilityRules(),
  };
};

// ---------------------------------------------------------------------------
// Cleaner email (own minimal transport – same rules as email.service.js:
// JSON transport in tests, SMTP otherwise; never throws into the caller)
// ---------------------------------------------------------------------------
const transporter = () => {
  if (process.env.NODE_ENV === "test" && process.env.EMAIL_TRANSPORT === "json") return nodemailer.createTransport({ jsonTransport: true });
  const missing = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing email configuration: ${missing.join(", ")}`);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
};

const STRIKE_TEXT = {
  de: {
    subject: (paused) => (paused ? "Dein Konto wurde vorübergehend pausiert" : "Hinweis zu deiner Zuverlässigkeit"),
    hello: (n) => `Hallo ${n},`,
    kind: { late_release: "kurzfristige Rückgabe eines Auftrags (unter 24 Stunden vor Beginn)", no_show: "Nichterscheinen bei einem Auftrag", other: "Verstoß gegen die Zuverlässigkeitsregeln" },
    body: (kind, count, ref) => `wir haben ${count === 1 ? "einen Strike" : `${count} Strikes`} wegen ${kind}${ref ? ` (Auftrag ${ref})` : ""} vermerkt.`,
    status: (active, limit, days) => `Aktive Strikes: ${active} von ${limit} (Zeitraum: ${days} Tage).`,
    paused: "Da die Grenze erreicht ist, wurde dein Konto für neue Aufträge pausiert. Bitte melde dich im Büro, damit wir das gemeinsam klären.",
    warn: (left) => `Noch ${left} weitere${left === 1 ? "r Strike" : " Strikes"} und dein Konto wird automatisch pausiert.`,
    regards: "Viele Grüße\nDein Fiduxa Team",
  },
  en: {
    subject: (paused) => (paused ? "Your account has been paused" : "A note about your reliability"),
    hello: (n) => `Hello ${n},`,
    kind: { late_release: "handing a job back at short notice (less than 24 hours before the start)", no_show: "not showing up for a job", other: "a breach of the reliability rules" },
    body: (kind, count, ref) => `we have recorded ${count === 1 ? "one strike" : `${count} strikes`} for ${kind}${ref ? ` (job ${ref})` : ""}.`,
    status: (active, limit, days) => `Active strikes: ${active} of ${limit} (window: ${days} days).`,
    paused: "The limit has been reached, so your account is paused for new jobs. Please contact the office so we can sort this out together.",
    warn: (left) => `${left} more strike${left === 1 ? "" : "s"} and your account will be paused automatically.`,
    regards: "Kind regards\nYour Fiduxa team",
  },
  pl: {
    subject: (paused) => (paused ? "Twoje konto zostało tymczasowo wstrzymane" : "Uwaga dotycząca Twojej niezawodności"),
    hello: (n) => `Cześć ${n},`,
    kind: { late_release: "oddanie zlecenia w ostatniej chwili (mniej niż 24 godziny przed rozpoczęciem)", no_show: "niestawienie się na zlecenie", other: "naruszenie zasad niezawodności" },
    body: (kind, count, ref) => `odnotowaliśmy ${count === 1 ? "jeden strike" : `${count} strike'i`} za ${kind}${ref ? ` (zlecenie ${ref})` : ""}.`,
    status: (active, limit, days) => `Aktywne strike'i: ${active} z ${limit} (okres: ${days} dni).`,
    paused: "Limit został osiągnięty, dlatego Twoje konto zostało wstrzymane dla nowych zleceń. Skontaktuj się z biurem, aby wspólnie to wyjaśnić.",
    warn: (left) => `Jeszcze ${left} i Twoje konto zostanie automatycznie wstrzymane.`,
    regards: "Pozdrawiamy\nZespół Fiduxa",
  },
};

export const sendStrikeEmail = async ({ worker, kind, count, active, paused }) => {
  const t = STRIKE_TEXT[worker.preferredLanguage] ?? STRIKE_TEXT.de;
  const limit = RELIABILITY.strikeLimit;
  const lines = [
    t.hello(worker.name),
    "",
    t.body(t.kind[kind] ?? t.kind.other, count, undefined),
    t.status(active, limit, RELIABILITY.strikeWindowDays),
    paused ? t.paused : t.warn(Math.max(0, limit - active)),
    "",
    t.regards,
  ];
  return transporter().sendMail({
    from: process.env.SMTP_FROM,
    to: worker.email,
    subject: `[Fiduxa] ${t.subject(paused)}`,
    text: lines.join("\n"),
    html: `<p>${lines.map((l) => escapeHtml(l).replace(/\n/g, "<br/>")).join("<br/>")}</p>`,
  });
};

/**
 * Add strikes to a cleaner and pause them when the limit is reached.
 * `user` may be a document or an id. Returns { strikes, activeCount, paused, justPaused }.
 */
export const addStrike = async (userOrId, { kind, bookingRef = "", note = "", count, actor = null } = {}) => {
  const user = typeof userOrId === "object" && userOrId?.save ? userOrId : await User.findById(userOrId);
  if (!user) return null;
  const n = Math.max(1, count ?? STRIKES_FOR[kind]?.() ?? 1);
  const now = new Date();
  if (!user.reliability) user.reliability = { strikes: [] };
  for (let i = 0; i < n; i++) user.reliability.strikes.push({ at: now, kind, bookingRef, note });
  const active = activeStrikes(user, now.getTime()).length;
  let justPaused = false;
  if (active >= RELIABILITY.strikeLimit && !user.reliability.pausedAt) {
    user.reliability.pausedAt = now;
    user.reliability.pausedReason = `${active} strikes in ${RELIABILITY.strikeWindowDays} days`;
    justPaused = true;
  }
  await user.save();
  await recordAudit({
    actor,
    action: justPaused ? "worker.paused" : "worker.strike",
    entityType: "User",
    entityId: user._id,
    after: { kind, count: n, bookingRef, note, activeStrikes: active, paused: Boolean(user.reliability.pausedAt) },
  });
  await trySend("Reliability strike", () => sendStrikeEmail({ worker: user, kind, count: n, active, paused: Boolean(user.reliability.pausedAt) }));
  return { strikes: n, activeCount: active, paused: Boolean(user.reliability.pausedAt), justPaused };
};

/** Admin lifts the pause (strikes stay in the history) */
export const unpauseWorker = async (user, { actor, note = "" } = {}) => {
  const before = { pausedAt: user.reliability?.pausedAt ?? null };
  user.set("reliability.pausedAt", null);
  user.set("reliability.pausedReason", "");
  await user.save();
  await recordAudit({ actor, action: "worker.unpaused", entityType: "User", entityId: user._id, before, after: { note } });
  return reliabilityView(user);
};
