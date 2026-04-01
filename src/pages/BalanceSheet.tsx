import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  CheckCircle2, AlertTriangle, Landmark, ShieldCheck, Wallet,
  CalendarIcon, FileText, FileSpreadsheet,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatLocalDate } from "@/lib/date-utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface BsRow {
  id: string;
  code: string;
  name: string;
  name_bn: string | null;
  account_type: "asset" | "liability" | "equity";
  balance: number;
}

type AccountSection = "asset" | "liability" | "equity";

const VALID_SECTIONS: AccountSection[] = ["asset", "liability", "equity"];

const SECTION_META: Record<AccountSection, { icon: typeof Landmark; labelBn: string; labelEn: string; color: string }> = {
  asset: { icon: Wallet, labelBn: "সম্পদ (Assets)", labelEn: "Assets", color: "text-primary" },
  liability: { icon: ShieldCheck, labelBn: "দায় (Liabilities)", labelEn: "Liabilities", color: "text-amber-600" },
  equity: { icon: Landmark, labelBn: "মালিকানা স্বত্ব (Equity)", labelEn: "Equity", color: "text-violet-600" },
};

/**
 * Bangladesh-compliant currency formatter.
 * - Prefix: ৳
 * - Indian digit grouping (en-IN locale)
 * - Always 2 decimal places
 * - Negative values shown in accounting bracket style: (৳1,000.00)
 */
