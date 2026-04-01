import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { Clock, Shield, Zap, Link2, RefreshCw, ShieldCheck, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAdvanceBufferEntries, useCreditScores, useCalculateCreditScore, useEventSourcing } from "@/hooks/useAdvanceBuffer";
import { useClients } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

// ── Integrity Result Display ──
const IntegrityResult = ({ data, bn }: { data: { integrity: string; total_events?: number; broken_links?: number; total_entries?: number }; bn: boolean }) => (
  <div className={`p-4 rounded-xl border-2 ${
    data.integrity === "valid" ? "bg-success/10 border-success/30" : "bg-destructive/10 border-destructive/30"
  }`}>
    <div className="grid grid-cols-2 gap-3 text-xs">
      <div><span className="text-muted-foreground">{bn ? "মোট এন্ট্রি" : "Total Entries"}:</span> <span className="font-bold">{data.total_events ?? data.total_entries ?? 0}</span></div>
      <div><span className="text-muted-foreground">{bn ? "ভাঙা লিংক" : "Broken Links"}:</span> <span className="font-bold">{data.broken_links ?? 0}</span></div>
      <div className="col-span-2 flex items-center gap-2">
        {data.integrity === "valid"
          ? <><CheckCircle2 className="w-4 h-4 text-success" /><span className="text-success font-semibold text-xs">{bn ? "অখণ্ড — কোনো পরিবর্তন সনাক্ত হয়নি" : "Intact — No tampering detected"}</span></>
          : <><AlertTriangle className="w-4 h-4 text-destructive" /><span className="text-destructive font-semibold text-xs">{bn ? "⚠️ চেইন ক্ষতিগ্রস্ত!" : "⚠️ Chain compromised!"}</span></>
        }
      </div>
    </div>
  </div>
);

