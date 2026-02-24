/**
 * Phase 5 — Ledger Audit UI
 * Shows all PDF ledger entries with chain verification status
 */
import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, ShieldCheck, ShieldAlert, RefreshCw, FileText, Link2, Link2Off, Download, AlertTriangle } from "lucide-react";
import { verifyLedgerChain } from "@/lib/pdf-utils";
import { format } from "date-fns";
import { toast } from "sonner";

interface AuditEntry {
  id: string;
  entity_id: string;
  entity_type: string;
  created_at: string;
  hash_self: string | null;
  hash_prev: string | null;
  chainIntact: boolean;
  payload: Record<string, any>;
}

export default function LedgerAudit() {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [brokenLinks, setBrokenLinks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const runAudit = useCallback(async () => {
    setLoading(true);
    try {
      const entityType = filter === "all" ? undefined : filter;
      const result = await verifyLedgerChain(entityType);
      setEntries(result.entries);
      setTotalEntries(result.totalEntries);
      setBrokenLinks(result.brokenLinks);
      if (result.brokenLinks > 0) {
        toast.error(bn ? `⚠️ ${result.brokenLinks}টি চেইন ব্রেক সনাক্ত হয়েছে!` : `⚠️ ${result.brokenLinks} chain break(s) detected!`);
      } else if (result.totalEntries > 0) {
        toast.success(bn ? "✅ সব চেইন অক্ষত আছে" : "✅ All chains intact");
      }
    } catch {
      toast.error(bn ? "অডিট ব্যর্থ" : "Audit failed");
    } finally {
      setLoading(false);
    }
  }, [filter, bn]);

  useEffect(() => { runAudit(); }, [runAudit]);

  const truncHash = (h: string | null) => h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—";

  const exportCSV = useCallback(() => {
    if (entries.length === 0) return;
    const headers = ["Type", "Date", "Entity ID", "Chain Hash", "Prev Hash", "Status"];
    const rows = entries.map((e) => [
      e.entity_type,
      format(new Date(e.created_at), "yyyy-MM-dd HH:mm:ss"),
      e.entity_id,
      e.hash_self || "",
      e.hash_prev || "",
      e.chainIntact ? "Intact" : "BROKEN",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-audit-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(bn ? "CSV এক্সপোর্ট সম্পন্ন" : "CSV exported");
  }, [entries, bn]);

  return (
    <AppLayout>
      <PageHeader title={bn ? "লেজার অডিট" : "Ledger Audit"} description={bn ? "PDF চেইন ভেরিফিকেশন ড্যাশবোর্ড" : "PDF Chain Verification Dashboard"} />

      {/* Persistent Broken Chain Alert Banner */}
      {!loading && brokenLinks > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{bn ? "⚠️ চেইন ইন্টেগ্রিটি সতর্কতা" : "⚠️ Chain Integrity Warning"}</AlertTitle>
          <AlertDescription>
            {bn
              ? `${brokenLinks}টি ভাঙা চেইন লিংক সনাক্ত হয়েছে। অবিলম্বে তদন্ত করুন — সম্ভাব্য ডেটা পরিবর্তন বা টেম্পারিং।`
              : `${brokenLinks} broken chain link(s) detected. Investigate immediately — possible data tampering.`}
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{bn ? "মোট এন্ট্রি" : "Total Entries"}</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> {totalEntries}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{bn ? "অক্ষত চেইন" : "Intact Links"}</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold flex items-center gap-2 text-success"><Link2 className="w-5 h-5" /> {totalEntries - brokenLinks}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{bn ? "ভাঙা চেইন" : "Broken Links"}</CardTitle></CardHeader>
          <CardContent><p className={`text-2xl font-bold flex items-center gap-2 ${brokenLinks > 0 ? "text-destructive" : "text-success"}`}><Link2Off className="w-5 h-5" /> {brokenLinks}</p></CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{bn ? "সব" : "All Types"}</SelectItem>
            <SelectItem value="pdf_receipt">{bn ? "রিসিপ্ট" : "Receipts"}</SelectItem>
            <SelectItem value="pdf_agreement">{bn ? "চুক্তিপত্র" : "Agreements"}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={runAudit} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {bn ? "পুনরায় যাচাই" : "Re-verify"}
        </Button>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={entries.length === 0} className="gap-2">
          <Download className="w-4 h-4" />
          {bn ? "CSV এক্সপোর্ট" : "Export CSV"}
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">{bn ? "চেইন যাচাই চলছে..." : "Verifying chain..."}</span>
            </div>
          ) : entries.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">{bn ? "কোনো এন্ট্রি পাওয়া যায়নি" : "No entries found"}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{bn ? "ধরন" : "Type"}</TableHead>
                    <TableHead>{bn ? "তারিখ" : "Date"}</TableHead>
                    <TableHead>{bn ? "এন্টিটি" : "Entity"}</TableHead>
                    <TableHead>Chain Hash</TableHead>
                    <TableHead>Prev Hash</TableHead>
                    <TableHead className="text-center">{bn ? "স্থিতি" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id} className={!e.chainIntact ? "bg-destructive/5" : ""}>
                      <TableCell>
                        <Badge variant={e.entity_type === "pdf_receipt" ? "default" : "secondary"} className="text-[10px]">
                          {e.entity_type === "pdf_receipt" ? (bn ? "রিসিপ্ট" : "Receipt") : (bn ? "চুক্তিপত্র" : "Agreement")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{format(new Date(e.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                      <TableCell className="text-xs font-mono">{e.entity_id.slice(0, 8).toUpperCase()}</TableCell>
                      <TableCell className="text-[10px] font-mono text-muted-foreground">{truncHash(e.hash_self)}</TableCell>
                      <TableCell className="text-[10px] font-mono text-muted-foreground">{truncHash(e.hash_prev)}</TableCell>
                      <TableCell className="text-center">
                        {e.chainIntact ? (
                          <ShieldCheck className="w-5 h-5 text-success mx-auto" />
                        ) : (
                          <ShieldAlert className="w-5 h-5 text-destructive mx-auto" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
