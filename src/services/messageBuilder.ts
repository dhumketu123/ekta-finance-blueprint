/**
 * Central Message Builder — Ekta Finance
 * All receipt/notification messages are generated from this single source.
 * Every message includes receipt_number for audit traceability.
 */

import { formatLocalDate } from "@/lib/date-utils";

const SIGN = "— একতা ফাইন্যান্স";

/* ═══════════════════════════════════════════
   RECEIPT MESSAGE TYPES
   ═══════════════════════════════════════════ */

export interface LoanPaymentReceiptInput {
  type: "loan_payment";
  clientName: string;
  receiptNumber: string;
  totalPayment: number;
  dpsCollected?: number;
  newOutstanding: number;
  loanClosed: boolean;
  nextDueDate?: string | null;
  installmentDay?: number | null;
  pointsEarned?: number;
  currentScore?: number;
}

export interface LoanDisbursementReceiptInput {
  type: "loan_disbursement";
  clientName: string;
  receiptNumber: string;
  loanRef: string;
  principal: number;
  emiAmount: number;
  maturityDate: string;
  nextDueDate?: string | null;
}

export interface SavingsReceiptInput {
  type: "savings_deposit" | "savings_withdrawal";
  clientName: string;
  receiptNumber: string;
  amount: number;
  newBalance: number;
  targetRemaining?: number;
}

export interface InvestorDividendReceiptInput {
  type: "investor_dividend";
  investorName: string;
  receiptNumber: string;
  amount: number;
  isReinvest: boolean;
  totalCapital: number;
  currentCapital: number;
}

export interface InvestorWithdrawalReceiptInput {
  type: "investor_withdrawal";
  investorName: string;
  receiptNumber: string;
  amount: number;
  remainingCapital: number;
}

export interface InvestorCapitalReceiptInput {
  type: "investor_capital";
  investorName: string;
  receiptNumber: string;
  amount: number;
  totalCapital: number;
}

export interface InvestorWeeklyShareReceiptInput {
  type: "investor_weekly_share";
  investorName: string;
  receiptNumber: string;
  amount: number;
  totalPaid: number;
}

export type ReceiptInput =
  | LoanPaymentReceiptInput
  | LoanDisbursementReceiptInput
  | SavingsReceiptInput
  | InvestorDividendReceiptInput
  | InvestorWithdrawalReceiptInput
  | InvestorCapitalReceiptInput
  | InvestorWeeklyShareReceiptInput;

/* ═══════════════════════════════════════════
   DATE FORMATTER (compact dd/MM/yyyy)
   ═══════════════════════════════════════════ */

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return formatLocalDate(dateStr, "bn");
  } catch {
    return "";
  }
}

/**
 * ⚠️ SINGLE SOURCE OF TRUTH — All installment date calculations MUST use this function.
 * Compute next installment date anchored to loan's installment_day.
 * Prevents date drift across months (handles 31st → shorter months).
 * Returns null for invalid anchor days.
 */
export function computeAnchoredNextInstallment(
  anchorDay: number,
  referenceDate?: Date,
): Date | null {
  // Defensive guard — reject invalid anchor days
  if (!anchorDay || anchorDay < 1 || anchorDay > 31) {
    return null;
  }

  const now = referenceDate ?? new Date();
  // Normalize to midnight — prevents timezone-induced day boundary drift
  now.setHours(0, 0, 0, 0);

  if (process.env.NODE_ENV !== "production") {
    console.log("Installment Anchor Day:", anchorDay);
  }

  const currentDay = now.getDate();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let targetMonth: number;
  let targetYear: number;

  if (currentDay < anchorDay) {
    // Still before anchor day this month → use this month
    targetMonth = currentMonth;
    targetYear = currentYear;
  } else {
    // At or past anchor day → next month
    targetMonth = currentMonth + 1;
    targetYear = currentYear;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
  }

  // Clamp anchorDay to max days in target month (handles 31→28/29/30)
  const maxDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const safeDay = Math.min(anchorDay, maxDay);

  return new Date(targetYear, targetMonth, safeDay);
}

/**
 * Format date in Bengali locale: ১৪ এপ্রিল ২০২৬
 * ⚠️ DO NOT use English locale fallback. Bengali only.
 */
