import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FlaskConical, Zap, AlertTriangle, CheckCircle2, ArrowRight,
  ToggleLeft, ToggleRight, Database, Code2, Settings2, Flag, Info, Trash2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

interface KnowledgeEntity {
  id: string;
  entity_category: string;
  entity_name: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
}

interface SimulationChange {
  type: "toggle_flag" | "change_criticality" | "remove_entity";
  entityName: string;
  oldValue: string;
  newValue: string;
}

const CRITICALITY_WEIGHT: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const CRITICALITY_CONFIG: Record<string, { color: string; label: string }> = {
  critical: { color: "bg-red-500", label: "ক্রিটিকাল" },
  high: { color: "bg-orange-500", label: "হাই" },
  medium: { color: "bg-yellow-500", label: "মিডিয়াম" },
  low: { color: "bg-emerald-500", label: "লো" },
};

function computeImpactScore(entity: KnowledgeEntity, allEntities: KnowledgeEntity[]): number {
  const relations = (entity.metadata?.relations as string[]) ?? [];
  const affects = (entity.metadata?.affects_entities as string[]) ?? [];
  const flags = (entity.metadata?.related_feature_flags as string[]) ?? [];
  const crit = (entity.metadata?.criticality as string) ?? "medium";
  const critWeight = CRITICALITY_WEIGHT[crit] ?? 2;
  const inbound = allEntities.filter((other) => {
    const r = (other.metadata?.relations as string[]) ?? [];
    const a = (other.metadata?.affects_entities as string[]) ?? [];
    return r.includes(entity.entity_name) || a.includes(entity.entity_name);
  }).length;
  return (relations.length * 2) + (affects.length * 3) + (flags.length * 2) + (inbound * 2) + (critWeight * 3);
}

