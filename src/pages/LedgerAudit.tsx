/**
 * v3 — Ledger Audit
 * PRIMARY source: financial_event_log (Reserve Architecture v2 immutable event stream).
 * SECONDARY tab: legacy PDF chain verifier.
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ShieldCheck, ShieldAlert, RefreshCw, FileText, Link2, Link2Off, Download, AlertTriangle, Activity } from "lucide-react";
import { verifyLedgerChain } from "@/lib/pdf-utils";
import { format } from "date-fns";
import { formatLocalDateTime } from "@/lib/date-utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

interface FinancialEvent {
  id: string;
  tenant_id: string;
  event_type: string;
  root_reference_id: string;
  payload: Record<string, any>;
  created_by: string | null;
  created_at: string;
}

const EVENT_TYPE_OPTIONS = [
  "all",
  "loan_disbursement",
  "loan_provision",
  "loan_payment",
  "savings_deposit",
  "savings_withdrawal",
  "profit_distribution",
];

export default function LedgerAudit() {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  // ── PDF chain (legacy) ──
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [brokenLinks, setBrokenLinks] = useState(0);
  const [loadingPdf, setLoadingPdf] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  // ── Financial event log (v3 primary) ──
  const [events, setEvents] = useState<FinancialEvent[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [loadingEvents, setLoadingEvents] = useState(true);

  const runPdfAudit = useCallback(async () => {
    setLoadingPdf(true);
    try {
      const entityType = filter === "all" ? undefined : filter;
      const result = await verifyLedgerChain(entityType);
      setEntries(result.entries);
      setTotalEntries(result.totalEntries);
      setBrokenLinks(result.brokenLinks);
    } catch {
      toast.error(bn ? "অডিট ব্যর্থ" : "Audit failed");
    } finally {
      setLoadingPdf(false);
    }
  }, [filter, bn]);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      let query = supabase
        .from("financial_event_log")
        .select("id, tenant_id, event_type, root_reference_id, payload, created_by, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (eventTypeFilter !== "all") query = query.eq("event_type", eventTypeFilter);
      const { data, error } = await query;
      if (error) throw error;
      setEvents((data ?? []) as FinancialEvent[]);
    } catch (e: any) {
      toast.error(`${bn ? "ইভেন্ট লোড ব্যর্থ" : "Event load failed"}: ${e?.message ?? ""}`);
    } finally {
      setLoadingEvents(false);
    }
  }, [eventTypeFilter, bn]);

  useEffect(() => { runPdfAudit(); }, [runPdfAudit]);
  useEffect(() => { loadEvents(); }, [loadEvents]);

  const truncHash = (h: string | null) => h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—";

  const exportEventsCSV = useCallback(() => {
    if (events.length === 0) return;
    const headers = ["Event Type", "Date", "Root Ref", "Tenant", "Created By", "Payload"];
    const rows = events.map((e) => [
      e.event_type,
      format(new Date(e.created_at), "yyyy-MM-dd HH:mm:ss"),
      e.root_reference_id,
      e.tenant_id,
      e.created_by ?? "system",
      JSON.stringify(e.payload ?? {}),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financial-events-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(bn ? "CSV এক্সপোর্ট সম্পন্ন" : "CSV exported");
  }, [events, bn]);

  return (
    <AppLayout>
      <PageHeader
        title={bn ? "লেজার অডিট" : "Ledger Audit"}
        description={bn ? "অপরিবর্তনীয় আর্থিক ইভেন্ট লগ এবং চেইন যাচাইকরণ" : "Immutable financial event log & chain verification"}
        badge={bn ? "🔗 v3 ইভেন্ট স্ট্রিম" : "🔗 v3 Event Stream"}
      />

      {/* Persistent Broken Chain Alert Banner (PDF) */}
      {!loadingPdf && brokenLinks > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{bn ? "⚠️ চেইন ইন্টেগ্রিটি সতর্কতা" : "⚠️ Chain Integrity Warning"}</AlertTitle>
          <AlertDescription>
            {bn ? `${brokenLinks}টি ভাঙা চেইন লিংক সনাক্ত হয়েছে।` : `${brokenLinks} broken chain link(s) detected.`}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="events" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="events" className="gap-1.5"><Activity className="w-4 h-4" /> {bn ? "আর্থিক ইভেন্ট" : "Financial Events"}</TabsTrigger>
          <TabsTrigger value="pdf" className="gap-1.5"><FileText className="w-4 h-4" /> {bn ? "PDF চেইন" : "PDF Chain"}</TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Financial Event Log (v3 primary) ── */}
        <TabsContent value="events">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{bn ? "মোট ইভেন্ট" : "Total Events"}</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold flex items-center gap-2"><Activity className="w-5 h-5 text-primary" /> {events.length}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{bn ? "ইভেন্ট প্রকার" : "Event Types"}</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-success">{new Set(events.map(e => e.event_type)).size}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{bn ? "সর্বশেষ ইভেন্ট" : "Latest Event"}</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm font-mono">
                  {events[0]?.created_at ? formatLocalDateTime(events[0].created_at, lang) : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
              <SelectTrigger className="w-[220px] h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">{t === "all" ? (bn ? "সব ইভেন্ট" : "All Events") : t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadEvents} disabled={loadingEvents} className="gap-2">
              {loadingEvents ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {bn ? "রিফ্রেশ" : "Refresh"}
            </Button>
            <Button variant="outline" size="sm" onClick={exportEventsCSV} disabled={events.length === 0} className="gap-2">
              <Download className="w-4 h-4" />
              {bn ? "CSV এক্সপোর্ট" : "Export CSV"}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loadingEvents ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">{bn ? "লোড হচ্ছে..." : "Loading..."}</span>
                </div>
              ) : events.length === 0 ? (
                <p className="text-center text-muted-foreground py-12 text-sm">{bn ? "কোনো ইভেন্ট নেই" : "No events"}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{bn ? "ইভেন্ট" : "Event"}</TableHead>
                        <TableHead>{bn ? "তারিখ" : "Date"}</TableHead>
                        <TableHead>Root Ref</TableHead>
                        <TableHead>{bn ? "তথ্য" : "Payload"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell><Badge variant="secondary" className="text-[10px]">{e.event_type}</Badge></TableCell>
                          <TableCell className="text-xs">{formatLocalDateTime(e.created_at, lang)}</TableCell>
                          <TableCell className="text-[10px] font-mono text-muted-foreground">{e.root_reference_id.slice(0, 8).toUpperCase()}…</TableCell>
                          <TableCell className="text-[10px] font-mono text-muted-foreground max-w-md truncate">
                            {Object.keys(e.payload ?? {}).length > 0 ? JSON.stringify(e.payload) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: PDF Chain (legacy) ── */}
        <TabsContent value="pdf">
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

          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px] h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{bn ? "সব" : "All Types"}</SelectItem>
                <SelectItem value="pdf_receipt">{bn ? "রিসিপ্ট" : "Receipts"}</SelectItem>
                <SelectItem value="pdf_agreement">{bn ? "চুক্তিপত্র" : "Agreements"}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={runPdfAudit} disabled={loadingPdf} className="gap-2">
              {loadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {bn ? "পুনরায় যাচাই" : "Re-verify"}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loadingPdf ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
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
                          <TableCell><Badge variant={e.entity_type === "pdf_receipt" ? "default" : "secondary"} className="text-[10px]">{e.entity_type === "pdf_receipt" ? (bn ? "রিসিপ্ট" : "Receipt") : (bn ? "চুক্তিপত্র" : "Agreement")}</Badge></TableCell>
                          <TableCell className="text-xs">{formatLocalDateTime(e.created_at, lang)}</TableCell>
                          <TableCell className="text-xs font-mono">{e.entity_id.slice(0, 8).toUpperCase()}</TableCell>
                          <TableCell className="text-[10px] font-mono text-muted-foreground">{truncHash(e.hash_self)}</TableCell>
                          <TableCell className="text-[10px] font-mono text-muted-foreground">{truncHash(e.hash_prev)}</TableCell>
                          <TableCell className="text-center">
                            {e.chainIntact ? <ShieldCheck className="w-5 h-5 text-success mx-auto" /> : <ShieldAlert className="w-5 h-5 text-destructive mx-auto" />}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
