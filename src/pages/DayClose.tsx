import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Lock, Unlock, CheckCircle2, AlertTriangle, XCircle, Clock, Send, ShieldCheck } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useDayClose, useReopenRequests } from "@/hooks/useDayClose";
import { useAuth } from "@/contexts/AuthContext";

const fmt = (n: number) =>
  new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 0 }).format(n);

const DayClose = () => {
  const today = format(new Date(), "yyyy-MM-dd");
  const { summary, submitClose, requestReopen, approveReopen } = useDayClose(today);
  const { role } = useAuth();
  const reopenRequests = useReopenRequests();

  const [declaredCash, setDeclaredCash] = useState("");
  const [note, setNote] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  const data = summary.data;
  const existing = data?.existing_close;
  const isClosed = existing?.status === "closed";
  const isReopened = existing?.status === "reopened";
  const isAdmin = role === "admin" || role === "owner" || role === "super_admin";

  const declaredNum = parseFloat(declaredCash) || 0;
  const liveVariance = declaredNum - (data?.expected_cash || 0);

  const varianceBadge = useMemo(() => {
    const v = isClosed ? (existing?.variance || 0) : liveVariance;
    if (!declaredCash && !isClosed) return null;
    if (v === 0) return { label: "ম্যাচ", color: "bg-emerald-500/15 text-emerald-700 border-emerald-300", icon: CheckCircle2 };
    if (v < 0) return { label: `ঘাটতি ${fmt(Math.abs(v))}`, color: "bg-red-500/15 text-red-700 border-red-300", icon: XCircle };
    return { label: `অতিরিক্ত ${fmt(v)}`, color: "bg-amber-500/15 text-amber-700 border-amber-300", icon: AlertTriangle };
  }, [isClosed, existing, liveVariance, declaredCash]);

  const handleSubmit = () => {
    if (!declaredCash) return;
    submitClose.mutate({ declaredCash: declaredNum, note: note || undefined });
  };

  const handleReopenRequest = () => {
    if (!reopenReason.trim() || !existing?.id) return;
    requestReopen.mutate({ closeId: existing.id, reason: reopenReason });
    setReopenReason("");
  };

  const SummaryRow = ({ label, value, bold }: { label: string; value: number; bold?: boolean }) => (
    <div className={`flex items-center justify-between py-2.5 ${bold ? "border-t-2 border-primary/20 pt-3" : ""}`}>
      <span className={`text-sm ${bold ? "font-bold text-foreground" : "text-muted-foreground"}`}>{label}</span>
      <span className={`tabular-nums ${bold ? "text-lg font-bold text-primary" : "text-sm font-semibold text-foreground"}`}>
        {fmt(value)}
      </span>
    </div>
  );

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            {isClosed ? <Lock className="h-6 w-6 text-primary" /> : <Unlock className="h-6 w-6 text-primary" />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">দৈনিক ক্যাশ ক্লোজ</h1>
            <p className="text-xs text-muted-foreground">{format(new Date(), "dd MMMM yyyy")} • {isClosed ? "বন্ধ" : isReopened ? "পুনরায় খোলা" : "চলমান"}</p>
          </div>
        </div>

        {/* Summary Card */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              আজকের সারসংক্ষেপ
            </CardTitle>
            <CardDescription>আজকের সমস্ত লেনদেনের সারাংশ</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {summary.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-8 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : data ? (
              <>
                <SummaryRow label="প্রারম্ভিক ব্যালেন্স" value={data.opening_balance} />
                <SummaryRow label="মোট আদায়" value={data.total_collection} />
                <SummaryRow label="মোট ব্যয়" value={data.total_expense} />
                <SummaryRow label="অভ্যন্তরীণ স্থানান্তর" value={data.internal_transfer} />
                <SummaryRow label="প্রত্যাশিত ক্যাশ" value={data.expected_cash} bold />
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Input / Closed State Card */}
        <Card className="border-0 shadow-lg">
          <CardContent className="pt-6 space-y-4">
            {isClosed && !isReopened ? (
              /* Closed state - show results */
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
              /* Open state - input form */
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">ঘোষিত ক্যাশ *</label>
                  <Input
                    type="number"
                    placeholder="হাতে থাকা ক্যাশ লিখুন"
                    value={declaredCash}
                    onChange={e => setDeclaredCash(e.target.value)}
                    className="text-right text-lg font-semibold tabular-nums h-12"
                    min={0}
                  />
                </div>

                {varianceBadge && declaredCash && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${varianceBadge.color}`}>
                    <varianceBadge.icon className="h-4 w-4" />
                    <span className="text-sm font-semibold">{varianceBadge.label}</span>
                  </div>
                )}

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

                <Button
                  onClick={handleSubmit}
                  disabled={!declaredCash || submitClose.isPending}
                  className="w-full h-12 text-base font-bold gap-2"
                >
                  <Lock className="h-4 w-4" />
                  {submitClose.isPending ? "প্রক্রিয়াকরণ..." : "দিন বন্ধ করুন"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Reopen Request (only if closed) */}
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

        {/* Admin: Pending Reopen Approvals */}
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
