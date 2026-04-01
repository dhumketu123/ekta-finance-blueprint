import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTenantId } from "@/hooks/useTenantId";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import TransactionAuthModal from "@/components/security/TransactionAuthModal";
import { toast } from "sonner";
import { Vault, SplitSquareHorizontal, Scale, ArrowRight, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Method = "equal" | "pro_rata";

export default function TreasuryManagementCard() {
  const { lang } = useLanguage();
  const { tenantId } = useTenantId();
  const queryClient = useQueryClient();
  const bn = lang === "bn";

  const [selectedMethod, setSelectedMethod] = useState<Method | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Fetch treasury balance
  const { data: treasury, isLoading } = useQuery({
    queryKey: ["internal_treasury", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("internal_treasury")
        .eq("id", tenantId!)
        .single();
      if (error) throw error;
      return (data as any)?.internal_treasury ?? 0;
    },
    enabled: !!tenantId,
    staleTime: 10_000,
  });

  // Fetch active owners count & their shares
  const { data: activeOwners } = useQuery({
    queryKey: ["active_owner_shares", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investors")
        .select("id, name_en, name_bn, share_percentage, capital")
        .eq("tenant_id", tenantId!)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const treasuryPct = Number(treasury ?? 0);
  const ownerCount = activeOwners?.length ?? 0;
  const totalAllocated = (activeOwners ?? []).reduce((s, o) => s + (o.share_percentage ?? 0), 0);
  const globalTotal = totalAllocated + treasuryPct;

  const handleRedistribute = (method: Method) => {
    setSelectedMethod(method);
    setPinOpen(true);
  };

  const executeRedistribution = async () => {
    if (!selectedMethod) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.rpc("admin_redistribute_treasury" as any, {
        _method: selectedMethod,
      });
      if (error) throw error;
      const result = data as unknown as { status: string; message: string; amount_distributed?: number; owners_affected?: number };
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success(
        bn
          ? `✅ ট্রেজারি সফলভাবে বিতরণ হয়েছে — ${result.owners_affected} জন পার্টনারে`
          : `✅ Treasury redistributed to ${result.owners_affected} active partners`
      );
      queryClient.invalidateQueries({ queryKey: ["internal_treasury"] });
      queryClient.invalidateQueries({ queryKey: ["active_owner_shares"] });
      queryClient.invalidateQueries({ queryKey: ["investors"] });
    } catch (err: any) {
      toast.error(err.message || "Redistribution failed");
    } finally {
      setProcessing(false);
      setSelectedMethod(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="border border-primary/20 animate-pulse">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={cn(
        "relative overflow-hidden border-2",
        treasuryPct > 0 ? "border-warning/40 bg-warning/5" : "border-primary/20"
      )}>
        {/* Decorative */}
        <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-warning/5 blur-2xl" />

        <CardContent className="relative p-5 sm:p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-warning/10 border border-warning/20">
              <Vault className="w-5 h-5 text-warning" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {bn ? "🏛️ কোম্পানি ট্রেজারি পুল" : "🏛️ Company Treasury Pool"}
              </h3>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                {bn ? "সুপার অ্যাডমিন কন্ট্রোল" : "Super Admin Control"}
              </p>
            </div>
          </div>

          {/* Treasury Value */}
          <div className="p-4 rounded-xl bg-background/80 border border-border/50 space-y-1">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              {bn ? "ট্রেজারিতে অনাবণ্টিত ইকুইটি" : "Unallocated Equity in Treasury"}
            </p>
            <p className={cn(
              "text-3xl font-extrabold tracking-tight",
              treasuryPct > 0 ? "text-warning" : "text-muted-foreground"
            )}>
              {treasuryPct.toFixed(2)}%
            </p>
            <p className="text-[10px] text-muted-foreground">
              {bn
                ? `সক্রিয় পার্টনার: ${ownerCount} জন • বরাদ্দকৃত: ${totalAllocated.toFixed(2)}% • মোট: ${globalTotal.toFixed(2)}%`
                : `Active Partners: ${ownerCount} • Allocated: ${totalAllocated.toFixed(2)}% • Global: ${globalTotal.toFixed(2)}%`}
            </p>
          </div>

          {/* Active Owner Breakdown */}
          {(activeOwners ?? []).length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {bn ? "বর্তমান ইকুইটি বিতরণ" : "Current Equity Distribution"}
              </p>
              <div className="space-y-1.5">
                {(activeOwners ?? []).map((o) => (
                  <div key={o.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/30">
                    <span className="font-medium truncate max-w-[60%]">
                      {bn ? (o.name_bn || o.name_en) : o.name_en}
                    </span>
                    <span className="font-bold text-primary">{(o.share_percentage ?? 0).toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons — only show when treasury has equity */}
          {treasuryPct > 0 && (
            <div className="space-y-3 pt-2 border-t border-border/50">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {bn ? "ট্রেজারি ইকুইটি বিতরণ করুন" : "Redistribute Treasury Equity"}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-auto py-3 border-primary/30 hover:bg-primary/5 text-left justify-start"
                  disabled={processing}
                  onClick={() => handleRedistribute("equal")}
                >
                  <SplitSquareHorizontal className="w-4 h-4 text-primary shrink-0" />
                  <div>
                    <p className="text-xs font-semibold">{bn ? "সমানভাবে বিতরণ" : "Distribute Equally"}</p>
                    <p className="text-[10px] text-muted-foreground font-normal">
                      {bn
                        ? `প্রতি পার্টনার +${(treasuryPct / Math.max(ownerCount, 1)).toFixed(2)}%`
                        : `+${(treasuryPct / Math.max(ownerCount, 1)).toFixed(2)}% per partner`}
                    </p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-auto py-3 border-warning/30 hover:bg-warning/5 text-left justify-start"
                  disabled={processing}
                  onClick={() => handleRedistribute("pro_rata")}
                >
                  <Scale className="w-4 h-4 text-warning shrink-0" />
                  <div>
                    <p className="text-xs font-semibold">{bn ? "প্রো-রাটা (মূলধন অনুযায়ী)" : "Pro-Rata (by Capital)"}</p>
                    <p className="text-[10px] text-muted-foreground font-normal">
                      {bn ? "বেশি বিনিয়োগ = বেশি শেয়ার" : "Higher capital = higher share"}
                    </p>
                  </div>
                </Button>
              </div>
            </div>
          )}

          {/* Empty treasury state */}
          {treasuryPct === 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-success/5 border border-success/20">
              <ShieldCheck className="w-4 h-4 text-success shrink-0" />
              <p className="text-xs text-success font-medium">
                {bn ? "ট্রেজারি খালি — সকল ইকুইটি বরাদ্দকৃত" : "Treasury Empty — All equity allocated"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* T-PIN Auth */}
      <TransactionAuthModal
        open={pinOpen}
        onClose={() => { setPinOpen(false); setSelectedMethod(null); }}
        onAuthorized={() => {
          setPinOpen(false);
          executeRedistribution();
        }}
      />
    </>
  );
}
