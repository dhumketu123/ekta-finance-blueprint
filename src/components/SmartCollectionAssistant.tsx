import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, CheckCircle, Eye, Flame, Phone, Target, Zap } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";

interface CollectionTarget {
  client_id: string;
  name_en: string;
  name_bn: string;
  phone: string | null;
  area: string | null;
  risk_score: number;
  overdue_count: number;
  outstanding: number;
  action: "urgent_visit" | "follow_up" | "monitor" | "healthy";
}

const actionConfig = {
  urgent_visit: {
    en: "Urgent Visit Required",
    bn: "জরুরি ভিজিট প্রয়োজন",
    icon: Flame,
    badgeClass: "bg-destructive/15 text-destructive border-destructive/30",
  },
  follow_up: {
    en: "Follow-Up Needed",
    bn: "ফলোআপ প্রয়োজন",
    icon: Phone,
    badgeClass: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  },
  monitor: {
    en: "Monitor",
    bn: "মনিটর করুন",
    icon: Eye,
    badgeClass: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  },
  healthy: {
    en: "Healthy",
    bn: "সুস্থ",
    icon: CheckCircle,
    badgeClass: "bg-success/15 text-success border-success/30",
  },
};

const getAction = (riskScore: number): CollectionTarget["action"] => {
  if (riskScore >= 5) return "urgent_visit";
  if (riskScore >= 3) return "follow_up";
  if (riskScore >= 1) return "monitor";
  return "healthy";
};

export const useCollectionTargets = () =>
  useQuery({
    queryKey: ["collection_targets"],
    queryFn: async (): Promise<CollectionTarget[]> => {
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name_en, name_bn, phone, area, assigned_officer")
        .is("deleted_at", null)
        .in("status", ["active", "overdue"]);

      if (!clients?.length) return [];

      const clientIds = clients.map((c) => c.id);

      const { data: overdueData } = await supabase
        .from("loan_schedules")
        .select("client_id")
        .in("client_id", clientIds)
        .eq("status", "overdue");

      const { data: loanData } = await supabase
        .from("loans")
        .select("client_id, outstanding_principal, outstanding_interest, penalty_amount")
        .in("client_id", clientIds)
        .eq("status", "active")
        .is("deleted_at", null);

      const overdueMap = new Map<string, number>();
      (overdueData ?? []).forEach((s) => {
        overdueMap.set(s.client_id, (overdueMap.get(s.client_id) ?? 0) + 1);
      });

      const loanMap = new Map<string, number>();
      (loanData ?? []).forEach((l) => {
        loanMap.set(l.client_id, (loanMap.get(l.client_id) ?? 0) + Number(l.outstanding_principal) + Number(l.outstanding_interest));
      });

      return clients
        .map((c) => {
          const overdue = overdueMap.get(c.id) ?? 0;
          const outstanding = loanMap.get(c.id) ?? 0;
          const riskScore = overdue;
          return {
            client_id: c.id,
            name_en: c.name_en,
            name_bn: c.name_bn || c.name_en,
            phone: c.phone,
            area: c.area,
            risk_score: riskScore,
            overdue_count: overdue,
            outstanding,
            action: getAction(riskScore),
          };
        })
        .filter((c) => c.action !== "healthy")
        .sort((a, b) => b.risk_score - a.risk_score);
    },
    staleTime: 3 * 60 * 1000,
  });

interface SmartCollectionAssistantProps {
  maxItems?: number;
}

const SmartCollectionAssistant = ({ maxItems = 8 }: SmartCollectionAssistantProps) => {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const { data: targets, isLoading } = useCollectionTargets();

  const displayTargets = useMemo(() => (targets ?? []).slice(0, maxItems), [targets, maxItems]);

  const urgentCount = useMemo(() => (targets ?? []).filter((t) => t.action === "urgent_visit").length, [targets]);
  const followUpCount = useMemo(() => (targets ?? []).filter((t) => t.action === "follow_up").length, [targets]);

  if (isLoading) {
    return (
      <div className="card-elevated p-5 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded" />)}
        </div>
      </div>
    );
  }

  if (!displayTargets.length) {
    return (
      <div className="card-elevated p-5">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-card-foreground">
            {lang === "bn" ? "স্মার্ট কালেকশন সহকারী" : "Smart Collection Assistant"}
          </h3>
        </div>
        <div className="text-center py-4">
          <CheckCircle className="w-10 h-10 mx-auto text-success/50 mb-2" />
          <p className="text-xs text-muted-foreground">{lang === "bn" ? "সব ক্লায়েন্ট সুস্থ!" : "All clients healthy!"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card-elevated overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-card-foreground">
            {lang === "bn" ? "স্মার্ট কালেকশন সহকারী" : "Smart Collection Assistant"}
          </h3>
        </div>
        <div className="flex gap-1.5">
          {urgentCount > 0 && (
            <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]">
              {urgentCount} {lang === "bn" ? "জরুরি" : "urgent"}
            </Badge>
          )}
          {followUpCount > 0 && (
            <Badge className="bg-orange-500/15 text-orange-600 border-orange-500/30 text-[10px]">
              {followUpCount} {lang === "bn" ? "ফলোআপ" : "follow-up"}
            </Badge>
          )}
        </div>
      </div>

      <div className="divide-y divide-border">
        {displayTargets.map((t) => {
          const cfg = actionConfig[t.action];
          const Icon = cfg.icon;
          return (
            <div
              key={t.client_id}
              className="p-3 flex items-center gap-3 hover:bg-accent/50 transition-colors cursor-pointer"
              onClick={() => navigate(`/clients/${t.client_id}`)}
            >
              <div className={`w-9 h-9 rounded-lg ${cfg.badgeClass} flex items-center justify-center shrink-0 border`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold truncate">{lang === "bn" ? t.name_bn : t.name_en}</p>
                  <Badge className={`${cfg.badgeClass} border text-[10px] shrink-0`}>
                    {cfg[lang === "bn" ? "bn" : "en"]}
                  </Badge>
                </div>
                <div className="flex gap-2 mt-0.5 text-xs text-muted-foreground">
                  <span>{t.area || "—"}</span>
                  <span>•</span>
                  <span className="font-semibold text-foreground">৳{t.outstanding.toLocaleString()}</span>
                  <span>•</span>
                  <span className="text-destructive font-medium">{t.overdue_count} {lang === "bn" ? "বকেয়া" : "overdue"}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {(targets?.length ?? 0) > maxItems && (
        <div className="p-3 border-t border-border text-center">
          <Button size="sm" variant="ghost" className="text-xs text-primary" onClick={() => navigate("/risk-heatmap")}>
            {lang === "bn" ? "সব দেখুন" : "View All"} ({targets?.length})
          </Button>
        </div>
      )}
    </div>
  );
};

export default SmartCollectionAssistant;
