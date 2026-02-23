import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { Flame } from "lucide-react";

const BurnoutDetectionWidget = () => {
  const { lang } = useLanguage();

  const { data: burnoutOfficers } = useQuery({
    queryKey: ["burnout-officers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("officer_metrics")
        .select("*, profiles:officer_id(name_en, name_bn)")
        .eq("burnout_risk", true)
        .order("weekly_commitment_count", { ascending: false });
      return (data as any[]) || [];
    },
  });

  if (!burnoutOfficers || burnoutOfficers.length === 0) return null;

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Flame className="w-4 h-4 text-destructive" />
          {lang === "bn" ? "বার্নআউট ঝুঁকি সনাক্তকরণ" : "Burnout Risk Detection"}
          <Badge variant="destructive" className="ml-auto">{burnoutOfficers.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {burnoutOfficers.map((officer: any) => (
            <div key={officer.id} className="flex items-center justify-between p-3 rounded-lg bg-destructive/5">
              <div className="text-sm">
                <p className="font-medium">
                  {lang === "bn" ? officer.profiles?.name_bn : officer.profiles?.name_en || "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {lang === "bn" ? "সাপ্তাহিক কমিটমেন্ট" : "Weekly commitments"}: {officer.weekly_commitment_count} · 
                  {lang === "bn" ? " ব্যর্থতা" : " Failure"}: {officer.failure_rate}%
                </p>
              </div>
              <div className="text-right">
                <Badge variant="destructive">
                  {lang === "bn" ? "বার্নআউট" : "Burnout"}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  Risk: {officer.risk_score}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default BurnoutDetectionWidget;
