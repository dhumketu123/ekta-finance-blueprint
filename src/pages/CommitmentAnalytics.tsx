import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import MetricCard from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, ResponsiveContainer, Cell } from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";
import { Activity, AlertTriangle, CheckCircle, TrendingUp, Shield, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

const CommitmentAnalytics = () => {
  const { lang } = useLanguage();

  // KPI data from views
  const { data: swipeSuccess } = useQuery({
    queryKey: ["swipe-success-rate"],
    queryFn: async () => {
      const { data } = await supabase.from("view_swipe_success_rate").select("*").order("report_date", { ascending: false }).limit(30);
      return data || [];
    },
  });

  const { data: rescheduleRate } = useQuery({
    queryKey: ["reschedule-rate"],
    queryFn: async () => {
      const { data } = await supabase.from("view_reschedule_rate").select("*").order("report_date", { ascending: false }).limit(30);
      return data || [];
    },
  });

  const { data: officerPerformance } = useQuery({
    queryKey: ["officer-performance"],
    queryFn: async () => {
      const { data } = await supabase.from("view_officer_performance_summary").select("*").order("fulfillment_rate_pct", { ascending: false });
      return data || [];
    },
  });

  const { data: officerMetrics } = useQuery({
    queryKey: ["officer-metrics"],
    queryFn: async () => {
      const { data } = await supabase.from("officer_metrics").select("*").order("risk_score", { ascending: false });
      return (data as any[]) || [];
    },
  });

  const { data: chipUsage } = useQuery({
    queryKey: ["chip-usage"],
    queryFn: async () => {
      const { data } = await supabase.from("view_ai_chip_usage").select("*").order("usage_count", { ascending: false }).limit(10);
      return data || [];
    },
  });

  const { data: latestReport } = useQuery({
    queryKey: ["latest-executive-report"],
    queryFn: async () => {
      const { data } = await supabase.from("executive_reports").select("*").order("created_at", { ascending: false }).limit(1).single();
      return data as any;
    },
  });

  // Compute KPIs
  const latestSwipe = swipeSuccess?.[0];
  const latestReschedule = rescheduleRate?.[0];
  const totalOfficers = officerPerformance?.length || 0;
  const highRiskCount = officerMetrics?.filter((m: any) => m.risk_score >= 40).length || 0;

  // Recalculate risk scores
  const handleRecalculate = async () => {
    const { error } = await supabase.rpc("calculate_officer_risk_score");
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: lang === "bn" ? "সফল" : "Success", description: "Risk scores recalculated" });
    }
  };

  // Generate weekly report
  const handleGenerateReport = async () => {
    const { error } = await supabase.rpc("generate_weekly_intelligence_summary");
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: lang === "bn" ? "সফল" : "Success", description: "Weekly report generated" });
    }
  };

  // Failure trend chart data
  const failureTrend = (swipeSuccess || []).slice(0, 14).reverse().map((d: any) => ({
    date: d.report_date ? format(new Date(d.report_date), "MMM dd") : "",
    success: Number(d.success_rate_pct) || 0,
    failed: 100 - (Number(d.success_rate_pct) || 0),
  }));

  // Reschedule heatmap data
  const rescheduleHeatmap = (rescheduleRate || []).slice(0, 14).reverse().map((d: any) => ({
    date: d.report_date ? format(new Date(d.report_date), "MMM dd") : "",
    rate: Number(d.reschedule_rate_pct) || 0,
  }));

  const riskColor = (score: number) => {
    if (score >= 70) return "destructive";
    if (score >= 40) return "warning" as any;
    return "secondary";
  };

  return (
    <AppLayout>
      <PageHeader
        title={lang === "bn" ? "কমিটমেন্ট অ্যানালিটিক্স" : "Commitment Analytics"}
        description={lang === "bn" ? "এক্সিকিউটিভ ইন্টেলিজেন্স ড্যাশবোর্ড" : "Executive Intelligence Dashboard"}
      />

      {/* Action Buttons */}
      <div className="flex gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleRecalculate}>
          <Shield className="w-4 h-4 mr-2" />
          {lang === "bn" ? "রিস্ক স্কোর রিক্যালকুলেট" : "Recalculate Risk Scores"}
        </Button>
        <Button variant="outline" size="sm" onClick={handleGenerateReport}>
          <TrendingUp className="w-4 h-4 mr-2" />
          {lang === "bn" ? "সাপ্তাহিক রিপোর্ট তৈরি" : "Generate Weekly Report"}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title={lang === "bn" ? "সাফল্যের হার" : "Success Rate"}
          value={`${latestSwipe?.success_rate_pct || 0}%`}
          subtitle={`${latestSwipe?.total_success || 0} / ${latestSwipe?.total_actions || 0}`}
          icon={<CheckCircle className="w-5 h-5" />}
          variant="success"
        />
        <MetricCard
          title={lang === "bn" ? "রিশিডিউল হার" : "Reschedule Rate"}
          value={`${latestReschedule?.reschedule_rate_pct || 0}%`}
          subtitle={`${latestReschedule?.reschedule_count || 0} reschedules`}
          icon={<Activity className="w-5 h-5" />}
          variant="warning"
        />
        <MetricCard
          title={lang === "bn" ? "মোট অফিসার" : "Total Officers"}
          value={totalOfficers}
          subtitle={lang === "bn" ? "সক্রিয় অফিসার" : "Active officers"}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <MetricCard
          title={lang === "bn" ? "উচ্চ ঝুঁকি" : "High Risk"}
          value={highRiskCount}
          subtitle={lang === "bn" ? "ফ্ল্যাগড অফিসার" : "Flagged officers"}
          icon={<AlertTriangle className="w-5 h-5" />}
          variant="destructive"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Failure Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{lang === "bn" ? "সাফল্য/ব্যর্থতা ট্রেন্ড" : "Success/Failure Trend"}</CardTitle>
          </CardHeader>
          <CardContent>
            {failureTrend.length > 0 ? (
              <ChartContainer config={{ success: { label: "Success %", color: "hsl(var(--success))" }, failed: { label: "Failed %", color: "hsl(var(--destructive))" } }} className="h-[250px]">
                <LineChart data={failureTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="success" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="failed" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">{lang === "bn" ? "ডেটা নেই" : "No data available"}</p>
            )}
          </CardContent>
        </Card>

        {/* Reschedule Heatmap */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{lang === "bn" ? "রিশিডিউল হিটম্যাপ" : "Reschedule Heatmap"}</CardTitle>
          </CardHeader>
          <CardContent>
            {rescheduleHeatmap.length > 0 ? (
              <ChartContainer config={{ rate: { label: "Reschedule %", color: "hsl(var(--warning))" } }} className="h-[250px]">
                <BarChart data={rescheduleHeatmap}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                    {rescheduleHeatmap.map((entry: any, index: number) => (
                      <Cell key={index} fill={entry.rate > 40 ? "hsl(var(--destructive))" : entry.rate > 20 ? "hsl(var(--warning))" : "hsl(var(--success))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">{lang === "bn" ? "ডেটা নেই" : "No data available"}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Officer Ranking Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{lang === "bn" ? "অফিসার র‌্যাংকিং" : "Officer Ranking"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{lang === "bn" ? "নাম" : "Name"}</TableHead>
                <TableHead>{lang === "bn" ? "মোট" : "Total"}</TableHead>
                <TableHead>{lang === "bn" ? "সফল" : "Fulfilled"}</TableHead>
                <TableHead>{lang === "bn" ? "সাফল্য %" : "Rate %"}</TableHead>
                <TableHead>{lang === "bn" ? "ঝুঁকি" : "Risk"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(officerPerformance || []).map((officer: any, i: number) => {
                const metric = officerMetrics?.find((m: any) => m.officer_id === officer.officer_id);
                return (
                  <TableRow key={officer.officer_id}>
                    <TableCell className="font-medium">{i + 1}</TableCell>
                    <TableCell>{lang === "bn" ? officer.officer_name_bn : officer.officer_name_en}</TableCell>
                    <TableCell>{officer.total_actions}</TableCell>
                    <TableCell>{officer.total_fulfilled}</TableCell>
                    <TableCell className="font-semibold">{officer.fulfillment_rate_pct}%</TableCell>
                    <TableCell>
                      {metric ? (
                        <Badge variant={riskColor(metric.risk_score)}>
                          {metric.risk_level} ({metric.risk_score})
                        </Badge>
                      ) : (
                        <Badge variant="secondary">N/A</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!officerPerformance || officerPerformance.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {lang === "bn" ? "ডেটা নেই" : "No data available"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Latest Report Summary */}
      {latestReport && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{lang === "bn" ? "সর্বশেষ সাপ্তাহিক রিপোর্ট" : "Latest Weekly Report"}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-60">
              {JSON.stringify(latestReport.report_data, null, 2)}
            </pre>
            <p className="text-xs text-muted-foreground mt-2">
              Generated: {format(new Date(latestReport.generated_at), "PPpp")}
            </p>
          </CardContent>
        </Card>
      )}
    </AppLayout>
  );
};

export default CommitmentAnalytics;
