/**
 * Central Message Builder — Ekta Finance
 * All receipt/notification messages are generated from this single source.
 * Every message includes receipt_number for audit traceability.
 */

import { format } from "date-fns";

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
    return format(new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : "")), "dd/MM/yyyy");
  } catch {
    return "";
  }
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
      const { clientName, totalPayment, dpsCollected, newOutstanding, loanClosed, nextDueDate, pointsEarned, currentScore } = input;
      const dps = dpsCollected ?? 0;
      const loanPaid = totalPayment;
      const total = dps + loanPaid;
      const dpsLine = dps > 0 ? `\nসঞ্চয়: ${tk(dps)} ঋণ: ${tk(loanPaid)}` : "";
      const pointsLine = pointsEarned && pointsEarned !== 0
        ? `\nট্রাস্ট: ${pointsEarned > 0 ? "+" : ""}${pointsEarned} (${currentScore ?? 0})`
        : "";
      const nextStr = fmtDate(nextDueDate);

      return loanClosed
        ? `সম্মানিত ${clientName},\nআপনার ঋণ সম্পূর্ণ পরিশোধিত ✅${dpsLine}\nমোট: ${tk(total)}${pointsLine}\n${ref}\n${SIGN}`
        : `সম্মানিত ${clientName},\nকিস্তি জমা হয়েছে ✅${dpsLine}\nমোট: ${tk(total)} বকেয়া: ${tk(newOutstanding)}${nextStr ? `\nআগামী কিস্তি: ${nextStr}` : ""}${pointsLine}\n${ref}\n${SIGN}`;
    }

    case "loan_disbursement": {
      const { clientName, loanRef, principal, emiAmount, maturityDate, nextDueDate } = input;
      const nextStr = fmtDate(nextDueDate);
      return `সম্মানিত ${clientName},\nঋণ বিতরণ ✅ নং: ${loanRef}\nআসল: ${tk(principal)} কিস্তি: ${tk(emiAmount)}\nমেয়াদ: ${fmtDate(maturityDate)}${nextStr ? ` প্রথম কিস্তি: ${nextStr}` : ""}\n${ref}\n${SIGN}`;
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