export default function KnowledgeGraphSandbox() {
  const { lang } = useLanguage();
  const [changes, setChanges] = useState<SimulationChange[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  const { data: entities = [], isLoading } = useQuery({
    queryKey: ["knowledge_graph_sandbox"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_assistant_knowledge")
        .select("*")
        .order("entity_category")
        .order("entity_name");
      if (error) throw error;
      return (data ?? []) as unknown as KnowledgeEntity[];
    },
    staleTime: 60_000,
  });

  // Apply simulation changes to create a virtual graph
  const simulatedEntities = useMemo(() => {
    let result = [...entities];
    for (const change of changes) {
      if (change.type === "remove_entity") {
        result = result.filter((e) => e.entity_name !== change.entityName);
      } else if (change.type === "toggle_flag") {
        result = result.map((e) =>
          e.entity_name === change.entityName
            ? { ...e, metadata: { ...e.metadata, is_enabled: change.newValue === "true" } }
            : e
        );
      } else if (change.type === "change_criticality") {
        result = result.map((e) =>
          e.entity_name === change.entityName
            ? { ...e, metadata: { ...e.metadata, criticality: change.newValue } }
            : e
        );
      }
    }
    return result;
  }, [entities, changes]);

  // Compare original vs simulated impact
  const impactDiff = useMemo(() => {
    if (changes.length === 0) return null;

    const originalScores = entities.map((e) => ({
      name: e.entity_name,
      score: computeImpactScore(e, entities),
    }));
    const simScores = simulatedEntities.map((e) => ({
      name: e.entity_name,
      score: computeImpactScore(e, simulatedEntities),
    }));

    const diffs: Array<{ name: string; before: number; after: number; delta: number }> = [];
    for (const orig of originalScores) {
      const sim = simScores.find((s) => s.name === orig.name);
      const after = sim?.score ?? 0;
      if (orig.score !== after) {
        diffs.push({ name: orig.name, before: orig.score, after, delta: after - orig.score });
      }
    }
    // Entities removed
    const removedNames = changes.filter((c) => c.type === "remove_entity").map((c) => c.entityName);
    for (const name of removedNames) {
      const orig = originalScores.find((s) => s.name === name);
      if (orig) diffs.push({ name, before: orig.score, after: 0, delta: -orig.score });
    }

    return diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [entities, simulatedEntities, changes]);

  const addChange = useCallback((change: SimulationChange) => {
    setChanges((prev) => {
      const existing = prev.findIndex((c) => c.entityName === change.entityName && c.type === change.type);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = change;
        return updated;
      }
      return [...prev, change];
    });
  }, []);

  const removeChange = useCallback((index: number) => {
    setChanges((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const selectedObj = entities.find((e) => e.entity_name === selectedEntity);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mr-3" />
        স্যান্ডবক্স লোড হচ্ছে...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-purple-500" />
            {lang === "bn" ? "সিমুলেশন স্যান্ডবক্স" : "Simulation Sandbox"}
          </h3>
          <p className="text-xs text-muted-foreground">
            প্রোডাকশনে কোনো পরিবর্তন ছাড়াই "What-If" সিনারিও টেস্ট করুন
          </p>
        </div>
        {changes.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setChanges([])}>
            সব রিসেট ({changes.length})
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Entity Selector */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">এন্টিটি নির্বাচন</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-1">
                {entities.map((entity) => {
                  const crit = (entity.metadata?.criticality as string) ?? "medium";
                  const critCfg = CRITICALITY_CONFIG[crit] ?? CRITICALITY_CONFIG.medium;
                  const isChanged = changes.some((c) => c.entityName === entity.entity_name);
                  return (
                    <button
                      key={entity.id}
                      onClick={() => setSelectedEntity(entity.entity_name)}
                      className={`w-full text-left p-2 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                        selectedEntity === entity.entity_name ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"
                      } ${isChanged ? "border-l-2 border-purple-500" : ""}`}
                    >
                      <div className={`h-2 w-2 rounded-full shrink-0 ${critCfg.color}`} />
                      <span className="truncate flex-1">{entity.entity_name}</span>
                      {entity.entity_category === "feature_flag" && (
                        entity.metadata?.is_enabled ? <ToggleRight className="h-3 w-3 text-emerald-500" /> : <ToggleLeft className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Simulation Controls */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">সিমুলেশন কন্ট্রোল</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedObj ? (
              <>
                <div>
                  <p className="text-sm font-semibold">{selectedObj.entity_name}</p>
                  <p className="text-[10px] text-muted-foreground">{selectedObj.description?.slice(0, 80)}</p>
                </div>

                {/* Change Criticality */}
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">ক্রিটিক্যালিটি পরিবর্তন</label>
                  <Select
                    value={(selectedObj.metadata?.criticality as string) ?? "medium"}
                    onValueChange={(val) =>
                      addChange({
                        type: "change_criticality",
                        entityName: selectedObj.entity_name,
                        oldValue: (selectedObj.metadata?.criticality as string) ?? "medium",
                        newValue: val,
                      })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CRITICALITY_CONFIG).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Toggle Flag */}
                {selectedObj.entity_category === "feature_flag" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs gap-2"
                    onClick={() =>
                      addChange({
                        type: "toggle_flag",
                        entityName: selectedObj.entity_name,
                        oldValue: String(!!selectedObj.metadata?.is_enabled),
                        newValue: String(!selectedObj.metadata?.is_enabled),
                      })
                    }
                  >
                    {selectedObj.metadata?.is_enabled ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                    ফ্ল্যাগ {selectedObj.metadata?.is_enabled ? "বন্ধ" : "চালু"} করুন
                  </Button>
                )}

                {/* Remove Entity */}
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full text-xs gap-2"
                  onClick={() =>
                    addChange({
                      type: "remove_entity",
                      entityName: selectedObj.entity_name,
                      oldValue: "present",
                      newValue: "removed",
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" /> এন্টিটি রিমুভ সিমুলেট
                </Button>

                {/* Current Impact Score */}
                <div className="pt-2 border-t">
                  <p className="text-[10px] text-muted-foreground mb-1">বর্তমান ইমপ্যাক্ট স্কোর</p>
                  <p className="text-2xl font-bold text-primary">{computeImpactScore(selectedObj, entities)}</p>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-xs">
                <Info className="h-6 w-6 mx-auto mb-2 opacity-30" />
                বাম থেকে একটি এন্টিটি নির্বাচন করুন
              </div>
            )}

            {/* Pending Changes */}
            {changes.length > 0 && (
              <div className="pt-2 border-t space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground">পেন্ডিং পরিবর্তন ({changes.length})</p>
                {changes.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px] bg-muted/50 rounded px-2 py-1">
                    <span className="truncate flex-1">
                      {c.type === "remove_entity" ? "🗑️" : c.type === "toggle_flag" ? "🔀" : "🎯"} {c.entityName}
                    </span>
                    <button onClick={() => removeChange(i)} className="text-destructive hover:text-destructive/80 ml-1">✕</button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Impact Preview */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" /> ইমপ্যাক্ট প্রিভিউ
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!impactDiff || impactDiff.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">
                {changes.length === 0 ? (
                  <>
                    <FlaskConical className="h-6 w-6 mx-auto mb-2 opacity-30" />
                    সিমুলেশন শুরু করতে পরিবর্তন করুন
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-emerald-500" />
                    কোনো ইমপ্যাক্ট পরিবর্তন সনাক্ত হয়নি
                  </>
                )}
              </div>
            ) : (
              <ScrollArea className="h-[350px]">
                <div className="space-y-2">
                  {impactDiff.map((diff) => (
                    <div key={diff.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs">
                      <span className="truncate flex-1 font-medium">{diff.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground">{diff.before}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className={diff.delta > 0 ? "text-red-500 font-semibold" : diff.delta < 0 ? "text-emerald-500 font-semibold" : ""}>
                          {diff.after}
                        </span>
                        <Badge variant={diff.delta > 0 ? "destructive" : "default"} className="text-[9px] h-4 px-1">
                          {diff.delta > 0 ? `+${diff.delta}` : diff.delta}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {impactDiff && impactDiff.length > 0 && (
              <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 inline mr-1" />
                {impactDiff.filter((d) => d.delta > 0).length} নোডে ঝুঁকি বৃদ্ধি, {impactDiff.filter((d) => d.delta < 0).length} নোডে ঝুঁকি হ্রাস
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
