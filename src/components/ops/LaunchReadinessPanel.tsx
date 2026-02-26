import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Rocket,
  Database,
  Shield,
  Bell,
  Cog,
  Zap,
  Wallet,
  Activity,
  Timer,
  TrendingUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/* ── Types ── */
interface HealthCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
  latency_ms?: number;
}

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  total_latency_ms: number;
  summary: { pass: number; warn: number; fail: number };
  checks: HealthCheck[];
}

/* ── Check Metadata ── */
const CHECK_META: Record<string, { icon: React.ElementType; labelEn: string; labelBn: string }> = {
  database:        { icon: Database,  labelEn: "Database Connection",   labelBn: "ডাটাবেস সংযোগ" },
  tenant_rules:    { icon: Cog,       labelEn: "Tenant Business Rules", labelBn: "টেন্যান্ট নিয়মাবলী" },
  quantum_config:  { icon: Zap,       labelEn: "System Configuration",  labelBn: "সিস্টেম কনফিগ" },
  feature_flags:   { icon: Activity,  labelEn: "Feature Flags",         labelBn: "ফিচার ফ্ল্যাগ" },
  cron_activity:   { icon: Timer,     labelEn: "Background Jobs (24h)", labelBn: "ব্যাকগ্রাউন্ড জব (২৪ঘ)" },
  notifications:   { icon: Bell,      labelEn: "Notification Delivery", labelBn: "বিজ্ঞপ্তি ডেলিভারি" },
  loan_portfolio:  { icon: Wallet,    labelEn: "Loan Portfolio Health",  labelBn: "ঋণ পোর্টফোলিও স্বাস্থ্য" },
  rls_enforcement: { icon: Shield,    labelEn: "Security (RLS)",        labelBn: "নিরাপত্তা (RLS)" },
};

