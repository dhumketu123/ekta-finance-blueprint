import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
  checks: HealthCheck[];
}

const CHECK_META: Record<string, { icon: React.ElementType; labelEn: string; labelBn: string }> = {
  database:        { icon: Database,  labelEn: "Database Connection",   labelBn: "ডাটাবেস সংযোগ" },
  tenant_rules:    { icon: Cog,       labelEn: "Tenant Business Rules", labelBn: "টেন্যান্ট নিয়মাবলী" },
  quantum_config:  { icon: Zap,       labelEn: "System Configuration",  labelBn: "সিস্টেম কনফিগ" },
  feature_flags:   { icon: Activity,  labelEn: "Feature Flags",         labelBn: "ফিচার ফ্ল্যাগ" },
  cron_activity:   { icon: RefreshCw, labelEn: "Background Jobs (24h)", labelBn: "ব্যাকগ্রাউন্ড জব (২৪ঘ)" },
  notifications:   { icon: Bell,      labelEn: "Notification Delivery", labelBn: "বিজ্ঞপ্তি ডেলিভারি" },
  loan_portfolio:  { icon: Wallet,    labelEn: "Loan Portfolio Health",  labelBn: "ঋণ পোর্টফোলিও স্বাস্থ্য" },
  rls_enforcement: { icon: Shield,    labelEn: "Security (RLS)",        labelBn: "নিরাপত্তা (RLS)" },
};

const statusConfig = {
  pass: { color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: CheckCircle2 },
  warn: { color: "text-amber-500",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   icon: AlertTriangle },
  fail: { color: "text-red-500",     bg: "bg-red-500/10",     border: "border-red-500/20",     icon: XCircle },
};

export default function LaunchReadinessPanel() {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<HealthResponse>({
    queryKey: ["system-health"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("system-health");
      if (error) throw error;
      return data as HealthResponse;
    },
    staleTime: 60_000,
    retry: 1,
  });

  const checks = data?.checks ?? [];
  const passCount = checks.filter((c) => c.status === "pass").length;
  const totalCount = checks.length;
  const score = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;

  const overallLabel = data?.status === "healthy"
    ? (bn ? "সিস্টেম সুস্থ ✅" : "System Healthy ✅")
    : data?.status === "degraded"
      ? (bn ? "আংশিক সমস্যা ⚠️" : "Partially Degraded ⚠️")
      : data?.status === "unhealthy"
        ? (bn ? "সমস্যা সনাক্ত ❌" : "Issues Detected ❌")
        : (bn ? "চেক করুন" : "Run Check");

  return (
    <div className="space-y-6">
      {/* Hero Score Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-elevated p-6 relative overflow-hidden"
      >
        {/* Background glow */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            background: `radial-gradient(circle at 30% 50%, ${
              score >= 80 ? "hsl(var(--success))" : score >= 50 ? "hsl(var(--warning))" : "hsl(var(--destructive))"
            } 0%, transparent 70%)`,
          }}
        />

        <div className="relative flex flex-col sm:flex-row items-center gap-6">
          {/* Score Ring */}
          <div className="relative w-28 h-28 shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
              <circle
                cx="60" cy="60" r="52" fill="none"
                stroke={score >= 80 ? "hsl(var(--success))" : score >= 50 ? "hsl(var(--warning))" : "hsl(var(--destructive))"}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 327} 327`}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-card-foreground">{isLoading ? "—" : score}</span>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {bn ? "স্কোর" : "Score"}
              </span>
            </div>
          </div>

          {/* Summary */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center gap-2 justify-center sm:justify-start mb-1">
              <Rocket className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-black text-card-foreground">
                {bn ? "লঞ্চ রেডিনেস" : "Launch Readiness"}
              </h2>
            </div>
            <p className="text-sm font-semibold mb-2">{overallLabel}</p>
            <Progress
              value={score}
              className="h-2.5 rounded-full"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground">
                {passCount}/{totalCount} {bn ? "পাস" : "passed"}
              </span>
              {data?.total_latency_ms && (
                <span className="text-[10px] text-muted-foreground">
                  {data.total_latency_ms}ms
                </span>
              )}
            </div>
          </div>

          {/* Refresh */}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs shrink-0"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {bn ? "রিচেক" : "Recheck"}
          </Button>
        </div>
      </motion.div>

      {/* Individual Checks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <AnimatePresence mode="popLayout">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="card-elevated p-4 animate-pulse">
                  <div className="h-4 w-3/4 bg-muted rounded mb-2" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                </div>
              ))
            : checks.map((check, i) => {
                const meta = CHECK_META[check.name] ?? { icon: Activity, labelEn: check.name, labelBn: check.name };
                const cfg = statusConfig[check.status];
                const StatusIcon = cfg.icon;
                const CheckIcon = meta.icon;
                const isOpen = expanded === check.name;

                return (
                  <motion.div
                    key={check.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`card-elevated p-4 border ${cfg.border} cursor-pointer transition-all hover:shadow-md`}
                    onClick={() => setExpanded(isOpen ? null : check.name)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${cfg.bg}`}>
                        <CheckIcon className={`w-4 h-4 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-card-foreground truncate">
                            {bn ? meta.labelBn : meta.labelEn}
                          </p>
                          <StatusIcon className={`w-4 h-4 shrink-0 ${cfg.color}`} />
                        </div>
                        {check.latency_ms !== undefined && (
                          <p className="text-[10px] text-muted-foreground">{check.latency_ms}ms</p>
                        )}
                      </div>
                    </div>
                    <AnimatePresence>
                      {isOpen && check.detail && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
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

      {/* Timestamp */}
      {data?.timestamp && (
        <p className="text-center text-[10px] text-muted-foreground">
          {bn ? "সর্বশেষ চেক:" : "Last check:"}{" "}
          {new Date(data.timestamp).toLocaleString(bn ? "bn-BD" : "en-US")}
        </p>
      )}
    </div>
  );
}
