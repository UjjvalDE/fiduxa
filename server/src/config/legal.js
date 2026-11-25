// Versions of the legal texts a customer accepts (AGB /agb, Datenschutz
// /datenschutz). Bump when the published text changes materially; the
// accepted version is stored per user (user.legalConsent).
export const LEGAL_VERSIONS = {
  terms: "2026-11",
  privacy: "2026-11",
};

// Phone numbers: digits, spaces, + ( ) / - ; 6–15 digits in total
export const PHONE_REGEX = /^\+?[0-9 ()/-]{5,30}$/;
export const isValidPhone = (value) => {
  if (typeof value !== "string" || !PHONE_REGEX.test(value.trim())) return false;
  const digits = value.replace(/\D/g, "").length;
  return digits >= 6 && digits <= 15;
};
