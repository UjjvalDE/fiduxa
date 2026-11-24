import { OPERATIONS } from "../config/pricing.js";

// ---------- HTML ----------
export const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// ---------- Errors ----------
export const httpError = (statusCode, message, details) =>
  Object.assign(new Error(message), {
    statusCode,
    ...(details && { details }),
  });

// ---------- Pagination / search ----------
export const getPagination = (
  query,
  { defaultLimit = 10, maxLimit = 50 } = {}
) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number(query.limit) || defaultLimit)
  );
  return { page, limit, skip: (page - 1) * limit };
};

export const paginationMeta = ({ page, limit }, total) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit),
});

// Escape user input before using it inside a RegExp search
export const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- Dates ----------
// Booking dates are calendar days stored as UTC midnight.
// Slot times are interpreted in Europe/Berlin.

export const parseCalendarDate = (value) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
    );
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
  return Number.isNaN(date.getTime()) ? null : date;
};

export const DAY_MS = 24 * 60 * 60 * 1000;

export const todayInBerlin = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATIONS.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parseCalendarDate(parts);
};

const LEGACY_SLOT_START = { morning: "08:00", afternoon: "13:00" };

/** "HH:MM" start of a booking slot (handles legacy morning/afternoon values) */
export const slotStartTime = (slot) => LEGACY_SLOT_START[slot] ?? slot ?? "08:00";

/** Human label for a slot: "08:00–10:00" or "ab 08:00" */
export const slotLabel = (start, end) => {
  const legacy = { morning: "08:00–12:00", afternoon: "13:00–17:00" };
  if (legacy[start]) return legacy[start];
  return end ? `${start}–${end}` : start;
};

// Real instant when a slot starts in Berlin (handles CET/CEST automatically)
export const slotStartInstant = (date, slot) => {
  const day = parseCalendarDate(date);
  const [hours, minutes] = slotStartTime(slot).split(":").map(Number);

  const noonUtc = new Date(day.getTime() + 12 * 60 * 60 * 1000);
  const berlinHourAtNoonUtc = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: OPERATIONS.timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(noonUtc)
  );
  const offsetHours = berlinHourAtNoonUtc - 12;

  return new Date(
    day.getTime() + (hours - offsetHours) * 60 * 60 * 1000 + (minutes || 0) * 60 * 1000
  );
};

export const formatGermanDate = (date) =>
  new Date(date).toLocaleDateString("de-DE", { timeZone: "UTC" });
