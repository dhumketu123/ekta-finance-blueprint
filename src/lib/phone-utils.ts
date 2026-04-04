/**
 * Central phone normalization utility for Ekta Finance
 * Converts Bengali digits, strips non-numeric chars, normalizes to 880XXXXXXXXXX format
 */

/** Convert Bengali digits (০-৯) to ASCII (0-9) */
export function normalizeBnDigits(raw: string): string {
  return raw.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));
}

/**
 * Normalize any Bangladeshi phone number to international format: "880XXXXXXXXXX"
 * Handles Bengali digits, +88 prefix, leading 0, etc.
 * Returns empty string if invalid.
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const raw = normalizeBnDigits(phone).replace(/[^\d]/g, "");
  const last10 = raw.slice(-10);
  return last10.length === 10 ? "880" + last10 : "";
}

/**
 * Build international phone with + prefix for sms: intent
 * e.g. "+880XXXXXXXXXX"
 */
export function toIntlPhone(phone: string | null | undefined): string {
  const norm = normalizePhone(phone);
  return norm ? `+${norm}` : "";
}

/**
 * Build WhatsApp wa.me URL
 */
export function buildWhatsAppUrl(phone: string, message: string): string {
  const norm = normalizePhone(phone);
  return norm
    ? `https://wa.me/${norm}?text=${encodeURIComponent(message)}`
    : "";
}

/**
 * Build SMS intent URI
 */
export function buildSmsUrl(phone: string, message: string): string {
  const intl = toIntlPhone(phone);
  return intl
    ? `sms:${intl}?body=${encodeURIComponent(message)}`
    : "";
}
