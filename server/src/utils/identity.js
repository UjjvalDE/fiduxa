// Normalised identity markers used to stop the welcome offer being claimed
// again with a second account (same phone, same mailbox, same address).

/** "Max.Muster+promo@gmail.com" → "maxmuster@gmail.com" */
export const normEmail = (email) => {
  const [local = "", domain = ""] = String(email || "").trim().toLowerCase().split("@");
  let user = local.split("+")[0];
  const d = domain === "googlemail.com" ? "gmail.com" : domain;
  if (d === "gmail.com") user = user.replace(/\./g, "");
  return user && d ? `${user}@${d}` : "";
};

/** "+49 (030) 123-456" / "0049 30 123456" / "030 123456" → "030123456" */
export const normPhone = (phone) => {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("0049")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("49") && digits.length > 10) digits = `0${digits.slice(2)}`;
  return digits.length >= 6 ? digits : "";
};

/** "Invalidenstraße 5a" + "10115" → "invalidenstr5a|10115" */
export const normAddress = (address, postcode) => {
  const street = String(address || "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/strasse|straße|str\./g, "str")
    .replace(/[^a-z0-9äöü]/g, "");
  return street && postcode ? `${street}|${String(postcode).trim()}` : "";
};

export const fingerprintOf = ({ email, phone, address, postcode }) => ({
  email: normEmail(email),
  phone: normPhone(phone),
  address: normAddress(address, postcode),
});