export function formatBengaliDate(date: Date): string {
  return new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/**
 * ⚠️ FROZEN FORMAT — Single source for installment line in SMS/receipt.
 * Do NOT duplicate this formatting elsewhere.
 */
export function formatInstallmentLine(date: Date | null): string {
  if (!date) return "";
  const formatted = new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  return `(আগামী কিস্তি: ${formatted})`;
}

function tk(n: number): string {
  return `৳${n.toLocaleString()}`;
}

/* ═══════════════════════════════════════════
   MAIN BUILDER
   ═══════════════════════════════════════════ */

export function buildReceiptMessage(input: ReceiptInput): string {
  const ref = `Ref: ${input.receiptNumber}`;

  switch (input.type) {
    case "loan_payment": {
      const { clientName, totalPayment, dpsCollected, newOutstanding, loanClosed, nextDueDate, installmentDay, pointsEarned, currentScore } = input;
      const dps = dpsCollected ?? 0;
      const loanPaid = totalPayment;
      const total = dps + loanPaid;
      const dpsLine = dps > 0 ? `\nসঞ্চয়: ${tk(dps)} ঋণ: ${tk(loanPaid)}` : "";
      const pointsLine = pointsEarned && pointsEarned !== 0
        ? `\nট্রাস্ট: ${pointsEarned > 0 ? "+" : ""}${pointsEarned} (${currentScore ?? 0})`
        : "";

      // ⚠️ LOCKED PIPELINE — NO FAKE ANCHOR ALLOWED
      // ✔ Only loan.anchor_day / installmentDay permitted
      // ❌ NO new Date().getDate() fallback. NO synthetic anchor.
      let nextLine = "";
      if (!loanClosed) {
        const baseAnchorDay = (installmentDay && installmentDay > 0) ? installmentDay : null;

        if (baseAnchorDay) {
          const nextDate = computeAnchoredNextInstallment(baseAnchorDay);
          nextLine = `\n${formatInstallmentLine(nextDate)}`;
        } else {
          // 🛑 No anchor exists — show explicit safe message, never guess
          nextLine = "\n(আগামী কিস্তির তারিখ নির্ধারণ করা হয়নি)";
        }
      }

      return loanClosed
        ? `সম্মানিত ${clientName},\nআপনার ঋণ সম্পূর্ণ পরিশোধিত ✅${dpsLine}\nমোট: ${tk(total)}${pointsLine}\n${ref}\n${SIGN}`
        : `সম্মানিত ${clientName},\nকিস্তি জমা হয়েছে ✅${dpsLine}\nমোট: ${tk(total)} বকেয়া: ${tk(newOutstanding)}${pointsLine}${nextLine}\n${ref}\n${SIGN}`;
    }

    case "loan_disbursement": {
      const { clientName, loanRef, principal, emiAmount, maturityDate, nextDueDate } = input;
      const nextStr = fmtDate(nextDueDate);
      return `সম্মানিত ${clientName},\nঋণ বিতরণ ✅ নং: ${loanRef}\nআসল: ${tk(principal)} কিস্তি: ${tk(emiAmount)}\nমেয়াদ: ${fmtDate(maturityDate)}${nextStr ? `\nপ্রথম কিস্তির তারিখ: ${nextStr}` : ""}\n${ref}\n${SIGN}`;
    }

    case "savings_deposit": {
      const { clientName, amount, newBalance, targetRemaining } = input;
      return `সম্মানিত ${clientName},\nসঞ্চয় জমা ✅ ${tk(amount)}\nমোট: ${tk(newBalance)}${targetRemaining && targetRemaining > 0 ? ` বাকি: ${tk(targetRemaining)}` : ""}\n${ref}\n${SIGN}`;
    }

    case "savings_withdrawal": {
      const { clientName, amount, newBalance } = input;
      return `সম্মানিত ${clientName},\nসঞ্চয় উত্তোলন ✅ ${tk(amount)}\nব্যালেন্স: ${tk(newBalance)}\n${ref}\n${SIGN}`;
    }

    case "investor_dividend": {
      const { investorName, amount, isReinvest, totalCapital, currentCapital } = input;
      return isReinvest
        ? `সম্মানিত ${investorName},\nলভ্যাংশ ${tk(amount)} পুনঃবিনিয়োগ ✅\nমোট মূলধন: ${tk(totalCapital)}\n${ref}\n${SIGN}`
        : `সম্মানিত ${investorName},\nলভ্যাংশ ${tk(amount)} প্রদান ✅\nমূলধন: ${tk(currentCapital)}\n${ref}\n${SIGN}`;
    }

    case "investor_withdrawal": {
      const { investorName, amount, remainingCapital } = input;
      return `সম্মানিত ${investorName},\nমূলধন উত্তোলন ✅ ${tk(amount)}\nঅবশিষ্ট: ${tk(remainingCapital)}\n${ref}\n${SIGN}`;
    }

    case "investor_capital": {
      const { investorName, amount, totalCapital } = input;
      return `সম্মানিত ${investorName},\nমূলধন জমা ✅ ${tk(amount)}\nমোট: ${tk(totalCapital)}\n${ref}\n${SIGN}`;
    }

    case "investor_weekly_share": {
      const { investorName, amount, totalPaid } = input;
      return `সম্মানিত ${investorName},\nশেয়ার জমা ✅ ${tk(amount)}\nমোট: ${tk(totalPaid)}\n${ref}\n${SIGN}`;
    }

    default:
      return "";
  }
}
