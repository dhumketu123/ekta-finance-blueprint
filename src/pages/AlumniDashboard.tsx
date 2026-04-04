import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StatusBadge from "@/components/StatusBadge";
import { GraduationCap, FileText, Download, Clock } from "lucide-react";
import { formatLocalDate } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";

const AlumniDashboard = () => {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const bn = lang === "bn";

  // Fetch exit settlement
  const { data: settlement } = useQuery({
    queryKey: ["alumni_settlement", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("owner_exit_settlements" as any)
        .select("*")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!user?.id,
  });

  // Fetch historical profit shares
  const { data: profitHistory } = useQuery({
    queryKey: ["alumni_profit_history", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("owner_profit_shares")
        .select("*, owner_profit_distributions(period_month, net_profit)")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const totalEarned = (profitHistory ?? []).reduce((s, ps) => s + (ps.share_amount ?? 0), 0);

  return (
    <AppLayout>
      <PageHeader
        title={bn ? "Alumni ড্যাশবোর্ড" : "Alumni Dashboard"}
        description={bn ? "আপনার ঐতিহাসিক আর্থিক তথ্য" : "Your historical financial records"}
        badge="🎓 Alumni"
      />

      {/* Status Card */}
      <div className="card-elevated p-6 border-l-4 border-l-muted-foreground/50">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center">
            <GraduationCap className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{bn ? "Alumni স্ট্যাটাস" : "Alumni Status"}</h2>
            <p className="text-xs text-muted-foreground">
              {bn ? "আপনি সম্মানজনকভাবে পার্টনারশিপ থেকে বের হয়েছেন" : "You have honorably exited the partnership"}
            </p>
          </div>
        </div>
      </div>

      {/* Settlement Summary */}
      {settlement && (
        <div className="card-elevated p-5 space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <FileText className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider">
              {bn ? "সেটেলমেন্ট সারাংশ" : "Settlement Summary"}
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{bn ? "এক্সিট তারিখ" : "Exit Date"}</p>
              <p className="font-bold">{formatLocalDate(settlement.exit_date, lang, { short: true })}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{bn ? "সেবার সময়কাল" : "Tenure"}</p>
              <p className="font-bold">{(settlement.tenure_days / 365).toFixed(1)} {bn ? "বছর" : "years"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{bn ? "চূড়ান্ত পেআউট" : "Final Payout"}</p>
              <p className="font-bold text-primary">৳{settlement.final_payout?.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{bn ? "মোট মুনাফা" : "Total Profit"}</p>
              <p className="font-bold text-success">৳{totalEarned.toLocaleString()}</p>
            </div>
          </div>
          {settlement.legal_doc_url && (
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <a href={settlement.legal_doc_url} target="_blank" rel="noopener noreferrer">
                <Download className="w-3.5 h-3.5" />
                {bn ? "Exit MoU ডাউনলোড" : "Download Exit MoU"}
              </a>
            </Button>
          )}
        </div>
      )}

      {/* Historical Transactions */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
            {bn ? "ঐতিহাসিক মুনাফা বিতরণ" : "Historical Profit Distributions"}
          </h3>
        </div>
        {(profitHistory ?? []).length > 0 ? (
          <>
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{bn ? "মাস" : "Period"}</TableHead>
                    <TableHead>{bn ? "শেয়ার %" : "Share %"}</TableHead>
                    <TableHead>{bn ? "পরিমাণ" : "Amount"}</TableHead>
                    <TableHead>{bn ? "অবস্থা" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(profitHistory ?? []).map((ps) => (
                    <TableRow key={ps.id}>
                      <TableCell className="text-xs">
                        {ps.owner_profit_distributions
                          ? format(new Date((ps.owner_profit_distributions as any).period_month), "MMM yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{ps.share_percentage}%</TableCell>
                      <TableCell className="text-xs font-semibold">৳{ps.share_amount.toLocaleString()}</TableCell>
                      <TableCell><StatusBadge status={ps.payment_status === "paid" ? "active" : "pending"} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="sm:hidden divide-y divide-border">
              {(profitHistory ?? []).map((ps) => (
                <div key={ps.id} className="p-4 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-medium">
                      {ps.owner_profit_distributions
                        ? format(new Date((ps.owner_profit_distributions as any).period_month), "MMM yyyy")
                        : "—"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{ps.share_percentage}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">৳{ps.share_amount.toLocaleString()}</p>
                    <StatusBadge status={ps.payment_status === "paid" ? "active" : "pending"} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">{bn ? "কোনো রেকর্ড নেই" : "No records found"}</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default AlumniDashboard;
