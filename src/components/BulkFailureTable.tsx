import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ChannelResult } from "@/services/onboardingNotifier";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

interface OnboardResult {
  name: string;
  dbStatus: "success" | "failed";
  dbMessage: string;
  notifyResult?: {
    name: string;
    status: "success" | "failed";
    channels: ChannelResult[];
  };
}

interface BulkFailureTableProps {
  results: OnboardResult[];
}

const BulkFailureTable = ({ results }: BulkFailureTableProps) => {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const failedEntries = results.filter(
    (r) => r.dbStatus === "failed" || r.notifyResult?.status === "failed"
  );

  if (failedEntries.length === 0) return null;

  const toggleExpand = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  return (
    <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
      <h4 className="text-xs font-semibold flex items-center gap-1.5 text-destructive">
        <AlertTriangle className="w-3.5 h-3.5" />
        {t(`${failedEntries.length}টি ব্যর্থ এন্ট্রি`, `${failedEntries.length} Failed Entries`)}
      </h4>

      <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
        {failedEntries.map((entry) => {
          const isOpen = expanded.has(entry.name);
          const channels = entry.notifyResult?.channels || [];
          const failedChannels = channels.filter((c) => !c.ok);

          return (
            <div key={entry.name} className="rounded-md border bg-card text-xs">
              <button
                type="button"
                className="w-full flex items-center justify-between p-2 hover:bg-muted/40 transition-colors"
                onClick={() => toggleExpand(entry.name)}
              >
                <div className="flex items-center gap-2">
                  {channels.length > 0 ? (
                    isOpen ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <span className="w-3" />
                  )}
                  <span className="font-medium">{entry.name}</span>
                </div>
                <div className="flex gap-1.5">
                  <Badge variant={entry.dbStatus === "success" ? "secondary" : "destructive"} className="text-[9px]">
                    DB {entry.dbStatus === "success" ? "✅" : "❌"}
                  </Badge>
                  {entry.notifyResult && (
                    <Badge variant={entry.notifyResult.status === "success" ? "secondary" : "outline"} className="text-[9px]">
                      {t("নোটিফিকেশন", "Notify")} {failedChannels.length > 0 ? `❌ ${failedChannels.length}` : "✅"}
                    </Badge>
                  )}
                </div>
              </button>

              {isOpen && channels.length > 0 && (
                <div className="px-3 pb-2 pt-0.5 border-t space-y-1">
                  {entry.dbStatus === "failed" && (
                    <p className="text-destructive text-[10px]">DB: {entry.dbMessage}</p>
                  )}
                  {channels.map((ch) => (
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