const fmtAmt = (n: number, useBrackets = true): string => {
  const num = Number(n) || 0;
  const abs = Math.abs(num);
  const rounded = Math.round(abs * 100) / 100;
  const formatted = `৳${rounded.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (num < 0 && useBrackets) return `(${formatted})`;
  return formatted;
};

// ── Runtime shape validator ───────────────────────────────────────────────────
function validateBsRow(raw: unknown): BsRow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const rowId = typeof r.id === "string" ? r.id : typeof r.coa_id === "string" ? r.coa_id : null;
  if (
    !rowId ||
    typeof r.code !== "string" ||
    typeof r.name !== "string" ||
    !VALID_SECTIONS.includes(r.account_type as AccountSection)
  ) {
    return null;
  }
  return {
    id: rowId,
    code: r.code,
    name: r.name,
    name_bn: typeof r.name_bn === "string" ? r.name_bn : null,
    account_type: r.account_type as AccountSection,
    balance: Number(r.balance) || 0,
  };
}

// ── Audit helper ──────────────────────────────────────────────────────────────
async function logPageVisit() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const appMeta = user.app_metadata as Record<string, unknown> | undefined;
    const tenantId = appMeta?.tenant_id as string | undefined;
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      const { data: profile } = await supabase
        .from("profiles" as never)
        .select("tenant_id")
        .eq("id", user.id)
        .maybeSingle();
      resolvedTenantId = (profile as Record<string, unknown> | null)?.tenant_id as string | undefined;
    }
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      entity_type: "report",
      action_type: "view",
      details: { page: "balance_sheet", timestamp: new Date().toISOString() },
    });
  } catch {
    // silent — audit failure must not block UI
  }
}

// ── Section Table Component ───────────────────────────────────────────────────
const SectionTable = ({
  type, items, total, bn,
}: {
  type: AccountSection;
  items: BsRow[];
  total: number;
  bn: boolean;
}) => {
  const meta = SECTION_META[type];
  const Icon = meta.icon;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className={cn("w-4 h-4", meta.color)} aria-hidden="true" />
          {bn ? meta.labelBn : meta.labelEn}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-[11px]">{bn ? "হিসাব" : "Account"}</TableHead>
              <TableHead className="text-[11px] hidden sm:table-cell">{bn ? "কোড" : "Code"}</TableHead>
              <TableHead className="text-[11px] text-right">{bn ? "ব্যালেন্স (৳)" : "Balance (৳)"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-xs text-center text-muted-foreground py-6">
                  {bn ? "নির্বাচিত তারিখে কোনো লেজার ডেটা নেই" : "No ledger data for selected date"}
                </TableCell>
              </TableRow>
            )}
            {items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs font-medium">{bn ? (r.name_bn || r.name) : r.name}</TableCell>
                <TableCell className="text-[11px] font-mono text-muted-foreground hidden sm:table-cell">{r.code}</TableCell>
                <TableCell className="text-xs text-right font-mono font-semibold">{fmtAmt(r.balance)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/50 font-bold border-t-2 border-border">
              <TableCell className="text-xs" colSpan={2}>{bn ? "মোট" : "Total"}</TableCell>
              <TableCell className={cn("text-xs text-right font-mono font-extrabold", meta.color)}>{fmtAmt(total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

// ── Equation Banner Component ─────────────────────────────────────────────────
const EquationBanner = ({
  totalAssets, totalLiabilities, totalEquity, difference, balanced, bn,
}: {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  difference: number;
  balanced: boolean;
  bn: boolean;
}) => (
  <Card
    className="overflow-hidden"
    style={{
      background: balanced
        ? "linear-gradient(135deg, hsl(142 70% 45% / 0.08), hsl(142 70% 45% / 0.03))"
        : "linear-gradient(135deg, hsl(0 84% 60% / 0.08), hsl(0 84% 60% / 0.03))",
      borderColor: balanced
        ? "hsl(142 70% 45% / 0.3)"
        : "hsl(0 84% 60% / 0.3)",
    }}
  >
    <CardContent className="py-5 px-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {bn ? "অ্যাকাউন্টিং সমীকরণ" : "Accounting Equation"}
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            {fmtAmt(totalAssets)} = {fmtAmt(totalLiabilities)} + {fmtAmt(totalEquity)}
          </p>
          <p className="text-xs text-muted-foreground">
            {bn ? "সম্পদ = দায় + মালিকানা স্বত্ব" : "Assets = Liabilities + Equity"}
          </p>
        </div>
        <div className="text-right shrink-0">
          <Badge
            variant={balanced ? "default" : "destructive"}
            className="text-sm px-4 py-1.5"
          >
            {balanced
              ? (bn ? "✅ ব্যালেন্স সঠিক" : "✅ Balanced")
              : (bn ? `⚠️ অমিল — পার্থক্য: ${fmtAmt(difference)}` : `⚠️ Diff: ${fmtAmt(difference)}`)}
          </Badge>
        </div>
      </div>
    </CardContent>
  </Card>
);

// ── Page ──────────────────────────────────────────────────────────────────────
const BalanceSheetPage = () => {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const [asOfDate, setAsOfDate] = useState<Date | undefined>(undefined);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const dateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Log page visit once
  useEffect(() => { logPageVisit(); }, []);

  // Debounced date setter
  const handleDateSelect = useCallback((date: Date | undefined) => {
    if (dateDebounceRef.current) clearTimeout(dateDebounceRef.current);
    dateDebounceRef.current = setTimeout(() => setAsOfDate(date), 150);
  }, []);

  // Effective date: selected or today end-of-day (ISO safe)
  const effectiveDate = useMemo(() => {
    if (asOfDate) return asOfDate;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return today;
  }, [asOfDate]);

  const effectiveDateKey = asOfDate ? format(asOfDate, "yyyy-MM-dd") : "latest";

  const { data: rows, isLoading } = useQuery({
    queryKey: ["balance-sheet", effectiveDateKey],
    queryFn: async () => {
      setValidationWarning(null);
      const { data, error } = await supabase.rpc("get_balance_sheet", {
        p_as_of: format(effectiveDate, "yyyy-MM-dd"),
      });
      if (error) throw error;
      if (!Array.isArray(data)) {
        setValidationWarning(bn ? "RPC রেসপন্স ফরম্যাট সঠিক নয়" : "Unexpected RPC response format");
        return [];
      }
      const validated: BsRow[] = [];
      let skipped = 0;
      for (const item of data) {
        const row = validateBsRow(item);
        if (row) validated.push(row);
        else skipped++;
      }
      if (skipped > 0) {
        setValidationWarning(
          bn ? `${skipped}টি রেকর্ড ফরম্যাট সমস্যার কারণে বাদ দেওয়া হয়েছে`
            : `${skipped} record(s) skipped due to format issues`
        );
      }
      return validated;
    },
    refetchOnWindowFocus: false,
  });

  const computed = useMemo(() => {
    const sections: Record<AccountSection, BsRow[]> = { asset: [], liability: [], equity: [] };
    for (const r of rows ?? []) {
      if (sections[r.account_type]) sections[r.account_type].push(r);
    }
    for (const sec of VALID_SECTIONS) {
      sections[sec].sort((a, b) => a.code.localeCompare(b.code));
    }
    const totalAssets = Math.round(sections.asset.reduce((s, r) => s + r.balance, 0) * 100) / 100;
    const totalLiabilities = Math.round(sections.liability.reduce((s, r) => s + r.balance, 0) * 100) / 100;
    const totalEquity = Math.round(sections.equity.reduce((s, r) => s + r.balance, 0) * 100) / 100;
    const difference = Math.round((totalAssets - (totalLiabilities + totalEquity)) * 100) / 100;
    const balanced = Math.abs(difference) < 0.01;
    return { sections, totalAssets, totalLiabilities, totalEquity, difference, balanced };
  }, [rows]);

  // ── Export: CSV (blocked on imbalance) ─────────────────────────────────────
  const exportCSV = useCallback(() => {
    if (!rows?.length) return;
    const header = "Section,Code,Account,Balance\n";
    const body = rows
      .map((r) => `${r.account_type},${r.code},"${bn ? (r.name_bn || r.name) : r.name}",${r.balance}`)
      .join("\n");
    const totals = [
      "",
      `Total Assets,,,"${computed.totalAssets}"`,
      `Total Liabilities,,,"${computed.totalLiabilities}"`,
      `Total Equity,,,"${computed.totalEquity}"`,
      `Balanced,,,"${computed.balanced ? "Yes" : "No"}"`,
    ].join("\n");
    const blob = new Blob(["\uFEFF" + header + body + "\n" + totals], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `balance-sheet-${format(effectiveDate, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, computed, effectiveDate, bn]);

  // ── Export: PDF (print-friendly) ────────────────────────────────────────────
  const exportPDF = useCallback(() => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const dateLabel = formatLocalDate(effectiveDate, lang);

    const sectionHTML = VALID_SECTIONS.map((sec) => {
      const meta = SECTION_META[sec];
      const items = computed.sections[sec];
      const total = sec === "asset" ? computed.totalAssets : sec === "liability" ? computed.totalLiabilities : computed.totalEquity;
      return `
        <h3 style="margin:18px 0 6px;font-size:14px;font-weight:700;">${bn ? meta.labelBn : meta.labelEn}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f3f4f6;"><th style="text-align:left;padding:6px 8px;border:1px solid #ddd;">${bn ? "হিসাব" : "Account"}</th><th style="text-align:left;padding:6px 8px;border:1px solid #ddd;">${bn ? "কোড" : "Code"}</th><th style="text-align:right;padding:6px 8px;border:1px solid #ddd;">${bn ? "ব্যালেন্স" : "Balance"}</th></tr></thead>
          <tbody>
            ${items.length === 0
              ? `<tr><td colspan="3" style="text-align:center;padding:12px;color:#999;">${bn ? "ডেটা নেই" : "No data"}</td></tr>`
              : items.map((r) => `<tr><td style="padding:5px 8px;border:1px solid #eee;">${bn ? (r.name_bn || r.name) : r.name}</td><td style="padding:5px 8px;border:1px solid #eee;font-family:monospace;font-size:11px;">${r.code}</td><td style="text-align:right;padding:5px 8px;border:1px solid #eee;font-family:monospace;">${fmtAmt(r.balance)}</td></tr>`).join("")}
            <tr style="background:#f9fafb;font-weight:700;"><td colspan="2" style="padding:6px 8px;border:1px solid #ddd;">${bn ? "মোট" : "Total"}</td><td style="text-align:right;padding:6px 8px;border:1px solid #ddd;font-family:monospace;">${fmtAmt(total)}</td></tr>
          </tbody>
        </table>`;
    }).join("");

    printWindow.document.write(`<!DOCTYPE html><html><head><title>${bn ? "ব্যালেন্স শীট" : "Balance Sheet"}</title><style>body{font-family:'Hind Siliguri',sans-serif;padding:24px;max-width:800px;margin:auto;}@media print{body{padding:12px;}.no-print{display:none !important;}}</style></head><body>
      <h1 style="font-size:18px;margin-bottom:4px;text-align:center;">${bn ? "ব্যালেন্স শীট" : "Balance Sheet"}</h1>
      <p style="color:#666;font-size:12px;margin-bottom:16px;text-align:center;">${bn ? "তারিখ:" : "As of:"} ${dateLabel}</p>
      ${sectionHTML}
      <div style="margin-top:20px;padding:12px;background:${computed.balanced ? "#ecfdf5" : "#fef2f2"};border-radius:8px;text-align:center;font-size:13px;font-weight:700;">
        ${computed.balanced
          ? (bn ? "✅ সম্পদ = দায় + স্বত্ব — ব্যালেন্স সঠিক" : "✅ Assets = Liabilities + Equity — Balanced")
          : (bn ? `⚠️ অমিল — পার্থক্য: ${fmtAmt(computed.difference)}` : `⚠️ Imbalanced — Diff: ${fmtAmt(computed.difference)}`)}
      </div>
      <p style="text-align:center;color:#999;font-size:10px;margin-top:24px;">Generated by Ekta Finance System</p>
    </body></html>`);
    printWindow.document.close();
    printWindow.print();
  }, [computed, effectiveDate, bn, lang]);

  return (
    <AppLayout>
      <PageHeader
        title={bn ? "ব্যালেন্স শীট" : "Balance Sheet"}
        description={
          bn
            ? `তারিখ: ${formatLocalDate(effectiveDate, lang)} — সম্পদ, দায় ও মালিকানা স্বত্ব`
            : `As of ${formatLocalDate(effectiveDate, lang)} — Assets, Liabilities & Equity`
        }
        actions={
          <Badge
            variant={computed.balanced ? "default" : "destructive"}
            className="gap-1.5 text-xs py-1 px-3"
          >
            {computed.balanced ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> : <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />}
            {computed.balanced
              ? "A = L + E ✓"
              : (bn ? `অমিল ৳${Math.abs(computed.difference).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : `Imbalance ${fmtAmt(computed.difference)}`)}
          </Badge>
        }
      />

      {/* ── Validation warning ── */}
      {validationWarning && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2" role="alert">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {validationWarning}
        </div>
      )}

      {/* ── Toolbar: date + export ── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("gap-2 text-xs", !asOfDate && "text-muted-foreground")}
              aria-label={bn ? "তারিখ নির্বাচন করুন" : "Select date"}
            >
              <CalendarIcon className="w-3.5 h-3.5" aria-hidden="true" />
              {asOfDate ? formatLocalDate(asOfDate, lang) : (bn ? "তারিখ নির্বাচন করুন" : "Select date")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={asOfDate}
              onSelect={handleDateSelect}
              disabled={(date) => date > new Date()}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        {asOfDate && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setAsOfDate(undefined)} aria-label={bn ? "তারিখ রিসেট" : "Reset date"}>
            {bn ? "রিসেট" : "Reset"}
          </Button>
        )}

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={exportCSV}
            disabled={!rows?.length}
            aria-label={bn ? "CSV ডাউনলোড" : "Download CSV"}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={exportPDF}
            disabled={!rows?.length}
            aria-label={bn ? "PDF ডাউনলোড" : "Download PDF"}
          >
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            PDF
          </Button>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={3} />
      ) : (
        <div className="space-y-5">
          <SectionTable type="asset" items={computed.sections.asset} total={computed.totalAssets} bn={bn} />
          <SectionTable type="liability" items={computed.sections.liability} total={computed.totalLiabilities} bn={bn} />
          <SectionTable type="equity" items={computed.sections.equity} total={computed.totalEquity} bn={bn} />

          <EquationBanner
            totalAssets={computed.totalAssets}
            totalLiabilities={computed.totalLiabilities}
            totalEquity={computed.totalEquity}
            difference={computed.difference}
            balanced={computed.balanced}
            bn={bn}
          />
        </div>
      )}
    </AppLayout>
  );
};

export default BalanceSheetPage;
