import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useTenantId";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "lucide-react";

type OnboardRole = "client" | "investor" | "officer";

interface OnboardEntry {
  name_en: string;
  name_bn: string;
  phone: string;
  area?: string;
  notes?: string;
}

interface OnboardResult {
  name: string;
  status: "success" | "failed";
  message: string;
}

const EMPTY_ENTRY: OnboardEntry = { name_en: "", name_bn: "", phone: "", area: "", notes: "" };

const BulkOnboarding = () => {
  const { lang, t } = useLanguage();
  const { user } = useAuth();
  const { tenantId } = useTenantId();
  const [activeRole, setActiveRole] = useState<OnboardRole>("client");
  const [entries, setEntries] = useState<OnboardEntry[]>([{ ...EMPTY_ENTRY }]);
  const [results, setResults] = useState<OnboardResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [csvText, setCsvText] = useState("");

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
          notes: "",
        });
      }
    }
    if (parsed.length > 0) {
      setEntries(parsed);
      toast.success(lang === "bn" ? `${parsed.length}টি এন্ট্রি পার্স হয়েছে` : `${parsed.length} entries parsed`);
    }
  };

  const handleBulkOnboard = async () => {
    if (!tenantId || !user?.id) {
      toast.error("Tenant or user not found");
      return;
    }

    const validEntries = entries.filter((e) => e.name_en.trim());
    if (validEntries.length === 0) {
      toast.error(lang === "bn" ? "অন্তত একটি নাম দিন" : "At least one name required");
      return;
    }

    setIsProcessing(true);
    setResults([]);
    const batchResults: OnboardResult[] = [];

    for (const entry of validEntries) {
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

        // Audit log
        await supabase.from("audit_logs").insert({
          action_type: "bulk_onboard",
          entity_type: activeRole,
          details: { name: entry.name_en, role: activeRole, method: "bulk_onboarding" },
          user_id: user.id,
          branch_id: null,
        });

        batchResults.push({ name: entry.name_en, status: "success", message: "✅" });
      } catch (err: any) {
        batchResults.push({ name: entry.name_en, status: "failed", message: err.message || "Error" });
      }
    }

    setResults(batchResults);
    const successCount = batchResults.filter((r) => r.status === "success").length;
    const failCount = batchResults.filter((r) => r.status === "failed").length;

    if (successCount > 0) {
      toast.success(
        lang === "bn"
          ? `${successCount}টি ${activeRole} সফলভাবে যোগ হয়েছে`
          : `${successCount} ${activeRole}(s) onboarded successfully`
      );
    }
    if (failCount > 0) {
      toast.error(
        lang === "bn" ? `${failCount}টি ব্যর্থ হয়েছে` : `${failCount} failed`
      );
    }

    setIsProcessing(false);
  };

  const roleConfig = {
    client: { icon: Users, color: "text-blue-500", label: lang === "bn" ? "গ্রাহক" : "Client" },
    investor: { icon: TrendingUp, color: "text-emerald-500", label: lang === "bn" ? "বিনিয়োগকারী" : "Investor" },
    officer: { icon: UserCog, color: "text-amber-500", label: lang === "bn" ? "মাঠকর্মী" : "Officer" },
  };

  return (
    <AppLayout>
      <PageHeader
        title={lang === "bn" ? "বাল্ক অনবোর্ডিং" : "Bulk Onboarding"}
        description={lang === "bn" ? "একসাথে একাধিক গ্রাহক/বিনিয়োগকারী/কর্মী যোগ করুন" : "Add multiple clients/investors/officers at once"}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="w-5 h-5 text-primary" />
            {lang === "bn" ? "রোল নির্বাচন করুন" : "Select Role"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeRole} onValueChange={(v) => { setActiveRole(v as OnboardRole); setResults([]); }}>
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
                      {lang === "bn" ? "CSV থেকে ইমপোর্ট (ঐচ্ছিক)" : "Import from CSV (optional)"}
                    </div>
                    <Textarea
                      placeholder={lang === "bn" ? "নাম (EN), নাম (BN), ফোন, এলাকা\nRahim, রহিম, 01711000101, উত্তর পাড়া" : "Name (EN), Name (BN), Phone, Area\nRahim, রহিম, 01711000101, North Para"}
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      rows={3}
                      className="text-xs font-mono"
                    />
                    <Button size="sm" variant="outline" onClick={parseCsv} className="gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      {lang === "bn" ? "পার্স করুন" : "Parse CSV"}
                    </Button>
                  </CardContent>
                </Card>

                {/* Manual Entry Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {lang === "bn" ? `${entries.length}টি এন্ট্রি` : `${entries.length} entries`}
                    </span>
                    <Button size="sm" variant="outline" onClick={addRow} className="gap-1">
                      <UserPlus className="w-3.5 h-3.5" />
                      {lang === "bn" ? "সারি যোগ" : "Add Row"}
                    </Button>
                  </div>

                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {entries.map((entry, idx) => (
                      <div key={idx} className="grid grid-cols-1 sm:grid-cols-5 gap-2 p-3 rounded-lg border bg-card">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">
                            {lang === "bn" ? "নাম (EN)" : "Name (EN)"}
                          </Label>
                          <Input
                            value={entry.name_en}
                            onChange={(e) => updateEntry(idx, "name_en", e.target.value)}
                            placeholder="Rahim"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">
                            {lang === "bn" ? "নাম (BN)" : "Name (BN)"}
                          </Label>
                          <Input
                            value={entry.name_bn}
                            onChange={(e) => updateEntry(idx, "name_bn", e.target.value)}
                            placeholder="রহিম"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">
                            {lang === "bn" ? "ফোন" : "Phone"}
                          </Label>
                          <Input
                            value={entry.phone}
                            onChange={(e) => updateEntry(idx, "phone", e.target.value)}
                            placeholder="01711000101"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">
                            {lang === "bn" ? "এলাকা" : "Area"}
                          </Label>
                          <Input
                            value={entry.area}
                            onChange={(e) => updateEntry(idx, "area", e.target.value)}
                            placeholder={lang === "bn" ? "উত্তর পাড়া" : "North Para"}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-destructive hover:text-destructive"
                            onClick={() => removeRow(idx)}
                            disabled={entries.length === 1}
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Officer note */}
                {role === "officer" && (
                  <div className="rounded-lg bg-accent border border-border p-3 text-xs text-accent-foreground">
                    {lang === "bn"
                      ? "⚠️ মাঠকর্মী যোগ করতে Settings → User Management ব্যবহার করুন। তাদের auth account দরকার।"
                      : "⚠️ To add officers, use Settings → User Management. They need auth accounts."}
                  </div>
                )}

                {/* Execute Button */}
                <Button
                  onClick={handleBulkOnboard}
                  disabled={isProcessing || role === "officer"}
                  className="w-full gap-2"
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {isProcessing
                    ? lang === "bn" ? "প্রসেসিং..." : "Processing..."
                    : lang === "bn" ? `${roleConfig[role].label} অনবোর্ড করুন` : `Onboard ${roleConfig[role].label}s`}
                </Button>
              </TabsContent>
            ))}
          </Tabs>

          {/* Results */}
          {results.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                {lang === "bn" ? "ফলাফল" : "Results"}
              </h3>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-md border text-xs">
                    <span>{r.name}</span>
                    <Badge variant={r.status === "success" ? "default" : "destructive"} className="text-[10px]">
                      {r.status === "success" ? "✅ Success" : `❌ ${r.message}`}
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span className="text-primary">
                  ✅ {results.filter((r) => r.status === "success").length}
                </span>
                <span className="text-destructive">
                  ❌ {results.filter((r) => r.status === "failed").length}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
};

export default BulkOnboarding;
