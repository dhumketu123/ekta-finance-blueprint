import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { MetricCard } from "@/components/dashboard/MetricCard";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MetricCardSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Shield, TrendingDown, Activity, RefreshCw, Eye, Phone, MessageSquare, ArrowRight, Zap, Target } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";

interface RiskPrediction {
  client_id: string;
  loan_id: string;
  client_name_en: string;
  client_name_bn: string;
  phone: string | null;
  risk_score: number;
  overdue_days: number;
  outstanding_principal: number;
  outstanding_interest: number;
  penalty_amount: number;
  next_due_date: string | null;
  predicted_7day_overdue: boolean;
  alert_type: string;
  total_installments: number;
  paid_installments: number;
  overdue_installments: number;
}

const useRiskPredictions = () =>
  useQuery({
    queryKey: ["risk_predictions"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("predict_loan_risk" as any);
      if (error) throw error;
      return data as any;
    },
    staleTime: 5 * 60 * 1000,
  });

const getRiskColor = (score: number) => {
  if (score >= 80) return "text-destructive";
  if (score >= 70) return "text-orange-500";
  if (score >= 40) return "text-yellow-500";
  return "text-success";
};

const getRiskBg = (score: number) => {
  if (score >= 80) return "bg-destructive/15 border-destructive/30";
  if (score >= 70) return "bg-orange-500/15 border-orange-500/30";
  if (score >= 40) return "bg-yellow-500/15 border-yellow-500/30";
  return "bg-success/15 border-success/30";
};

const getRiskLabel = (score: number, lang: string) => {
  if (score >= 80) return lang === "bn" ? "গুরুতর" : "Critical";
  if (score >= 70) return lang === "bn" ? "উচ্চ ঝুঁকি" : "High Risk";
  if (score >= 40) return lang === "bn" ? "মাঝারি" : "Medium";
  return lang === "bn" ? "নিম্ন" : "Low";
};

const getAlertIcon = (alertType: string) => {
  switch (alertType) {
    case "default_alert": return "🔴";
    case "escalation_alert": return "🟠";
    case "overdue_alert": return "⚠️";
    case "loan_due_today": return "📅";
    case "upcoming_reminder": return "🔔";
    default: return "✅";
  }
};

/** Phase 3: Predictive prompt — suggest next action based on risk profile */
const getActionPrompt = (p: RiskPrediction, lang: string): { text: string; icon: React.ReactNode; urgency: "critical" | "warn" | "info" } => {
  if (p.risk_score >= 80) {
    return {
      text: lang === "bn" ? "জরুরি ফলোআপ প্রয়োজন" : "Urgent follow-up needed",
      icon: <Zap className="w-3.5 h-3.5" />,
      urgency: "critical",
    };
  }
  if (p.overdue_days > 30) {
    return {
      text: lang === "bn" ? "এস্কেলেশন করুন" : "Escalate to management",
      icon: <ArrowRight className="w-3.5 h-3.5" />,
      urgency: "critical",
    };
  }
  if (p.overdue_days > 0) {
    return {
      text: lang === "bn" ? "ফোনে যোগাযোগ করুন" : "Call the client",
      icon: <Phone className="w-3.5 h-3.5" />,
      urgency: "warn",
    };
  }
  if (p.predicted_7day_overdue) {
    return {
      text: lang === "bn" ? "রিমাইন্ডার পাঠান" : "Send reminder",
      icon: <MessageSquare className="w-3.5 h-3.5" />,
      urgency: "warn",
    };
  }
  return {
    text: lang === "bn" ? "মনিটর করুন" : "Monitor",
    icon: <Target className="w-3.5 h-3.5" />,
    urgency: "info",
  };
};

const urgencyStyles = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  warn: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  info: "bg-muted text-muted-foreground border-border",
};

