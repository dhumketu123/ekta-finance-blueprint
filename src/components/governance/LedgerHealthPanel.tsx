/**
 * Live ledger health panel — calls ledger_final_state() + system_readiness_check().
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert, Activity, Database, Lock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatLocalDateTime } from "@/lib/date-utils";

interface LedgerState {
  status: string;
  contract_gaps: number;
  unbalanced_entries: number;
  manual_insert_block_active: boolean;
  checked_at: string;
}
interface ReadinessState {
  status: string;
  contract_rows: number;
  registry_rows: number;
  checked_at: string;
}
interface IntegrityAlert {
  id: string;
  alert_type: string;
  severity: string;
  message: string | null;
  resolved: boolean;
  created_at: string;
  snapshot: Record<string, unknown>;
}

export function LedgerHealthPanel({ bn, lang }: { bn: boolean; lang: "bn" | "en" }) {
  const [ledger, setLedger] = useState<LedgerState | null>(null);
  const [readiness, setReadiness] = useState<ReadinessState | null>(null);
  const [alerts, setAlerts] = useState<IntegrityAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: ledgerData, error: e1 }, { data: readyData, error: e2 }, { data: alertData, error: e3 }] = await Promise.all([
        // @ts-expect-error rpc names not yet in generated types
        supabase.rpc("ledger_final_state"),
        // @ts-expect-error rpc names not yet in generated types
        supabase.rpc("system_readiness_check"),
        // @ts-expect-error table not yet in generated types
        supabase.from("system_integrity_alerts").select("*").order("created_at", { ascending: false }).limit(10),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      setLedger(ledgerData as unknown as LedgerState);
      setReadiness(readyData as unknown as ReadinessState);
      setAlerts((alertData ?? []) as IntegrityAlert[]);
    } catch (e: any) {
      toast.error(`${bn ? "লোড ব্যর্থ" : "Load failed"}: ${e?.message ?? ""}`);
    } finally {
      setLoading(false);
    }
  }, [bn]);

  useEffect(() => { refresh(); }, [refresh]);

  const isHealthy = ledger?.status === "ULTRA_SAFE" && readiness?.status === "PRODUCTION_READY";
  const unresolvedAlerts = alerts.filter((a) => !a.resolved);

  return (
    <div className="space-y-4">
      {/* Status Banner */}
      {!loading && (
        <Alert variant={isHealthy ? "default" : "destructive"}>
          {isHealthy ? <ShieldCheck className="h-4 w-4 text-success" /> : <ShieldAlert className="h-4 w-4" />}
          <AlertTitle>
            {isHealthy
              ? (bn ? "✅ লেজার সম্পূর্ণ নিরাপদ" : "✅ Ledger Ultra-Safe")
              : (bn ? "⚠️ লেজার সমস্যা সনাক্ত" : "⚠️ Ledger Issues Detected")}
          </AlertTitle>
          <AlertDescription>
            {bn
              ? `লেজার: ${ledger?.status ?? "?"} • প্রস্তুতি: ${readiness?.status ?? "?"}`
              : `Ledger: ${ledger?.status ?? "?"} • Readiness: ${readiness?.status ?? "?"}`}
          </AlertDescription>
        </Alert>
      )}

      {/* Metric grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          icon={Database}
          label={bn ? "চুক্তি সারি" : "Contract Rows"}
          value={readiness?.contract_rows ?? "—"}
          tone="default"
        />
        <MetricCard
          icon={Activity}
          label={bn ? "রেজিস্ট্রি সারি" : "Registry Rows"}
          value={readiness?.registry_rows ?? "—"}
          tone="default"
        />
        <MetricCard
          icon={AlertTriangle}
          label={bn ? "চুক্তি গ্যাপ" : "Contract Gaps"}
          value={ledger?.contract_gaps ?? "—"}
          tone={(ledger?.contract_gaps ?? 0) > 0 ? "danger" : "success"}
        />
        <MetricCard
          icon={Lock}
          label={bn ? "ম্যানুয়াল ব্লক" : "Manual Insert Block"}
          value={ledger?.manual_insert_block_active ? (bn ? "সক্রিয়" : "Active") : (bn ? "নিষ্ক্রিয়" : "Off")}
          tone={ledger?.manual_insert_block_active ? "success" : "danger"}
        />
      </div>

      {/* Refresh + last checked */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground">
          {bn ? "শেষ যাচাই: " : "Last checked: "}
          <span className="font-mono">{ledger?.checked_at ? formatLocalDateTime(ledger.checked_at, lang) : "—"}</span>
        </p>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {bn ? "রিফ্রেশ" : "Refresh"}
        </Button>
      </div>

      {/* Recent alerts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            {bn ? "সাম্প্রতিক ইন্টেগ্রিটি সতর্কতা" : "Recent Integrity Alerts"}
            {unresolvedAlerts.length > 0 && (
              <Badge variant="destructive" className="text-[10px]">{unresolvedAlerts.length} {bn ? "অপ্রক্রিয়াজাত" : "open"}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : alerts.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-xs">
              {bn ? "কোনো সতর্কতা নেই — সিস্টেম সম্পূর্ণ স্বাস্থ্যকর" : "No alerts — system fully healthy"}
            </p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-start gap-3 p-3 rounded-md border bg-muted/20">
                  <div className={`mt-0.5 ${a.resolved ? "text-success" : "text-destructive"}`}>
                    {a.resolved ? <ShieldCheck className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{a.alert_type}</Badge>
                      <Badge variant={a.severity === "high" ? "destructive" : "secondary"} className="text-[10px]">{a.severity}</Badge>
                      {a.resolved && <Badge variant="secondary" className="text-[10px] text-success">{bn ? "সমাধান" : "resolved"}</Badge>}
                    </div>
                    <p className="text-xs mt-1">{a.message ?? "—"}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 font-mono">{formatLocalDateTime(a.created_at, lang)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, tone }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone: "default" | "success" | "danger";
}) {
  const toneClass = tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-primary";
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent>
        <p className={`text-xl font-bold flex items-center gap-2 ${toneClass}`}>
          <Icon className="w-4 h-4" /> {value}
        </p>
      </CardContent>
    </Card>
  );
}
