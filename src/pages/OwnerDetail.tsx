import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import DetailField from "@/components/DetailField";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOwner } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import OwnerExitModal from "@/components/owner/OwnerExitModal";
import {
  Crown, Phone, Wallet, TrendingUp, PiggyBank, BarChart3,
  Calendar, CircleDollarSign, AlertTriangle, Trash2, LogOut,
} from "lucide-react";
import { MetricCardSkeleton } from "@/components/ui/skeleton";
import { ResponsiveContainer, AreaChart, Area, Tooltip as RechartsTooltip, CartesianGrid, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import TransactionAuthModal from "@/components/security/TransactionAuthModal";
import { toast } from "sonner";

const OwnerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const bn = lang === "bn";
  const isSuperAdmin = role === "super_admin";
  const { data: owner, isLoading } = useOwner(id || "");

  // Hard-delete state
  const [warningOpen, setWarningOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exitModalOpen, setExitModalOpen] = useState(false);

  // Fetch owner's profit share history
  const { data: profitShares } = useQuery({
    queryKey: ["owner_profit_shares", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("owner_profit_shares")
        .select("*, owner_profit_distributions(period_month, net_profit, distribution_status)")
        .eq("owner_id", id!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  // Fetch all distributions for chart
  const { data: distributions } = useQuery({
    queryKey: ["owner_distributions_chart", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("owner_profit_shares")
        .select("share_amount, created_at, payment_status")
        .eq("owner_id", id!)
        .order("created_at", { ascending: true })
        .limit(24);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <PageHeader title="..." />
        <div className="space-y-4">
          <div className="card-elevated p-6 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-muted" />
              <div className="space-y-2 flex-1">
                <div className="h-5 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-1/4" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!owner) {
    return (
      <AppLayout>
        <PageHeader title={t("detail.notFound")} />
        <div className="card-elevated p-8 text-center space-y-3">
          <Crown className="w-12 h-12 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">{t("detail.notFoundDesc")}</p>
        </div>
      </AppLayout>
    );
  }

  const name = bn ? owner.name_bn : owner.name_en;
  const nameEn = owner.name_en;
  const phone = owner.phone;

  // Calculate metrics from profit shares
  const totalProfitEarned = (profitShares ?? []).reduce((s, ps) => s + (ps.share_amount ?? 0), 0);
  const paidShares = (profitShares ?? []).filter((ps) => ps.payment_status === "paid");
  const pendingShares = (profitShares ?? []).filter((ps) => ps.payment_status === "pending");
  const totalPaid = paidShares.reduce((s, ps) => s + (ps.share_amount ?? 0), 0);
  const totalPending = pendingShares.reduce((s, ps) => s + (ps.share_amount ?? 0), 0);
  const avgSharePct = (profitShares ?? []).length > 0
    ? ((profitShares ?? []).reduce((s, ps) => s + (ps.share_percentage ?? 0), 0) / (profitShares ?? []).length).toFixed(1)
    : "0";

  // Chart data
  const chartData = (distributions ?? []).map((d) => ({
    month: format(new Date(d.created_at), "MMM yy"),
    amount: d.share_amount ?? 0,
  }));

  return (
    <AppLayout>
      <PageHeader title={name} description={`${bn ? "মালিক" : "Owner"} — ${owner.owner_id ?? owner.id.slice(0, 8)}`} />

      {/* Identity Card */}
      <div className="card-elevated p-6 border-l-4 border-l-warning">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-warning/10 flex items-center justify-center shrink-0">
            <Crown className="w-7 h-7 text-warning" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground truncate">{name}</h2>
            <span className="text-xs text-muted-foreground font-mono">{owner.owner_id ?? owner.id.slice(0, 8)}</span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          title={bn ? "মোট মুনাফা" : "Total Profit"}
          value={`৳${totalProfitEarned.toLocaleString()}`}
          icon={<TrendingUp className="w-5 h-5" />}
          variant="success"
        />
        <MetricCard
          title={bn ? "প্রাপ্ত" : "Received"}
          value={`৳${totalPaid.toLocaleString()}`}
          icon={<Wallet className="w-5 h-5" />}
          variant="default"
        />
        <MetricCard
          title={bn ? "বকেয়া" : "Pending"}
          value={`৳${totalPending.toLocaleString()}`}
          icon={<PiggyBank className="w-5 h-5" />}
          variant="warning"
        />
        <MetricCard
          title={bn ? "গড় শেয়ার" : "Avg Share %"}
          value={`${avgSharePct}%`}
          icon={<BarChart3 className="w-5 h-5" />}
          variant="default"
        />
      </div>

      {/* Profit Chart */}
      {chartData.length > 0 && (
        <div className="card-elevated p-5 space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <CircleDollarSign className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider">{bn ? "মুনাফা প্রবণতা" : "Profit Trend"}</h3>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="ownerProfitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <RechartsTooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [`৳${value.toLocaleString()}`, bn ? "মুনাফা" : "Profit"]}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="hsl(var(--success))"
                  strokeWidth={2}
                  fill="url(#ownerProfitGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Contact Details */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Phone className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.details")}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <DetailField label={t("table.name")} value={name} />
          <DetailField label={t("detail.nameEn")} value={nameEn} />
          <DetailField label={t("table.phone")} value={phone || "—"} />
        </div>
      </div>

      {/* Recent Profit Distributions */}
      {(profitShares ?? []).length > 0 && (
        <div className="card-elevated overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
              {bn ? "সাম্প্রতিক মুনাফা বিতরণ" : "Recent Profit Distributions"}
            </h3>
          </div>
          <div className="hidden sm:block">
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
                  <TableHead>{bn ? "মাস" : "Period"}</TableHead>
                  <TableHead>{bn ? "শেয়ার %" : "Share %"}</TableHead>
                  <TableHead>{bn ? "পরিমাণ" : "Amount"}</TableHead>
                  <TableHead>{bn ? "অবস্থা" : "Status"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(profitShares ?? []).slice(0, 10).map((ps) => (
                  <TableRow key={ps.id}>
                    <TableCell className="text-xs font-medium">
                      {ps.owner_profit_distributions
                        ? format(new Date((ps.owner_profit_distributions as any).period_month), "MMM yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{ps.share_percentage}%</TableCell>
                    <TableCell className="text-xs font-semibold">৳{ps.share_amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <StatusBadge status={ps.payment_status === "paid" ? "active" : "pending"} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-border">
            {(profitShares ?? []).slice(0, 10).map((ps) => (
              <div key={ps.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">
                    {ps.owner_profit_distributions
                      ? format(new Date((ps.owner_profit_distributions as any).period_month), "MMM yyyy")
                      : "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{ps.share_percentage}% {bn ? "শেয়ার" : "share"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">৳{ps.share_amount.toLocaleString()}</p>
                  <StatusBadge status={ps.payment_status === "paid" ? "active" : "pending"} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state for no distributions */}
      {(profitShares ?? []).length === 0 && (
        <div className="card-elevated p-8 text-center space-y-3">
          <CircleDollarSign className="w-12 h-12 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground">
            {bn ? "এখনো কোনো মুনাফা বিতরণ হয়নি" : "No profit distributions yet"}
          </p>
        </div>
      )}

      {/* Super Admin: Hard Delete Management */}
      {isSuperAdmin && owner && (
        <div className="card-elevated p-5 space-y-4 border border-destructive/20">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider">
              {bn ? "সিস্টেম রিসেট (সুপার অ্যাডমিন)" : "System Reset (Super Admin)"}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {bn
              ? "এই অপশনটি শুধুমাত্র লঞ্চের আগে টেস্ট ডেটা মুছে ফেলার জন্য। এটি স্থায়ীভাবে auth অ্যাকাউন্ট ও সকল সংশ্লিষ্ট ডেটা মুছে ফেলবে।"
              : "This option is for clearing test data before launch. It will permanently delete the auth account and all associated data."}
          </p>
          <Button
            variant="destructive"
            size="sm"
            className="gap-2"
            onClick={() => setWarningOpen(true)}
            disabled={deleting}
          >
            <Trash2 className="w-4 h-4" />
            {bn ? "টেস্ট মালিক মুছুন (সিস্টেম রিসেট)" : "Delete Test Owner (System Reset)"}
          </Button>
        </div>
      )}

      {/* Step 1: Critical Warning Modal */}
      <Dialog open={warningOpen} onOpenChange={setWarningOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {bn ? "গুরুতর সতর্কতা" : "Critical Warning"}
            </DialogTitle>
            <DialogDescription className="text-sm pt-2 space-y-2">
              <span className="block font-semibold text-destructive">
                {bn
                  ? "⚠️ এই অপারেশন অপরিবর্তনীয়!"
                  : "⚠️ This operation is irreversible!"}
              </span>
              <span className="block">
                {bn
                  ? "এটি স্থায়ীভাবে এই মালিকের auth অ্যাকাউন্ট, প্রোফাইল, রোল এবং সকল সংশ্লিষ্ট টেস্ট ডেটা মুছে ফেলবে। এই কাজ আর পূর্বাবস্থায় ফেরানো যাবে না।"
                  : "This will permanently delete this owner's auth account, profile, role assignments, and all associated test data. This action cannot be undone."}
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setWarningOpen(false)}>
              {bn ? "বাতিল" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setWarningOpen(false);
                setPinOpen(true);
              }}
            >
              {bn ? "নিশ্চিত, পিন দিন" : "Confirm, Enter PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step 2: T-PIN Verification */}
      <TransactionAuthModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onAuthorized={async () => {
          setPinOpen(false);
          setDeleting(true);
          try {
            const { data, error } = await supabase.rpc("secure_delete_owner" as any, {
              _owner_user_id: id,
            });
            if (error) throw new Error(error.message);

            const result = data as unknown as { status: string; message: string };
            if (result.status === "error") {
              toast.error(result.message);
              return;
            }

            toast.success(bn ? "মালিক স্থায়ীভাবে মুছে ফেলা হয়েছে ✅" : "Owner permanently deleted ✅");
            queryClient.invalidateQueries({ queryKey: ["owners"] });
            navigate("/owners");
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Deletion failed";
            toast.error(message);
          } finally {
            setDeleting(false);
          }
        }}
      />
    </AppLayout>
  );
};

export default OwnerDetail;
