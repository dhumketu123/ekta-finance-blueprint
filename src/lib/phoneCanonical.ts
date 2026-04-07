/**
 * Canonical phone normalization for Bangladesh mobile numbers.
 * Converts +880/880 prefixes to local 01x format.
 * Returns null if input is missing or invalid.
 */
export function canonicalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  let phone = raw.replace(/[^\d+]/g, "");
  if (phone.startsWith("+880")) {
    phone = "0" + phone.slice(4);
  }
  if (phone.startsWith("880")) {
    phone = "0" + phone.slice(3);
  }
  if (!/^01\d{9}$/.test(phone)) {
    return null;
  }
  return phone;
}
