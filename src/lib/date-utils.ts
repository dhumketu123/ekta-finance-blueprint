/**
 * Bengali/English date formatting utility
 * Format: ২১ মার্চ ২০২৬ or 21 March 2026
 */

const BN_MONTHS: Record<number, string> = {
  0: "জানুয়ারি", 1: "ফেব্রুয়ারি", 2: "মার্চ", 3: "এপ্রিল",
  4: "মে", 5: "জুন", 6: "জুলাই", 7: "আগস্ট",
  8: "সেপ্টেম্বর", 9: "অক্টোবর", 10: "নভেম্বর", 11: "ডিসেম্বর",
};

const EN_MONTHS: Record<number, string> = {
  0: "January", 1: "February", 2: "March", 3: "April",
  4: "May", 5: "June", 6: "July", 7: "August",
  8: "September", 9: "October", 10: "November", 11: "December",
};

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

function toBengaliDigits(num: number | string): string {
  return String(num).replace(/[0-9]/g, (d) => BN_DIGITS[parseInt(d)]);
}

/**
 * Format a date string or Date object to localized format
 * @param dateInput - ISO string (YYYY-MM-DD or full ISO) or Date object
 * @param lang - "bn" for Bengali, "en" for English
 * @param options - { short: true } for short month names
 * @returns Formatted date string like "২১ মার্চ ২০২৬" or "21 March 2026"
 */
export function formatLocalDate(
  dateInput: string | Date | null | undefined,
  lang: string = "en",
  options?: { short?: boolean }
): string {
  if (!dateInput) return "—";

  let date: Date;
  if (typeof dateInput === "string") {
    // Handle YYYY-MM-DD (treat as local date, not UTC)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      const [y, m, d] = dateInput.split("-").map(Number);
      date = new Date(y, m - 1, d);
    } else {
      date = new Date(dateInput);
    }
  } else {
    date = dateInput;
  }

  if (isNaN(date.getTime())) return "—";

  const day = date.getDate();
  const monthIdx = date.getMonth();
  const year = date.getFullYear();
  const bn = lang === "bn";

  if (options?.short) {
    const shortMonths = bn
      ? ["জানু", "ফেব্রু", "মার্চ", "এপ্রি", "মে", "জুন", "জুলা", "আগ", "সেপ্টে", "অক্টো", "নভে", "ডিসে"]
      : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return bn
      ? `${toBengaliDigits(day)} ${shortMonths[monthIdx]} ${toBengaliDigits(year)}`
      : `${day} ${shortMonths[monthIdx]} ${year}`;
  }

  if (bn) {
    return `${toBengaliDigits(day)} ${BN_MONTHS[monthIdx]} ${toBengaliDigits(year)}`;
  }
  return `${day} ${EN_MONTHS[monthIdx]} ${year}`;
}

/**
 * Format a datetime to short date for tables/lists
 * Example: "২১ মার্চ '২৬" or "21 Mar '26"
 */
export function formatShortDate(
  dateInput: string | Date | null | undefined,
  lang: string = "en"
): string {
  if (!dateInput) return "—";
  
  let date: Date;
  if (typeof dateInput === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      const [y, m, d] = dateInput.split("-").map(Number);
      date = new Date(y, m - 1, d);
    } else {
      date = new Date(dateInput);
    }
  } else {
    date = dateInput;
  }

  if (isNaN(date.getTime())) return "—";

  const day = date.getDate();
  const monthIdx = date.getMonth();
  const year = String(date.getFullYear()).slice(-2);
  const bn = lang === "bn";

  const shortMonths = bn
    ? ["জানু", "ফেব্রু", "মার্চ", "এপ্রি", "মে", "জুন", "জুলা", "আগ", "সেপ্টে", "অক্টো", "নভে", "ডিসে"]
    : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return bn
    ? `${toBengaliDigits(day)} ${shortMonths[monthIdx]} '${toBengaliDigits(year)}`
    : `${day} ${shortMonths[monthIdx]} '${year}`;
}
