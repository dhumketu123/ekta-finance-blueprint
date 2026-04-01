import { useState, useMemo, useCallback } from "react";
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
  CalendarIcon, Download, FileText, FileSpreadsheet,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatLocalDate } from "@/lib/date-utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface BsRow {
  coa_id: string;
  code: string;
  name: string;
  name_bn: string;
  account_type: string;
  balance: number;
}

type AccountSection = "asset" | "liability" | "equity";

const SECTION_META: Record<AccountSection, { icon: typeof Landmark; labelBn: string; labelEn: string; color: string }> = {
  asset: { icon: Wallet, labelBn: "সম্পদ (Assets)", labelEn: "Assets", color: "text-primary" },
  liability: { icon: ShieldCheck, labelBn: "দায় (Liabilities)", labelEn: "Liabilities", color: "text-amber-600" },
  equity: { icon: Landmark, labelBn: "মালিকানা স্বত্ব (Equity)", labelEn: "Equity", color: "text-violet-600" },
};

const fmtAmt = (n: number) =>
  `৳${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

// ── Page ──────────────────────────────────────────────────────────────────────
const BalanceSheetPage = () => {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const [asOfDate, setAsOfDate] = useState<Date | undefined>(undefined);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["balance-sheet", asOfDate?.toISOString()],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (asOfDate) params.p_as_of = format(asOfDate, "yyyy-MM-dd");
      const { data, error } = await supabase.rpc("get_balance_sheet", params);
      if (error) throw error;
      return (data ?? []) as BsRow[];
    },
  });

  const computed = useMemo(() => {
    const sections: Record<AccountSection, BsRow[]> = { asset: [], liability: [], equity: [] };
    for (const r of rows ?? []) {
      const t = r.account_type as AccountSection;
      if (sections[t]) sections[t].push(r);
    }
    const totalAssets = sections.asset.reduce((s, r) => s + Number(r.balance), 0);
    const totalLiabilities = sections.liability.reduce((s, r) => s + Number(r.balance), 0);
    const totalEquity = sections.equity.reduce((s, r) => s + Number(r.balance), 0);
    const balanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;
    return { sections, totalAssets, totalLiabilities, totalEquity, balanced };
  }, [rows]);

  // ── Export: CSV ─────────────────────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    if (!rows?.length) return;
    const header = "Section,Code,Account,Balance\n";
    const body = rows
      .map((r) => `${r.account_type},${r.code},"${bn ? r.name_bn : r.name}",${r.balance}`)
      .join("\n");
    const totals = `\n\nTotal Assets,,,"${computed.totalAssets}"\nTotal Liabilities,,,"${computed.totalLiabilities}"\nTotal Equity,,,"${computed.totalEquity}"`;
    const blob = new Blob(["\uFEFF" + header + body + totals], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `balance-sheet-${format(asOfDate ?? new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, computed, asOfDate, bn]);

  // ── Export: PDF (print-friendly) ────────────────────────────────────────────
  const exportPDF = useCallback(() => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const dateLabel = asOfDate ? formatLocalDate(asOfDate, lang) : formatLocalDate(new Date(), lang);

    const sectionHTML = (["asset", "liability", "equity"] as AccountSection[]).map((sec) => {
      const meta = SECTION_META[sec];
      const items = computed.sections[sec];
      const total = sec === "asset" ? computed.totalAssets : sec === "liability" ? computed.totalLiabilities : computed.totalEquity;
      return `
        <h3 style="margin:18px 0 6px;font-size:14px;font-weight:700;">${bn ? meta.labelBn : meta.labelEn}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f3f4f6;"><th style="text-align:left;padding:6px 8px;border:1px solid #ddd;">${bn ? "হিসাব" : "Account"}</th><th style="text-align:left;padding:6px 8px;border:1px solid #ddd;">${bn ? "কোড" : "Code"}</th><th style="text-align:right;padding:6px 8px;border:1px solid #ddd;">${bn ? "ব্যালেন্স" : "Balance"}</th></tr></thead>
          <tbody>
            ${items.map((r) => `<tr><td style="padding:5px 8px;border:1px solid #eee;">${bn ? r.name_bn || r.name : r.name}</td><td style="padding:5px 8px;border:1px solid #eee;font-family:monospace;font-size:11px;">${r.code}</td><td style="text-align:right;padding:5px 8px;border:1px solid #eee;font-family:monospace;">৳${Math.abs(Number(r.balance)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>`).join("")}
            <tr style="background:#f9fafb;font-weight:700;"><td colspan="2" style="padding:6px 8px;border:1px solid #ddd;">${bn ? "মোট" : "Total"}</td><td style="text-align:right;padding:6px 8px;border:1px solid #ddd;font-family:monospace;">৳${Math.abs(total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>
          </tbody>
        </table>`;
    }).join("");

    printWindow.document.write(`<!DOCTYPE html><html><head><title>${bn ? "ব্যালেন্স শীট" : "Balance Sheet"}</title><style>body{font-family:'Hind Siliguri',sans-serif;padding:24px;max-width:800px;margin:auto;}@media print{body{padding:12px;}}</style></head><body>
      <h1 style="font-size:18px;margin-bottom:4px;">${bn ? "ব্যালেন্স শীট" : "Balance Sheet"}</h1>
      <p style="color:#666;font-size:12px;margin-bottom:16px;">${bn ? "তারিখ:" : "As of:"} ${dateLabel}</p>
      ${sectionHTML}
      <div style="margin-top:20px;padding:12px;background:${computed.balanced ? "#ecfdf5" : "#fef2f2"};border-radius:8px;text-align:center;font-size:13px;font-weight:700;">
        ${computed.balanced ? (bn ? "✅ সম্পদ = দায় + স্বত্ব — ব্যালেন্স সঠিক" : "✅ Assets = Liabilities + Equity — Balanced") : (bn ? "⚠️ অমিল!" : "⚠️ Imbalanced!")}
      </div>
    </body></html>`);
    printWindow.document.close();
    printWindow.print();
  }, [computed, asOfDate, bn, lang]);

  // ── Section renderer ────────────────────────────────────────────────────────
  const renderSection = (type: AccountSection, total: number) => {
    const meta = SECTION_META[type];
    const items = computed.sections[type];
    const Icon = meta.icon;
    return (
      <Card key={type} className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Icon className={cn("w-4 h-4", meta.color)} />
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
                    {bn ? "কোনো তথ্য নেই" : "No data"}
                  </TableCell>
                </TableRow>
              )}
              {items.map((r) => (
                <TableRow key={r.coa_id}>
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

  return (
    <AppLayout>
      <PageHeader
        title={bn ? "ব্যালেন্স শীট" : "Balance Sheet"}
        description={bn ? "সম্পদ, দায় ও মালিকানা স্বত্ব — আর্থিক অবস্থান বিবরণী" : "Assets, Liabilities & Equity — Statement of Financial Position"}
        actions={
          <Badge
            variant={computed.balanced ? "default" : "destructive"}
            className="gap-1.5 text-xs py-1 px-3"
          >
            {computed.balanced ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {computed.balanced
              ? (bn ? "A = L + E ✓" : "A = L + E ✓")
              : (bn ? "অমিল!" : "Imbalanced!")}
          </Badge>
        }
      />

      {/* ── Toolbar: date + export ── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("gap-2 text-xs", !asOfDate && "text-muted-foreground")}>
              <CalendarIcon className="w-3.5 h-3.5" />
              {asOfDate ? formatLocalDate(asOfDate, lang) : (bn ? "তারিখ নির্বাচন করুন" : "Select date")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={asOfDate}
              onSelect={setAsOfDate}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        {asOfDate && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setAsOfDate(undefined)}>
            {bn ? "রিসেট" : "Reset"}
          </Button>
        )}

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportCSV} disabled={!rows?.length}>
            <FileSpreadsheet className="w-3.5 h-3.5" />
            CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportPDF} disabled={!rows?.length}>
            <FileText className="w-3.5 h-3.5" />
            PDF
          </Button>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={3} />
      ) : (
        <div className="space-y-5">
          {renderSection("asset", computed.totalAssets)}
          {renderSection("liability", computed.totalLiabilities)}
          {renderSection("equity", computed.totalEquity)}

          {/* ── Equation validation banner ── */}
          <Card
            className="overflow-hidden"
            style={{
              background: computed.balanced
                ? "linear-gradient(135deg, hsl(142 70% 45% / 0.08), hsl(142 70% 45% / 0.03))"
                : "linear-gradient(135deg, hsl(0 84% 60% / 0.08), hsl(0 84% 60% / 0.03))",
              borderColor: computed.balanced
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
                    {fmtAmt(computed.totalAssets)} = {fmtAmt(computed.totalLiabilities)} + {fmtAmt(computed.totalEquity)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {bn ? "সম্পদ = দায় + মালিকানা স্বত্ব" : "Assets = Liabilities + Equity"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <Badge
                    variant={computed.balanced ? "default" : "destructive"}
                    className="text-sm px-4 py-1.5"
                  >
                    {computed.balanced
                      ? (bn ? "✅ ব্যালেন্স সঠিক" : "✅ Balanced")
                      : (bn ? "⚠️ অমিল — পার্থক্য: " : "⚠️ Diff: ") + fmtAmt(computed.totalAssets - computed.totalLiabilities - computed.totalEquity)}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppLayout>
  );
};

export default BalanceSheetPage;
