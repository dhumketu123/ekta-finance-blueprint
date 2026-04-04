import { useState, useMemo } from "react";
import { format } from "date-fns";
import { formatLocalDate, formatLocalDateTime } from "@/lib/date-utils";
import {
  Lock, Unlock, CheckCircle2, AlertTriangle, XCircle, Clock, Send,
  ShieldCheck, Zap, TrendingUp, TrendingDown, Wallet, Copy,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDayClose, useReopenRequests } from "@/hooks/useDayClose";
import { useAuth } from "@/contexts/AuthContext";

const fmt = (n: number) =>
  new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 0 }).format(n);

// ─── Pulse Card ───
interface PulseCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  accent?: "green" | "red" | "highlight" | "default";
}

const PulseCard = ({ label, value, icon: Icon, accent = "default" }: PulseCardProps) => {
  const styles: Record<string, string> = {
    green: "border-emerald-500/30 bg-emerald-500/5",
    red: "border-red-500/30 bg-red-500/5",
    highlight: "border-primary/40 bg-primary/5 ring-1 ring-primary/20",
    default: "border-border bg-card",
  };
  const iconStyles: Record<string, string> = {
    green: "text-emerald-500 bg-emerald-500/10",
    red: "text-red-500 bg-red-500/10",
    highlight: "text-primary bg-primary/10",
    default: "text-muted-foreground bg-muted",
  };
  const valueStyles: Record<string, string> = {
    green: "text-emerald-600",
    red: "text-red-600",
    highlight: "text-primary font-extrabold",
    default: "text-foreground",
  };

  return (
    <div className={`rounded-xl border p-3 transition-all ${styles[accent]}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`p-1.5 rounded-lg ${iconStyles[accent]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[11px] font-medium text-muted-foreground leading-tight">{label}</span>
      </div>
      <p className={`text-base font-bold tabular-nums ${valueStyles[accent]}`}>{fmt(value)}</p>
    </div>
  );
};

// ─── Main ───
const DayClose = () => {
  const today = format(new Date(), "yyyy-MM-dd");
  const { summary, submitClose, requestReopen, approveReopen } = useDayClose(today);
  const { role } = useAuth();
  const reopenRequests = useReopenRequests();

  const [declaredCash, setDeclaredCash] = useState("");
  const [note, setNote] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  // Owner's Draw / Adjustment
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");

  const data = summary.data;
  const existing = data?.existing_close;
  const isClosed = existing?.status === "closed";
  const isReopened = existing?.status === "reopened";
  const isAdmin = role === "admin" || role === "owner" || role === "super_admin";

  const adjustNum = parseFloat(adjustmentAmount) || 0;
  const adjustedExpected = (data?.expected_cash || 0) - adjustNum;
  const declaredNum = parseFloat(declaredCash) || 0;
  const liveVariance = declaredNum - adjustedExpected;

  // Variance badge logic
  const varianceBadge = useMemo(() => {
    const v = isClosed ? (existing?.variance || 0) : liveVariance;
    if (!declaredCash && !isClosed) return null;
    if (v === 0) return { label: "ম্যাচ ✅", color: "bg-emerald-500/15 text-emerald-700 border-emerald-400", icon: CheckCircle2, type: "match" as const };
    if (v < 0) return { label: `ঘাটতি ${fmt(Math.abs(v))}`, color: "bg-red-500/15 text-red-700 border-red-400", icon: XCircle, type: "short" as const };
    return { label: `অতিরিক্ত ${fmt(v)}`, color: "bg-amber-500/15 text-amber-700 border-amber-400", icon: AlertTriangle, type: "excess" as const };
  }, [isClosed, existing, liveVariance, declaredCash]);

  // Input border color based on variance
  const inputBorderClass = useMemo(() => {
    if (!declaredCash) return "border-input";
    if (!varianceBadge) return "border-input";
    if (varianceBadge.type === "match") return "border-emerald-500 ring-1 ring-emerald-500/30";
    if (varianceBadge.type === "short") return "border-red-500 ring-1 ring-red-500/30";
    return "border-amber-500 ring-1 ring-amber-500/30";
  }, [declaredCash, varianceBadge]);

  const handleMatchExact = () => {
    setDeclaredCash(String(adjustedExpected));
  };

  const handleSubmit = () => {
    if (!declaredCash) return;
    submitClose.mutate({
      declaredCash: declaredNum,
      note: adjustNum > 0
        ? `${note || ""}${note ? " | " : ""}সমন্বয়: ${fmt(adjustNum)} (${adjustmentReason || "অন্যান্য"})`
        : note || undefined,
    });
  };

  const handleReopenRequest = () => {
    if (!reopenReason.trim() || !existing?.id) return;
    requestReopen.mutate({ closeId: existing.id, reason: reopenReason });
    setReopenReason("");
  };

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="w-full flex flex-col items-center justify-center text-center py-4 mb-2">
          <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 mb-3">
            🔐 {isClosed ? "বন্ধ" : isReopened ? "পুনরায় খোলা" : "চলমান"}
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-500">
            দৈনিক ক্যাশ ক্লোজ
          </h1>
          <p className="text-sm text-muted-foreground mt-2 font-medium">
            {formatLocalDate(new Date(), "bn")}
          </p>
        </div>

        {/* ═══ PULSE DASHBOARD (2x2 Grid) ═══ */}
        <div className="grid grid-cols-2 gap-3">
          <PulseCard label="গতকালকের জের" value={data?.opening_balance ?? 10000} icon={Wallet} />
          <PulseCard label="আজকের আদায়" value={data?.total_collection ?? 5000} icon={TrendingUp} accent="green" />
          <PulseCard label="আজকের ব্যয়/বিতরণ" value={data?.total_expense ?? 2000} icon={TrendingDown} accent="red" />
          <PulseCard label="বর্তমান সিস্টেম ক্যাশ" value={adjustedExpected || 13000} icon={Zap} accent="highlight" />
        </div>

        {/* ═══ INPUT / CLOSED STATE ═══ */}
        <Card className="border-0 shadow-lg">
          <CardContent className="pt-6 space-y-4">
            {isClosed && !isReopened ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">ঘোষিত ক্যাশ</span>
                  <span className="text-lg font-bold tabular-nums">{fmt(existing?.declared_cash || 0)}</span>
                </div>
                {varianceBadge && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${varianceBadge.color}`}>
                    <varianceBadge.icon className="h-4 w-4" />
                    <span className="text-sm font-semibold">{varianceBadge.label}</span>
                  </div>
                )}
                {existing?.note && (
                  <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">📝 {existing.note}</p>
                )}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  বন্ধ হয়েছে: {existing?.closed_at ? format(new Date(existing.closed_at), "hh:mm a") : ""}
                </div>
              </div>
            ) : (
              <>
                {/* Declared Cash Input + Match Button */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">ঘোষিত ক্যাশ *</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="হাতে থাকা ক্যাশ লিখুন"
                      value={declaredCash}
                      onChange={e => setDeclaredCash(e.target.value)}
                      className={`text-left text-lg font-semibold tabular-nums h-12 flex-1 transition-colors ${inputBorderClass}`}
                      min={0}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-12 w-12 shrink-0 border-primary/30 hover:bg-primary/10"
                      onClick={handleMatchExact}
                      title="ম্যাচ করুন"
                    >
                      <Copy className="h-4 w-4 text-primary" />
                    </Button>
                  </div>
                </div>

                {/* Live Variance Feedback */}
                {varianceBadge && declaredCash && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${varianceBadge.color}`}>
                    <varianceBadge.icon className="h-4 w-4" />
                    <span className="text-sm font-semibold">{varianceBadge.label}</span>
                  </div>
                )}

                {/* Note */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">নোট (ঐচ্ছিক)</label>
                  <Textarea
                    placeholder="কোনো মন্তব্য থাকলে লিখুন..."
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                </div>

                {/* ═══ OWNER'S DRAW / ADJUSTMENT ═══ */}
                <Separator />
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-amber-500" />
                    নগদ সমন্বয় / ব্যক্তিগত উত্তোলন
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">পরিমাণ</label>
                      <Input
                        type="number"
                        placeholder="৳ ০"
                        value={adjustmentAmount}
                        onChange={e => setAdjustmentAmount(e.target.value)}
                        className="h-10 text-left"
                        min={0}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">কারণ</label>
                      <Select value={adjustmentReason} onValueChange={setAdjustmentReason}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="বাছাই করুন" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="personal">ব্যক্তিগত</SelectItem>
                          <SelectItem value="petty_cash">খুচরা খরচ</SelectItem>
                          <SelectItem value="other">অন্যান্য</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {adjustNum > 0 && (
                    <p className="text-xs text-amber-600 bg-amber-500/10 px-2 py-1.5 rounded-md">
                      ⚡ সমন্বয়: {fmt(adjustNum)} বাদ → নতুন প্রত্যাশিত: {fmt(adjustedExpected)}
                    </p>
                  )}
                </div>

                {/* Submit */}
                <Button
                  onClick={handleSubmit}
                  disabled={!declaredCash || submitClose.isPending}
                  className="w-full h-12 text-base font-bold gap-2 active:scale-95 transition-transform"
                >
                  <Lock className="h-4 w-4" />
                  {submitClose.isPending ? "প্রক্রিয়াকরণ..." : "দিন বন্ধ করুন"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* ═══ REOPEN REQUEST ═══ */}
        {isClosed && (
          <Card className="border-0 shadow-lg border-l-4 border-l-amber-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Unlock className="h-4 w-4 text-amber-600" />
                পুনরায় খোলার অনুরোধ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="পুনরায় খোলার কারণ লিখুন *"
                value={reopenReason}
                onChange={e => setReopenReason(e.target.value)}
                rows={2}
                className="resize-none"
              />
              <Button
                variant="outline"
                onClick={handleReopenRequest}
                disabled={!reopenReason.trim() || requestReopen.isPending}
                className="w-full gap-2"
              >
                <Send className="h-4 w-4" />
                {requestReopen.isPending ? "পাঠানো হচ্ছে..." : "অনুরোধ পাঠান"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ═══ ADMIN APPROVAL PANEL ═══ */}
        {isAdmin && reopenRequests.data && reopenRequests.data.length > 0 && (
          <>
            <Separator />
            <Card className="border-0 shadow-lg border-l-4 border-l-primary">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  অপেক্ষমাণ অনুমোদন
                  <Badge variant="destructive" className="ml-auto">{reopenRequests.data.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {reopenRequests.data.map(req => (
                  <div key={req.id} className="flex items-start justify-between gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="space-y-1 flex-1">
                      <p className="text-sm font-medium">কারণ: {req.reason}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(req.requested_at), "dd/MM/yyyy hh:mm a")}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => approveReopen.mutate(req.id)}
                      disabled={approveReopen.isPending}
                      className="gap-1"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      অনুমোদন
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default DayClose;