const RiskDashboard = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { data: riskData, isLoading, refetch, isFetching } = useRiskPredictions();
  const [sortBy, setSortBy] = useState<"risk" | "overdue" | "amount">("risk");
  const [alertFilter, setAlertFilter] = useState<string>("all");

  const predictions: RiskPrediction[] = riskData?.predictions ?? [];
  const totalScored = riskData?.total_scored ?? 0;
  const highRiskCount = riskData?.high_risk_count ?? 0;

  // KPIs
  const criticalCount = predictions.filter(p => p.risk_score >= 80).length;
  const overdueCount = predictions.filter(p => p.overdue_days > 0).length;
  const sevenDayRiskCount = predictions.filter(p => p.predicted_7day_overdue).length;
  const totalOutstanding = predictions.reduce((s, p) => s + p.outstanding_principal + p.outstanding_interest, 0);
  const atRiskAmount = predictions.filter(p => p.risk_score >= 40).reduce((s, p) => s + p.outstanding_principal, 0);
  const portfolioAtRisk = totalOutstanding > 0 ? ((atRiskAmount / totalOutstanding) * 100).toFixed(1) : "0";

  const expectedLoss = predictions.reduce((s, p) => s + (p.outstanding_principal + p.outstanding_interest) * (p.risk_score / 100), 0);
  const expectedRecovery = totalOutstanding - expectedLoss;

  // Filter + Sort (high-risk always on top for behavioral nudge)
  const filtered = alertFilter === "all" ? predictions : predictions.filter(p => p.alert_type === alertFilter);
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "risk") return b.risk_score - a.risk_score;
      if (sortBy === "overdue") return b.overdue_days - a.overdue_days;
      return (b.outstanding_principal + b.outstanding_interest) - (a.outstanding_principal + a.outstanding_interest);
    });
  }, [filtered, sortBy]);

  const top10 = sorted.slice(0, 10);

  // Risk Distribution counts
  const riskBuckets = useMemo(() => [
    { label: lang === "bn" ? "নিম্ন (0-39)" : "Low (0-39)", count: predictions.filter(p => p.risk_score < 40).length, color: "bg-success/15 text-success border-success/30", emoji: "✅" },
    { label: lang === "bn" ? "মাঝারি (40-69)" : "Medium (40-69)", count: predictions.filter(p => p.risk_score >= 40 && p.risk_score < 70).length, color: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30", emoji: "⚠️" },
    { label: lang === "bn" ? "উচ্চ (70-79)" : "High (70-79)", count: predictions.filter(p => p.risk_score >= 70 && p.risk_score < 80).length, color: "bg-orange-500/15 text-orange-600 border-orange-500/30", emoji: "🟠" },
    { label: lang === "bn" ? "গুরুতর (80+)" : "Critical (80+)", count: criticalCount, color: "bg-destructive/15 text-destructive border-destructive/30", emoji: "🔴" },
  ], [predictions, criticalCount, lang]);

  const alertTypes = [
    { key: "all", label: lang === "bn" ? "সব" : "All" },
    { key: "default_alert", label: lang === "bn" ? "গুরুতর" : "Critical" },
    { key: "escalation_alert", label: lang === "bn" ? "এস্কেলেশন" : "Escalation" },
    { key: "overdue_alert", label: lang === "bn" ? "বকেয়া" : "Overdue" },
    { key: "loan_due_today", label: lang === "bn" ? "আজ বকেয়া" : "Due Today" },
    { key: "upcoming_reminder", label: lang === "bn" ? "রিমাইন্ডার" : "Reminder" },
    { key: "low_risk", label: lang === "bn" ? "নিম্ন ঝুঁকি" : "Low Risk" },
  ];

  if (isLoading) {
    return (
      <AppLayout>
        <PageHeader title={lang === "bn" ? "ঝুঁকি ড্যাশবোর্ড" : "Risk Dashboard"} description={lang === "bn" ? "AI-ভিত্তিক ঋণ ঝুঁকি বিশ্লেষণ" : "AI-Predictive Loan Risk Analysis"} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </div>
        <TableSkeleton rows={5} cols={6} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title={lang === "bn" ? "ঝুঁকি ড্যাশবোর্ড" : "Risk Dashboard"}
        description={lang === "bn" ? "AI-ভিত্তিক ঋণ ঝুঁকি বিশ্লেষণ ও পূর্বাভাস" : "AI-Predictive Loan Risk Analysis & Forecasting"}
        actions={
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {lang === "bn" ? "রিফ্রেশ" : "Refresh"}
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        <MetricCard title={lang === "bn" ? "মোট স্কোরকৃত" : "Total Scored"} value={totalScored} subtitle={`${overdueCount} ${lang === "bn" ? "বকেয়া" : "overdue"}`} icon={<Activity className="w-5 h-5" />} />
        <MetricCard title={lang === "bn" ? "উচ্চ ঝুঁকি" : "High Risk"} value={highRiskCount} subtitle={`${criticalCount} ${lang === "bn" ? "গুরুতর" : "critical"}`} icon={<AlertTriangle className="w-5 h-5" />} variant="destructive" />
        <MetricCard title={lang === "bn" ? "পোর্টফোলিও ঝুঁকি" : "Portfolio at Risk"} value={`${portfolioAtRisk}%`} subtitle={`৳${(atRiskAmount / 1000).toFixed(0)}K ${lang === "bn" ? "ঝুঁকিতে" : "at risk"}`} icon={<TrendingDown className="w-5 h-5" />} variant="warning" />
        <MetricCard title={lang === "bn" ? "৭-দিনের পূর্বাভাস" : "7-Day Forecast"} value={sevenDayRiskCount} subtitle={lang === "bn" ? "সম্ভাব্য বকেয়া" : "predicted overdue"} icon={<Shield className="w-5 h-5" />} variant={sevenDayRiskCount > 0 ? "warning" : "success"} />
      </div>

      {/* Portfolio Impact + Storytelling */}
      {predictions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5">
          <div className="card-elevated p-5">
            <p className="text-sm text-muted-foreground font-semibold tracking-wide">{lang === "bn" ? "মোট বকেয়া" : "Total Outstanding"}</p>
            <p className="text-2xl font-extrabold text-foreground mt-1.5">৳{totalOutstanding.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{predictions.length} {lang === "bn" ? "টি সক্রিয় ঋণ" : "active loans"}</p>
          </div>
          <div className="card-elevated p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-destructive/5 rounded-bl-full" />
            <p className="text-sm text-muted-foreground font-semibold tracking-wide">{lang === "bn" ? "প্রত্যাশিত ক্ষতি" : "Expected Loss"}</p>
            <p className="text-2xl font-extrabold text-destructive mt-1.5">৳{Math.round(expectedLoss).toLocaleString()}</p>
            <p className="text-xs text-destructive/70 mt-1 font-medium">{totalOutstanding > 0 ? `${((expectedLoss / totalOutstanding) * 100).toFixed(1)}%` : "0%"} {lang === "bn" ? "ঝুঁকি-ভারিত" : "risk-weighted"}</p>
          </div>
          <div className="card-elevated p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-success/5 rounded-bl-full" />
            <p className="text-sm text-muted-foreground font-semibold tracking-wide">{lang === "bn" ? "প্রত্যাশিত রিকভারি" : "Expected Recovery"}</p>
            <p className="text-2xl font-extrabold text-success mt-1.5">৳{Math.round(expectedRecovery).toLocaleString()}</p>
            <p className="text-xs text-success/70 mt-1 font-medium">{totalOutstanding > 0 ? `${((expectedRecovery / totalOutstanding) * 100).toFixed(1)}%` : "0%"} {lang === "bn" ? "আদায়যোগ্য" : "recoverable"}</p>
          </div>
        </div>
      )}

      {/* Sort & Filter Controls */}
      <div className="flex gap-2.5 flex-wrap items-center">
        {([
          { key: "risk", label: lang === "bn" ? "ঝুঁকি স্কোর" : "Risk Score" },
          { key: "overdue", label: lang === "bn" ? "বকেয়া দিন" : "Overdue Days" },
          { key: "amount", label: lang === "bn" ? "বকেয়া পরিমাণ" : "Outstanding" },
        ] as const).map(s => (
          <Button key={s.key} size="sm" variant={sortBy === s.key ? "default" : "outline"} className="text-sm font-medium" onClick={() => setSortBy(s.key)}>
            {s.label}
          </Button>
        ))}
        <Select value={alertFilter} onValueChange={setAlertFilter}>
          <SelectTrigger className="w-[160px] h-9 text-sm">
            <SelectValue placeholder={lang === "bn" ? "সতর্কতা ফিল্টার" : "Alert Filter"} />
          </SelectTrigger>
          <SelectContent>
            {alertTypes.map(at => (
              <SelectItem key={at.key} value={at.key}>{at.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-xs font-medium ml-auto">
          {filtered.length} {lang === "bn" ? "ফলাফল" : "results"}
        </Badge>
      </div>

      {/* Top 10 Risky Clients with Action Prompts */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-bold text-card-foreground flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            {lang === "bn" ? "শীর্ষ ১০ ঝুঁকিপূর্ণ ক্লায়েন্ট" : "Top 10 Risky Clients"}
          </h2>
          <Badge variant="secondary" className="text-xs font-medium">
            {lang === "bn" ? `${totalScored} টি ঋণ বিশ্লেষিত` : `${totalScored} loans analyzed`}
          </Badge>
        </div>

        {predictions.length === 0 ? (
          <div className="p-8 text-center">
            <Shield className="w-12 h-12 mx-auto text-success/50 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              {lang === "bn" ? "কোনো সক্রিয় ঋণ পাওয়া যায়নি" : "No active loans found to analyze"}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block">
              <Table className="table-premium">
                <TableHeader className="table-header-premium">
                  <TableRow>
                    <TableHead>{lang === "bn" ? "ক্লায়েন্ট" : "Client"}</TableHead>
                    <TableHead>{lang === "bn" ? "ঝুঁকি স্কোর" : "Risk Score"}</TableHead>
                    <TableHead>{lang === "bn" ? "সতর্কতা" : "Alert"}</TableHead>
                    <TableHead>{lang === "bn" ? "বকেয়া দিন" : "Overdue"}</TableHead>
                    <TableHead>{lang === "bn" ? "বকেয়া পরিমাণ" : "Outstanding"}</TableHead>
                    <TableHead>{lang === "bn" ? "পরবর্তী পদক্ষেপ" : "Next Action"}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top10.map((p) => {
                    const action = getActionPrompt(p, lang);
                    return (
                      <TableRow key={p.loan_id} className="hover:bg-accent/50 transition-colors">
                        <TableCell>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{lang === "bn" ? p.client_name_bn : p.client_name_en}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {p.phone ? `📞 ${p.phone}` : "—"} · {p.paid_installments}/{p.total_installments} {lang === "bn" ? "কিস্তি" : "inst."}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="w-20">
                              <Progress value={p.risk_score} className="h-2.5" />
                            </div>
                            <span className={`text-sm font-bold ${getRiskColor(p.risk_score)}`}>{p.risk_score}</span>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 inline-block border ${getRiskBg(p.risk_score)} ${getRiskColor(p.risk_score)}`}>
                            {getRiskLabel(p.risk_score, lang)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-base">{getAlertIcon(p.alert_type)}</span>
                          {p.predicted_7day_overdue && (
                            <Badge variant="destructive" className="text-[10px] ml-1.5">7d</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`text-sm font-bold ${p.overdue_days > 30 ? "text-destructive" : p.overdue_days > 0 ? "text-orange-500" : "text-muted-foreground"}`}>
                            {p.overdue_days > 0 ? `${p.overdue_days}d` : "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-bold text-foreground">৳{(p.outstanding_principal + p.outstanding_interest).toLocaleString()}</p>
                            {p.penalty_amount > 0 && (
                              <p className="text-xs text-destructive font-medium mt-0.5">+৳{p.penalty_amount.toLocaleString()} {lang === "bn" ? "জরিমানা" : "penalty"}</p>
                            )}
                          </div>
                        </TableCell>
                        {/* Phase 3: Predictive Action Prompt */}
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border cursor-default ${urgencyStyles[action.urgency]}`}>
                                {action.icon}
                                {action.text}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">{lang === "bn" ? "ঝুঁকি স্কোর ও বকেয়া ভিত্তিক সুপারিশ" : "Recommendation based on risk score & overdue"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => navigate(`/clients/${p.client_id}`)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards with Action Prompts */}
            <div className="sm:hidden divide-y divide-border">
              {top10.map((p) => {
                const action = getActionPrompt(p, lang);
                return (
                  <div key={p.loan_id} className="p-4 cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/clients/${p.client_id}`)}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span>{getAlertIcon(p.alert_type)}</span>
                        <p className="text-base font-bold text-foreground">{lang === "bn" ? p.client_name_bn : p.client_name_en}</p>
                      </div>
                      <span className={`text-sm font-bold px-2.5 py-1 rounded-full border ${getRiskBg(p.risk_score)} ${getRiskColor(p.risk_score)}`}>
                        {p.risk_score}/100
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
                      <span className="text-foreground font-semibold">৳{(p.outstanding_principal + p.outstanding_interest).toLocaleString()}</span>
                      {p.overdue_days > 0 && <span className="text-destructive font-bold">{p.overdue_days}d</span>}
                      <span>{p.paid_installments}/{p.total_installments}</span>
                    </div>
                    {/* Mobile Action Prompt */}
                    <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-md border mt-2 ${urgencyStyles[action.urgency]}`}>
                      {action.icon}
                      {action.text}
                    </div>
                    <Progress value={p.risk_score} className="h-1.5 mt-2" />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Risk Distribution */}
      {predictions.length > 0 && (
        <div className="card-elevated p-5">
          <h3 className="text-base font-bold text-card-foreground mb-4">
            {lang === "bn" ? "ঝুঁকি বিতরণ" : "Risk Distribution"}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {riskBuckets.map(bucket => (
              <div key={bucket.label} className={`p-4 rounded-xl border ${bucket.color} cursor-pointer hover:scale-[1.02] transition-transform`}
                onClick={() => setAlertFilter(bucket.emoji === "🔴" ? "default_alert" : bucket.emoji === "🟠" ? "escalation_alert" : bucket.emoji === "⚠️" ? "overdue_alert" : "low_risk")}
              >
                <div className="flex items-center justify-between">
                  <p className="text-3xl font-extrabold">{bucket.count}</p>
                  <span className="text-2xl">{bucket.emoji}</span>
                </div>
                <p className="text-sm font-semibold mt-1.5">{bucket.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default RiskDashboard;
