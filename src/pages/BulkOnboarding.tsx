import { useState, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useTenantId";
import { toast } from "sonner";
import {
  notifyBulkOnboard,
  type OnboardEntry,
  type OnboardNotifyResult,
  type OnboardRole,
  type ChannelResult,
} from "@/services/onboardingNotifier";
import AppLayout from "@/components/AppLayout";
import BulkFailureTable from "@/components/BulkFailureTable";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  UserPlus,
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  FileSpreadsheet,
  TrendingUp,
  UserCog,
  RotateCcw,
  Inbox,
  Mail,
} from "lucide-react";

interface OnboardResult {
  name: string;
  dbStatus: "success" | "failed";
  dbMessage: string;
  notifyResult?: OnboardNotifyResult;
}

const EMPTY_ENTRY: OnboardEntry = { name_en: "", name_bn: "", phone: "", area: "", email: "", notes: "" };

const BulkOnboarding = () => {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const { tenantId } = useTenantId();
  const [activeRole, setActiveRole] = useState<OnboardRole>("client");
  const [entries, setEntries] = useState<OnboardEntry[]>([{ ...EMPTY_ENTRY }]);
  const [results, setResults] = useState<OnboardResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [progress, setProgress] = useState(0);

  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const addRow = () => setEntries((prev) => [...prev, { ...EMPTY_ENTRY }]);

  const updateEntry = (index: number, field: keyof OnboardEntry, value: string) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)));
  };

  const removeRow = (index: number) => {
    if (entries.length === 1) return;
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const parseCsv = () => {
    if (!csvText.trim()) return;
    const lines = csvText.trim().split("\n");
    const parsed: OnboardEntry[] = [];
    for (const line of lines) {
      const cols = line.split(",").map((c) => c.trim());
      if (cols.length >= 2) {
        parsed.push({
          name_en: cols[0] || "",
          name_bn: cols[1] || "",
          phone: cols[2] || "",
          area: cols[3] || "",
          email: cols[4] || "",
          notes: "",
        });
      }
    }
    if (parsed.length > 0) {
      setEntries(parsed);
      toast.success(t(`${parsed.length}টি এন্ট্রি পার্স হয়েছে`, `${parsed.length} entries parsed`));
    }
  };

  const handleBulkOnboard = async () => {
    if (!tenantId || !user?.id) {
      toast.error("Tenant or user not found");
      return;
    }
    const validEntries = entries.filter((e) => e.name_en.trim());
    if (validEntries.length === 0) {
      toast.error(t("অন্তত একটি নাম দিন", "At least one name required"));
      return;
    }

    setIsProcessing(true);
    setResults([]);
    setProgress(0);
    const batchResults: OnboardResult[] = [];
    const total = validEntries.length;

    for (let i = 0; i < total; i++) {
      const entry = validEntries[i];
      let dbStatus: "success" | "failed" = "success";
      let dbMessage = "✅";

      try {
        if (activeRole === "client") {
          const { error } = await supabase.from("clients").insert({
            name_en: entry.name_en.trim(),
            name_bn: entry.name_bn.trim() || entry.name_en.trim(),
            phone: entry.phone.trim() || null,
            area: entry.area?.trim() || null,
            tenant_id: tenantId,
            status: "active",
          });
          if (error) throw error;
        } else if (activeRole === "investor") {
          const { error } = await supabase.from("investors").insert({
            name_en: entry.name_en.trim(),
            name_bn: entry.name_bn.trim() || entry.name_en.trim(),
            phone: entry.phone.trim() || null,
            address: entry.area?.trim() || null,
            tenant_id: tenantId,
            capital: 0,
            principal_amount: 0,
            status: "active",
          });
          if (error) throw error;
        }

        await supabase.from("audit_logs").insert({
          action_type: "bulk_onboard",
          entity_type: activeRole,
          details: { name: entry.name_en, role: activeRole, method: "bulk_onboarding" },
          user_id: user.id,
          branch_id: null,
        });
      } catch (err: any) {
        dbStatus = "failed";
        dbMessage = err.message || "DB Error";
      }

      // Non-blocking notifications (only if DB succeeded)
      let notifyResult: OnboardNotifyResult | undefined;
      if (dbStatus === "success") {
        try {
          const nr = await notifyBulkOnboard([entry], activeRole, tenantId, user.id);
          notifyResult = nr[0];
        } catch {
          // swallow
        }
      }

      batchResults.push({ name: entry.name_en, dbStatus, dbMessage, notifyResult });
      setProgress(Math.round(((i + 1) / total) * 100));
      setResults([...batchResults]);
    }

    const successCount = batchResults.filter((r) => r.dbStatus === "success").length;
    const failCount = batchResults.filter((r) => r.dbStatus === "failed").length;

    if (successCount > 0) toast.success(t(`${successCount}টি সফল`, `${successCount} succeeded`));
    if (failCount > 0) toast.error(t(`${failCount}টি ব্যর্থ`, `${failCount} failed`));

    setIsProcessing(false);
  };

  const retryFailedNotifications = useCallback(async () => {
    if (!tenantId || !user?.id) return;
    const failed = results.filter((r) => r.dbStatus === "success" && r.notifyResult?.status === "failed");
    if (failed.length === 0) {
      toast.info(t("কোনো ব্যর্থ নোটিফিকেশন নেই", "No failed notifications to retry"));
      return;
    }

    setIsProcessing(true);
    const retryEntries: OnboardEntry[] = failed.map((r) => {
      const original = entries.find((e) => e.name_en === r.name);
      return original || { name_en: r.name, name_bn: r.name, phone: "" };
    });

    try {
      const retryResults = await notifyBulkOnboard(retryEntries, activeRole, tenantId, user.id);

      setResults((prev) =>
        prev.map((r) => {
          const retry = retryResults.find((rr) => rr.name === r.name);
          if (retry) return { ...r, notifyResult: retry };
          return r;
        })
      );

      const retried = retryResults.filter((r) => r.status === "success").length;
      const stillFailed = retryResults.filter((r) => r.status === "failed").length;
      if (retried > 0) toast.success(t(`${retried}টি রিট্রাই সফল`, `${retried} retried successfully`));
      if (stillFailed > 0) {
        const failedNames = retryResults.filter((r) => r.status === "failed").map((r) => r.name).join(", ");
        toast.error(t(`${stillFailed}টি এখনও ব্যর্থ: ${failedNames}`, `${stillFailed} still failed: ${failedNames}`));
        console.error("[BulkOnboarding] Retry failures:", retryResults.filter((r) => r.status === "failed"));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[BulkOnboarding] Retry error:", err);
      toast.error(t(`রিট্রাই ত্রুটি: ${msg}`, `Retry error: ${msg}`));
    }
    setIsProcessing(false);
  }, [results, entries, activeRole, tenantId, user?.id]);

  const roleConfig = {
    client: { icon: Users, color: "text-blue-500", label: t("গ্রাহক", "Client") },
    investor: { icon: TrendingUp, color: "text-emerald-500", label: t("বিনিয়োগকারী", "Investor") },
    officer: { icon: UserCog, color: "text-amber-500", label: t("মাঠকর্মী", "Officer") },
  };

  const hasFailedNotifications = results.some(
    (r) => r.dbStatus === "success" && r.notifyResult?.status === "failed"
  );

  return (
    <AppLayout>
      <PageHeader
        title={t("বাল্ক অনবোর্ডিং", "Bulk Onboarding")}
        description={t("একসাথে একাধিক গ্রাহক/বিনিয়োগকারী/কর্মী যোগ করুন", "Add multiple clients/investors/officers at once")}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="w-5 h-5 text-primary" />
            {t("রোল নির্বাচন করুন", "Select Role")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeRole} onValueChange={(v) => { setActiveRole(v as OnboardRole); setResults([]); setProgress(0); }}>
            <TabsList className="grid grid-cols-3 w-full">
              {(["client", "investor", "officer"] as OnboardRole[]).map((role) => {
                const cfg = roleConfig[role];
                const Icon = cfg.icon;
                return (
                  <TabsTrigger key={role} value={role} className="gap-1.5 text-xs">
                    <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                    {cfg.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {(["client", "investor", "officer"] as OnboardRole[]).map((role) => (
              <TabsContent key={role} value={role} className="space-y-4 mt-4">
                {/* CSV Import */}
                <Card className="border-dashed">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <FileSpreadsheet className="w-4 h-4" />
                      {t("CSV থেকে ইমপোর্ট (ঐচ্ছিক)", "Import from CSV (optional)")}
                    </div>
                    <Textarea
                      placeholder={t(
                        "নাম (EN), নাম (BN), ফোন, এলাকা, ইমেইল\nRahim, রহিম, 01711000101, উত্তর পাড়া, rahim@mail.com",
                        "Name (EN), Name (BN), Phone, Area, Email\nRahim, রহিম, 01711000101, North Para, rahim@mail.com"
                      )}
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      rows={3}
                      className="text-xs font-mono"
                    />
                    <Button size="sm" variant="outline" onClick={parseCsv} className="gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      {t("পার্স করুন", "Parse CSV")}
                    </Button>
                  </CardContent>
                </Card>

                {/* Empty State */}
                {entries.length === 1 && !entries[0].name_en && (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
                    <Inbox className="w-12 h-12 opacity-40" />
                    <p className="text-sm">{t("কোনো এন্ট্রি নেই — সারি যোগ করুন বা CSV পেস্ট করুন", "No entries yet — add rows or paste CSV")}</p>
                  </div>
                )}

                {/* Manual Entry Table */}
                {(entries.length > 1 || entries[0]?.name_en) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {t(`${entries.length}টি এন্ট্রি`, `${entries.length} entries`)}
                      </span>
                      <Button size="sm" variant="outline" onClick={addRow} className="gap-1">
                        <UserPlus className="w-3.5 h-3.5" />
                        {t("সারি যোগ", "Add Row")}
                      </Button>
                    </div>

                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {entries.map((entry, idx) => (
                        <div key={idx} className="grid grid-cols-2 sm:grid-cols-6 gap-2 p-3 rounded-lg border bg-card hover:border-primary/30 transition-colors">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">{t("নাম (EN)", "Name (EN)")}</Label>
                            <Input value={entry.name_en} onChange={(e) => updateEntry(idx, "name_en", e.target.value)} placeholder="Rahim" className="h-8 text-xs" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">{t("নাম (BN)", "Name (BN)")}</Label>
                            <Input value={entry.name_bn} onChange={(e) => updateEntry(idx, "name_bn", e.target.value)} placeholder="রহিম" className="h-8 text-xs" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">{t("ফোন", "Phone")}</Label>
                            <Input value={entry.phone} onChange={(e) => updateEntry(idx, "phone", e.target.value)} placeholder="01711000101" className="h-8 text-xs" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">{t("এলাকা", "Area")}</Label>
                            <Input value={entry.area} onChange={(e) => updateEntry(idx, "area", e.target.value)} placeholder={t("উত্তর পাড়া", "North Para")} className="h-8 text-xs" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Mail className="w-3 h-3" /> {t("ইমেইল", "Email")}
                            </Label>
                            <Input value={entry.email} onChange={(e) => updateEntry(idx, "email", e.target.value)} placeholder="name@mail.com" className="h-8 text-xs" type="email" />
                          </div>
                          <div className="flex items-end">
                            <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive" onClick={() => removeRow(idx)} disabled={entries.length === 1}>
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Officer note */}
                {role === "officer" && (
                  <div className="rounded-lg bg-accent border border-border p-3 text-xs text-accent-foreground">
                    {t(
                      "⚠️ মাঠকর্মী যোগ করতে Settings → User Management ব্যবহার করুন। তাদের auth account দরকার।",
                      "⚠️ To add officers, use Settings → User Management. They need auth accounts."
                    )}
                  </div>
                )}

                {/* Progress Bar */}
                {isProcessing && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{t("প্রসেসিং...", "Processing...")}</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                )}

                {/* Execute Button */}
                <Button onClick={handleBulkOnboard} disabled={isProcessing || role === "officer"} className="w-full gap-2">
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {isProcessing
                    ? t("প্রসেসিং...", "Processing...")
                    : t(`${roleConfig[role].label} অনবোর্ড করুন`, `Onboard ${roleConfig[role].label}s`)}
                </Button>
              </TabsContent>
            ))}
          </Tabs>

          {/* Results */}
          {results.length > 0 && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  {t("ফলাফল", "Results")}
                </h3>
                {hasFailedNotifications && (
                  <Button size="sm" variant="outline" onClick={retryFailedNotifications} disabled={isProcessing} className="gap-1.5 text-xs">
                    <RotateCcw className="w-3.5 h-3.5" />
                    {t("ব্যর্থ রিট্রাই", "Retry Failed")}
                  </Button>
                )}
              </div>

              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {results.map((r, i) => (
                  <div key={i} className="p-2.5 rounded-md border text-xs space-y-1 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{r.name}</span>
                      <Badge variant={r.dbStatus === "success" ? "default" : "destructive"} className="text-[10px]">
                        {r.dbStatus === "success" ? "✅ DB" : `❌ ${r.dbMessage}`}
                      </Badge>
                    </div>
                    {r.notifyResult && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {r.notifyResult.channels.map((ch, ci) => (
                          <Badge key={ci} variant={ch.ok ? "secondary" : "outline"} className="text-[9px] gap-0.5">
                            {ch.ok ? "✅" : "❌"} {ch.channel}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-3 text-xs text-muted-foreground pt-1 border-t">
                <span className="text-primary">✅ {results.filter((r) => r.dbStatus === "success").length} {t("সফল", "success")}</span>
                <span className="text-destructive">❌ {results.filter((r) => r.dbStatus === "failed").length} {t("ব্যর্থ", "failed")}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
};

export default BulkOnboarding;