// ── Ledger Entries Integrity Panel ──
const LedgerIntegrityPanel = ({ bn }: { bn: boolean }) => {
  const verifyLedger = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("verify_all_branches_integrity" as any);
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data: any) => {
      if (data?.overall_integrity === "valid") {
        toast.success(bn ? "✅ সকল শাখার লেজার অখণ্ড" : "✅ All branch ledgers verified intact");
      } else {
        toast.error(bn ? "⚠️ লেজার অখণ্ডতায় সমস্যা পাওয়া গেছে" : "⚠️ Ledger integrity issues detected");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const branchResults = (verifyLedger.data as any)?.branches ?? [];

  return (
    <div className="card-elevated p-6 space-y-4">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <div>
          <h3 className="text-sm font-bold">{bn ? "লেজার হ্যাশ চেইন যাচাই" : "Ledger Hash Chain Verification"}</h3>
          <p className="text-[10px] text-muted-foreground">{bn ? "প্রতিটি শাখার ডাবল-এন্ট্রি লেজার চেইন পরীক্ষা" : "Verify double-entry ledger chain per branch"}</p>
        </div>
      </div>
      <Button
        onClick={() => verifyLedger.mutate()}
        disabled={verifyLedger.isPending}
        className="gap-1.5 text-xs"
      >
        {verifyLedger.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
        {bn ? "সকল শাখা যাচাই করুন" : "Verify All Branches"}
      </Button>

      {verifyLedger.data && (
        <div className="space-y-3">
          <IntegrityResult
            data={{ integrity: (verifyLedger.data as any).overall_integrity, total_entries: branchResults.reduce((s: number, b: any) => s + (b.total_entries ?? 0), 0), broken_links: branchResults.reduce((s: number, b: any) => s + (b.broken_links ?? 0), 0) }}
            bn={bn}
          />
          {branchResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{bn ? "শাখা বিবরণ" : "Branch Details"}</p>
              {branchResults.map((b: any, i: number) => (
                <div key={i} className={`flex items-center justify-between p-3 rounded-lg border text-xs ${
                  b.integrity === "valid" ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"
                }`}>
                  <span className="font-medium">{b.branch_name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{b.total_entries} {bn ? "এন্ট্রি" : "entries"}</span>
                    {b.integrity === "valid"
                      ? <CheckCircle2 className="w-4 h-4 text-success" />
                      : <AlertTriangle className="w-4 h-4 text-destructive" />
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const QuantumLedger = () => {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const [tab, setTab] = useState("event_log");
  const [daysBack, setDaysBack] = useState([0]);

  const { data: events, isLoading: eventsLoading } = useEventSourcing();
  const { data: advanceEntries } = useAdvanceBufferEntries();
  const { data: creditScores } = useCreditScores();
  const { data: clients } = useClients();
  const calcScore = useCalculateCreditScore();

  // Integrity verification
  const verifyIntegrity = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("verify_event_chain_integrity" as any);
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data: any) => {
      if (data?.integrity === "valid") {
        toast.success(bn ? "✅ চেইন অখণ্ডতা যাচাই সফল" : "✅ Chain integrity verified");
      } else {
        toast.error(bn ? `⚠️ ${data?.broken_links} টি ভাঙা লিংক পাওয়া গেছে` : `⚠️ ${data?.broken_links} broken links found`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Filter events by time slider
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack[0]);
  const filteredEvents = (events ?? []).filter(
    (e: any) => new Date(e.created_at) >= cutoffDate
  );

  const riskColors: Record<string, string> = {
    low: "bg-success/10 text-success border-success/30",
    medium: "bg-warning/10 text-warning border-warning/30",
    high: "bg-orange-500/10 text-orange-500 border-orange-500/30",
    critical: "bg-destructive/10 text-destructive border-destructive/30",
  };

  return (
    <AppLayout>
      <PageHeader
        title={bn ? "কোয়ান্টাম লেজার" : "Quantum Ledger"}
        description={bn ? "ইভেন্ট সোর্সিং, টাইম-মেশিন, অগ্রিম বাফার ও ক্রেডিট স্কোর" : "Event Sourcing, Time-Machine, Advance Buffer & Credit Scores"}
        badge={bn ? "⚛️ কোয়ান্টাম ইঞ্জিন" : "⚛️ Quantum Engine"}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50 mb-4">
          <TabsTrigger value="event_log" className="text-xs gap-1.5">
            <Link2 className="w-3 h-3" /> {bn ? "ইভেন্ট লগ" : "Event Log"}
          </TabsTrigger>
          <TabsTrigger value="advance_buffer" className="text-xs gap-1.5">
            <Clock className="w-3 h-3" /> {bn ? "অগ্রিম বাফার" : "Advance Buffer"}
          </TabsTrigger>
          <TabsTrigger value="credit_scores" className="text-xs gap-1.5">
            <Shield className="w-3 h-3" /> {bn ? "ক্রেডিট স্কোর" : "Credit Scores"}
          </TabsTrigger>
          <TabsTrigger value="integrity" className="text-xs gap-1.5">
            <ShieldCheck className="w-3 h-3" /> {bn ? "অখণ্ডতা" : "Integrity"}
          </TabsTrigger>
        </TabsList>

        {/* ── Event Sourcing Log ── */}
        <TabsContent value="event_log" className="mt-0">
          {/* Time-Machine Slider */}
          <div className="card-elevated p-4 mb-4">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold">{bn ? "টাইম-মেশিন ফিল্টার" : "Time-Machine Filter"}</span>
              <Badge variant="outline" className="text-[10px] ml-auto">
                {daysBack[0] === 0 ? (bn ? "আজ" : "Today") : `${daysBack[0]} ${bn ? "দিন আগে থেকে" : "days back"}`}
              </Badge>
            </div>
            <Slider
              value={daysBack}
              onValueChange={setDaysBack}
              max={90}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>{bn ? "আজ" : "Today"}</span>
              <span>{bn ? "৯০ দিন আগে" : "90 days ago"}</span>
            </div>
          </div>

          <div className="card-elevated overflow-hidden">
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
                  <TableHead className="text-xs">{bn ? "সময়" : "Time"}</TableHead>
                  <TableHead className="text-xs">{bn ? "এন্টিটি" : "Entity"}</TableHead>
                  <TableHead className="text-xs">{bn ? "কার্যক্রম" : "Action"}</TableHead>
                  <TableHead className="text-xs">{bn ? "হ্যাশ চেইন" : "Hash Chain"}</TableHead>
                  <TableHead className="text-xs">{bn ? "বিবরণ" : "Details"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      {bn ? "কোনো ইভেন্ট নেই" : "No events found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEvents.slice(0, 50).map((ev: any) => (
                    <TableRow key={ev.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(ev.created_at).toLocaleString(bn ? "bn-BD" : "en-US", { dateStyle: "short", timeStyle: "short" })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{ev.entity_type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{ev.action}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {ev.hash_prev === "GENESIS" ? (
                            <Badge className="text-[9px] bg-primary/10 text-primary border-primary/30" variant="outline">GENESIS</Badge>
                          ) : (
                            <span className="text-[9px] font-mono text-muted-foreground">{ev.hash_self?.slice(0, 12)}...</span>
                          )}
                          <Link2 className="w-3 h-3 text-muted-foreground" />
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground max-w-40 truncate">
                        {JSON.stringify(ev.payload).slice(0, 60)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Advance Buffer ── */}
        <TabsContent value="advance_buffer" className="mt-0">
          <div className="card-elevated overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Zap className="w-4 h-4 text-warning" />
              <h3 className="text-sm font-bold">{bn ? "অগ্রিম / সাসপেন্স অ্যাকাউন্ট" : "Advance / Suspense Account"}</h3>
              <Badge variant="outline" className="text-[10px] ml-auto">
                {(advanceEntries ?? []).filter((e: any) => e.status === "pending").length} {bn ? "পেন্ডিং" : "pending"}
              </Badge>
            </div>
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
                  <TableHead className="text-xs">{bn ? "সদস্য" : "Member"}</TableHead>
                  <TableHead className="text-xs">{bn ? "ধরন" : "Type"}</TableHead>
                  <TableHead className="text-xs">{bn ? "পরিমাণ" : "Amount"}</TableHead>
                  <TableHead className="text-xs">{bn ? "পোস্ট তারিখ" : "Post Date"}</TableHead>
                  <TableHead className="text-xs">{bn ? "অবস্থা" : "Status"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!(advanceEntries ?? []).length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      {bn ? "কোনো অগ্রিম এন্ট্রি নেই" : "No advance entries"}
                    </TableCell>
                  </TableRow>
                ) : (
                  (advanceEntries ?? []).map((entry: any) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs">
                        {entry.clients ? (bn ? entry.clients.name_bn : entry.clients.name_en) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{entry.buffer_type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-bold">৳{Number(entry.amount).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{entry.post_date}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${
                          entry.status === "posted" ? "bg-success/10 text-success" :
                          entry.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                          "bg-warning/10 text-warning"
                        }`}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Credit Scores ── */}
        <TabsContent value="credit_scores" className="mt-0">
          <div className="card-elevated overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold">{bn ? "একতা ক্রেডিট স্কোর" : "Ekta Credit Score"}</h3>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto text-xs gap-1.5 h-7"
                onClick={() => {
                  // Calculate for all clients
                  (clients ?? []).forEach((c: any) => calcScore.mutate(c.id));
                }}
                disabled={calcScore.isPending}
              >
                <RefreshCw className={`w-3 h-3 ${calcScore.isPending ? "animate-spin" : ""}`} />
                {bn ? "সব হালনাগাদ" : "Recalculate All"}
              </Button>
            </div>
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
                  <TableHead className="text-xs">{bn ? "সদস্য" : "Member"}</TableHead>
                  <TableHead className="text-xs">{bn ? "স্কোর" : "Score"}</TableHead>
                  <TableHead className="text-xs">{bn ? "ঝুঁকি" : "Risk"}</TableHead>
                  <TableHead className="text-xs">{bn ? "নিয়মিততা" : "Regularity"}</TableHead>
                  <TableHead className="text-xs">{bn ? "সময়মত" : "On-Time"}</TableHead>
                  <TableHead className="text-xs">{bn ? "বিলম্ব" : "Late"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!(creditScores ?? []).length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      {bn ? "স্কোর হালনাগাদ করুন" : "Click recalculate to generate scores"}
                    </TableCell>
                  </TableRow>
                ) : (
                  (creditScores ?? []).map((cs: any) => (
                    <TableRow key={cs.id}>
                      <TableCell className="text-xs font-medium">
                        {cs.clients ? (bn ? cs.clients.name_bn : cs.clients.name_en) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                cs.score >= 80 ? "bg-success" :
                                cs.score >= 60 ? "bg-warning" :
                                cs.score >= 40 ? "bg-orange-500" : "bg-destructive"
                              }`}
                              style={{ width: `${cs.score}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold">{cs.score}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${riskColors[cs.risk_level] || ""}`}>
                          {cs.risk_level}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{cs.payment_regularity}%</TableCell>
                      <TableCell className="text-xs text-success">{cs.total_on_time_payments}</TableCell>
                      <TableCell className="text-xs text-destructive">{cs.total_late_payments}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Integrity Verification ── */}
        <TabsContent value="integrity" className="mt-0 space-y-4">
          {/* Event Sourcing Chain */}
          <div className="card-elevated p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Link2 className="w-5 h-5 text-primary" />
              <div>
                <h3 className="text-sm font-bold">{bn ? "ইভেন্ট সোর্সিং চেইন যাচাই" : "Event Sourcing Chain Verification"}</h3>
                <p className="text-[10px] text-muted-foreground">{bn ? "ইভেন্ট সোর্সিং হ্যাশ চেইন অখণ্ডতা পরীক্ষা" : "Verify event sourcing hash chain integrity"}</p>
              </div>
            </div>
            <Button
              onClick={() => verifyIntegrity.mutate()}
              disabled={verifyIntegrity.isPending}
              className="gap-1.5 text-xs"
              variant="outline"
            >
              {verifyIntegrity.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              {bn ? "ইভেন্ট চেইন যাচাই" : "Verify Event Chain"}
            </Button>
            {verifyIntegrity.data && (
              <IntegrityResult data={verifyIntegrity.data as any} bn={bn} />
            )}
          </div>

          {/* Ledger Entries Hash Chain */}
          <LedgerIntegrityPanel bn={bn} />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default QuantumLedger;