const STATUS_CFG = {
  pass: { color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", ring: "hsl(var(--success))" },
  warn: { color: "text-amber-500",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   ring: "hsl(var(--warning))" },
  fail: { color: "text-red-500",     bg: "bg-red-500/10",     border: "border-red-500/20",     ring: "hsl(var(--destructive))" },
} as const;

const STATUS_ICON = { pass: CheckCircle2, warn: AlertTriangle, fail: XCircle } as const;

/* ── Auto-refresh interval (60s) ── */
const AUTO_REFRESH_MS = 60_000;

export default function LaunchReadinessPanel() {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const [expanded, setExpanded] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery<HealthResponse>({
    queryKey: ["system-health"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("system-health");
      if (error) throw error;
      return data as HealthResponse;
    },
    staleTime: 30_000,
    retry: 2,
    refetchInterval: autoRefresh ? AUTO_REFRESH_MS : false,
  });

  const checks = data?.checks ?? [];
  const summary = data?.summary ?? { pass: 0, warn: 0, fail: 0 };
  const totalCount = checks.length;
  const score = totalCount > 0 ? Math.round((summary.pass / totalCount) * 100) : 0;

  const ringColor = score >= 80 ? STATUS_CFG.pass.ring : score >= 50 ? STATUS_CFG.warn.ring : STATUS_CFG.fail.ring;
  const circumference = 2 * Math.PI * 52; // r=52

  const overallLabel = data?.status === "healthy"
    ? (bn ? "সিস্টেম সুস্থ" : "System Healthy")
    : data?.status === "degraded"
      ? (bn ? "আংশিক সমস্যা" : "Partially Degraded")
      : data?.status === "unhealthy"
        ? (bn ? "সমস্যা সনাক্ত" : "Issues Detected")
        : (bn ? "চেক করুন" : "Run Check");

  const overallEmoji = data?.status === "healthy" ? "✅" : data?.status === "degraded" ? "⚠️" : data?.status === "unhealthy" ? "❌" : "🔍";

  // Time since last check
  const [timeSince, setTimeSince] = useState("");
  useEffect(() => {
    if (!dataUpdatedAt) return;
    const tick = () => {
      const diff = Math.floor((Date.now() - dataUpdatedAt) / 1000);
      if (diff < 60) setTimeSince(bn ? `${diff} সেকেন্ড আগে` : `${diff}s ago`);
      else setTimeSince(bn ? `${Math.floor(diff / 60)} মিনিট আগে` : `${Math.floor(diff / 60)}m ago`);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [dataUpdatedAt, bn]);

  return (
    <div className="space-y-6">
      {/* ── Hero Score Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-elevated p-6 relative overflow-hidden"
      >
        {/* Background glow */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            background: `radial-gradient(circle at 30% 50%, ${ringColor} 0%, transparent 70%)`,
          }}
        />

        <div className="relative flex flex-col sm:flex-row items-center gap-6">
          {/* Score Ring */}
          <div className="relative w-28 h-28 shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" opacity="0.3" />
              <motion.circle
                cx="60" cy="60" r="52" fill="none"
                stroke={ringColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: circumference - (score / 100) * circumference }}
                transition={{ duration: 1.2, ease: "easeOut" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span
                key={score}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-3xl font-black text-card-foreground"
              >
                {isLoading ? "—" : score}
              </motion.span>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {bn ? "স্কোর" : "Score"}
              </span>
            </div>
          </div>

          {/* Summary */}
          <div className="flex-1 text-center sm:text-left space-y-2">
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <Rocket className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-black text-card-foreground">
                {bn ? "লঞ্চ রেডিনেস" : "Launch Readiness"}
              </h2>
            </div>
            <p className="text-sm font-semibold">
              {overallLabel} {overallEmoji}
            </p>
            <Progress value={score} className="h-2.5 rounded-full" />

            {/* Status pills */}
            <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <CheckCircle2 className="w-3 h-3" /> {summary.pass} {bn ? "পাস" : "pass"}
              </span>
              {summary.warn > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                  <AlertTriangle className="w-3 h-3" /> {summary.warn} {bn ? "সতর্কতা" : "warn"}
                </span>
              )}
              {summary.fail > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                  <XCircle className="w-3 h-3" /> {summary.fail} {bn ? "ব্যর্থ" : "fail"}
                </span>
              )}
            </div>

            {/* Latency + time since */}
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              {data?.total_latency_ms != null && (
                <span className="inline-flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> {data.total_latency_ms}ms {bn ? "মোট" : "total"}
                </span>
              )}
              {timeSince && <span>{timeSince}</span>}
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              {bn ? "রিচেক" : "Recheck"}
            </Button>
            <Button
              size="sm"
              variant={autoRefresh ? "default" : "ghost"}
              className="gap-1.5 text-[10px] h-7"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <Activity className={`w-3 h-3 ${autoRefresh ? "animate-pulse" : ""}`} />
              {autoRefresh ? (bn ? "লাইভ ●" : "Live ●") : (bn ? "অটো বন্ধ" : "Auto Off")}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ── Individual Checks Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <AnimatePresence mode="popLayout">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={`skel-${i}`} className="card-elevated p-4 animate-pulse">
                  <div className="h-4 w-3/4 bg-muted rounded mb-2" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                </div>
              ))
            : checks.map((check, i) => {
                const meta = CHECK_META[check.name] ?? { icon: Activity, labelEn: check.name, labelBn: check.name };
                const cfg = STATUS_CFG[check.status];
                const StatusIcon = STATUS_ICON[check.status];
                const CheckIcon = meta.icon;
                const isOpen = expanded === check.name;

                return (
                  <motion.div
                    key={check.name}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`card-elevated p-4 border ${cfg.border} cursor-pointer transition-all hover:shadow-md active:scale-[0.99]`}
                    onClick={() => setExpanded(isOpen ? null : check.name)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${cfg.bg} transition-colors`}>
                        <CheckIcon className={`w-4 h-4 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-card-foreground truncate">
                            {bn ? meta.labelBn : meta.labelEn}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {check.latency_ms != null && (
                              <span className="text-[10px] text-muted-foreground tabular-nums">{check.latency_ms}ms</span>
                            )}
                            <StatusIcon className={`w-4 h-4 ${cfg.color}`} />
                          </div>
                        </div>
                      </div>
                    </div>
                    <AnimatePresence>
                      {isOpen && check.detail && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border leading-relaxed">
                            {check.detail}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
        </AnimatePresence>
      </div>

      {/* ── Timestamp ── */}
      {data?.timestamp && (
        <p className="text-center text-[10px] text-muted-foreground">
          {bn ? "সর্বশেষ চেক:" : "Last check:"}{" "}
          {new Date(data.timestamp).toLocaleString(bn ? "bn-BD" : "en-US")}
        </p>
      )}
    </div>
  );
}
