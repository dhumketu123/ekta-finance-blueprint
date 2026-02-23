import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { AlertTriangle, Brain, Phone, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

const PredictiveRiskWidget = () => {
  const { lang } = useLanguage();

  const { data: predictions } = useQuery({
    queryKey: ["reschedule-predictions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("view_reschedule_prediction_input" as any)
        .select("*")
        .order("probability_score", { ascending: false })
        .limit(10);
      return (data as any[]) || [];
    },
  });

  const { data: clientRisks } = useQuery({
    queryKey: ["client-risks"],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_risk")
        .select("*, clients:client_id(name_en, name_bn)")
        .order("probability_score", { ascending: false })
        .limit(10);
      return (data as any[]) || [];
    },
  });

  const { data: recommendations, refetch: refetchRecs } = useQuery({
    queryKey: ["preventive-recommendations"],
    queryFn: async () => {
      const { data } = await supabase.rpc("generate_preventive_recommendations");
      return data as any;
    },
  });

  const handleDetectRisks = async () => {
    const { error: e1 } = await supabase.rpc("detect_high_risk_clients");
    const { error: e2 } = await supabase.rpc("detect_officer_burnout");
    if (e1 || e2) {
      toast({ title: "Error", description: (e1 || e2)?.message, variant: "destructive" });
    } else {
      toast({ title: lang === "bn" ? "সফল" : "Success", description: "Risk detection completed" });
      refetchRecs();
    }
  };

  const highRiskPredictions = (predictions || []).filter((p: any) => p.probability_score >= 0.5);
  const recs = recommendations?.recommendations || [];

  const priorityColor = (priority: string) => {
    if (priority === "high") return "destructive";
    if (priority === "medium") return "warning" as any;
    return "secondary";
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case "follow_up_call": return <Phone className="w-3.5 h-3.5" />;
      case "redistribute_workload": return <Users className="w-3.5 h-3.5" />;
      case "early_reminder": return <RefreshCw className="w-3.5 h-3.5" />;
      default: return <AlertTriangle className="w-3.5 h-3.5" />;
    }
  };

  return (
    <>
      {/* Action Button */}
      <Button variant="outline" size="sm" onClick={handleDetectRisks}>
        <Brain className="w-4 h-4 mr-2" />
        {lang === "bn" ? "ঝুঁকি সনাক্তকরণ চালান" : "Run Risk Detection"}
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Risk Predictions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              {lang === "bn" ? "আসন্ন ঝুঁকি পূর্বাভাস" : "Upcoming Risk Predictions"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {highRiskPredictions.length > 0 ? (
              <div className="space-y-3">
                {highRiskPredictions.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div className="text-sm">
                      <p className="font-medium">{p.commitment_date}</p>
                      <p className="text-xs text-muted-foreground">
                        Officer reschedule: {p.officer_reschedule_pct}% · Client reschedules: {p.client_reschedule_count}
                      </p>
                    </div>
                    <Badge variant={p.probability_score >= 0.7 ? "destructive" : ("warning" as any)}>
                      {(p.probability_score * 100).toFixed(0)}%
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-6">
                {lang === "bn" ? "কোনো উচ্চ-ঝুঁকি পূর্বাভাস নেই" : "No high-risk predictions"}
              </p>
            )}
          </CardContent>
        </Card>

        {/* High-Risk Clients */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-destructive" />
              {lang === "bn" ? "উচ্চ ঝুঁকির গ্রাহক" : "High-Risk Clients"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(clientRisks || []).length > 0 ? (
              <div className="space-y-3">
                {(clientRisks || []).map((cr: any) => (
                  <div key={cr.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div className="text-sm">
                      <p className="font-medium">
                        {lang === "bn" ? cr.clients?.name_bn : cr.clients?.name_en}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {cr.reschedule_count_30d} reschedules · {cr.overdue_frequency} overdue
                      </p>
                    </div>
                    <Badge variant={cr.risk_level === "critical" ? "destructive" : ("warning" as any)}>
                      {cr.risk_level}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-6">
                {lang === "bn" ? "কোনো ফ্ল্যাগ করা গ্রাহক নেই" : "No flagged clients"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Preventive Recommendations */}
      {recs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              {lang === "bn" ? "প্রতিরোধমূলক সুপারিশ" : "Preventive Recommendations"}
              <Badge variant="secondary" className="ml-auto">{recs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recs.map((rec: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="mt-0.5">{typeIcon(rec.type)}</div>
                  <div className="flex-1 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{rec.target_name}</span>
                      <Badge variant={priorityColor(rec.priority)} className="text-[10px]">
                        {rec.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{rec.reason}</p>
                    <p className="text-xs font-medium mt-1 text-primary">{rec.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
};

export default PredictiveRiskWidget;
