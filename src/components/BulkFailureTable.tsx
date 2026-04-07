import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ChannelResult } from "@/services/onboardingNotifier";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

type ReasonType = "duplicate" | "validation" | "system";

interface OnboardResult {
  name: string;
  dbStatus: "success" | "failed" | "skipped";
  dbMessage: string;
  reasonType?: ReasonType;
  notifyResult?: {
    name: string;
    status: "success" | "failed";
    channels: ChannelResult[];
  };
}

interface BulkFailureTableProps {
  results: OnboardResult[];
}

const reasonColors: Record<ReasonType, string> = {
  duplicate: "border-amber-400/40 bg-amber-500/5",
  validation: "border-destructive/40 bg-destructive/5",
  system: "border-destructive/60 bg-destructive/10",
};

const reasonBadgeVariant: Record<ReasonType, "secondary" | "destructive" | "outline"> = {
  duplicate: "secondary",
  validation: "destructive",
  system: "destructive",
};

const BulkFailureTable = ({ results }: BulkFailureTableProps) => {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const problemEntries = results.filter(
    (r) => r.dbStatus === "failed" || r.dbStatus === "skipped" || r.notifyResult?.status === "failed"
  );

  if (problemEntries.length === 0) return null;

  const toggleExpand = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const skipped = problemEntries.filter((r) => r.dbStatus === "skipped").length;
  const failed = problemEntries.filter((r) => r.dbStatus === "failed").length;

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <h4 className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
        <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
        {t(
          `${problemEntries.length}টি সমস্যাযুক্ত এন্ট্রি`,
          `${problemEntries.length} Problem Entries`
        )}
        {skipped > 0 && <Badge variant="secondary" className="text-[9px] ml-1">⚠️ {skipped} {t("বাদ", "skipped")}</Badge>}
        {failed > 0 && <Badge variant="destructive" className="text-[9px] ml-1">❌ {failed} {t("ব্যর্থ", "failed")}</Badge>}
      </h4>

      <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
        {problemEntries.map((entry, idx) => {
          const isOpen = expanded.has(entry.name + idx);
          const channels = entry.notifyResult?.channels || [];
          const failedChannels = channels.filter((c) => !c.ok);
          const reason = entry.reasonType || "system";
          const rowBorder = reasonColors[reason];

          return (
            <div key={entry.name + idx} className={`rounded-md border text-xs ${rowBorder}`}>
              <button
                type="button"
                className="w-full flex items-center justify-between p-2 hover:bg-muted/40 transition-colors"
                onClick={() => toggleExpand(entry.name + idx)}
              >
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                  <span className="font-medium">{entry.name}</span>
                </div>
                <div className="flex gap-1.5">
                  <Badge variant={reasonBadgeVariant[reason]} className="text-[9px]">
                    {entry.dbStatus === "skipped" ? "⚠️" : "❌"} {entry.reasonType || entry.dbStatus}
                  </Badge>
                  {entry.notifyResult && (
                    <Badge variant={entry.notifyResult.status === "success" ? "secondary" : "outline"} className="text-[9px]">
                      {t("নোটিফিকেশন", "Notify")} {failedChannels.length > 0 ? `❌ ${failedChannels.length}` : "✅"}
                    </Badge>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="px-3 pb-2 pt-0.5 border-t space-y-1">
                  <p className="text-[10px] text-muted-foreground">{entry.dbMessage}</p>
                  {channels.length > 0 && channels.map((ch) => (
                    <div key={ch.channel} className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">{ch.channel}</span>
                      <span className={ch.ok ? "text-primary" : "text-destructive font-medium"}>
                        {ch.ok ? "✅ " + t("সফল", "Success") : `❌ ${ch.detail}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BulkFailureTable;
