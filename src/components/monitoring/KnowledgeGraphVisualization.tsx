import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import {
  Database, Code2, Settings2, Flag, Search, X, ArrowRight,
  AlertTriangle, CheckCircle2, Info, Zap, Link2, Eye, EyeOff,
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

const CRITICALITY_CONFIG = {
  critical: { color: "bg-red-500", border: "border-red-500/50", text: "text-red-600", label: "ক্রিটিকাল" },
  high: { color: "bg-orange-500", border: "border-orange-500/50", text: "text-orange-600", label: "হাই" },
  medium: { color: "bg-yellow-500", border: "border-yellow-500/50", text: "text-yellow-600", label: "মিডিয়াম" },
  low: { color: "bg-emerald-500", border: "border-emerald-500/50", text: "text-emerald-600", label: "লো" },
};

const CATEGORY_CONFIG: Record<string, { icon: typeof Database; label: string; color: string; bgColor: string }> = {
  table: { icon: Database, label: "টেবিল", color: "text-blue-500", bgColor: "bg-blue-500/10" },
  edge_function: { icon: Code2, label: "এজ ফাংশন", color: "text-purple-500", bgColor: "bg-purple-500/10" },
  business_rule: { icon: Settings2, label: "বিজনেস রুল", color: "text-orange-500", bgColor: "bg-orange-500/10" },
  feature_flag: { icon: Flag, label: "ফিচার ফ্ল্যাগ", color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
};

function EntityNode({
  entity,
  isSelected,
  isRelated,
  isDimmed,
  onClick,
}: {
  entity: KnowledgeEntity;
  isSelected: boolean;
  isRelated: boolean;
  isDimmed: boolean;
  onClick: () => void;
}) {
  const criticality = (entity.metadata?.criticality as string) ?? "medium";
  const critConfig = CRITICALITY_CONFIG[criticality as keyof typeof CRITICALITY_CONFIG] ?? CRITICALITY_CONFIG.medium;
  const catConfig = CATEGORY_CONFIG[entity.entity_category] ?? CATEGORY_CONFIG.table;
  const Icon = catConfig.icon;
  const relations = (entity.metadata?.relations as string[]) ?? [];
  const affectsEntities = (entity.metadata?.affects_entities as string[]) ?? [];

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={`
              group relative p-3 rounded-xl border-2 transition-all duration-200 text-left w-full
              ${isSelected ? `ring-2 ring-primary shadow-lg scale-[1.02] ${critConfig.border}` : "border-border/60"}
              ${isRelated ? `${critConfig.border} shadow-md bg-accent/30` : ""}
              ${isDimmed ? "opacity-30 scale-95" : "opacity-100"}
              hover:shadow-md hover:scale-[1.01] active:scale-[0.99]
            `}
          >
            {/* Criticality dot */}
            <div className={`absolute top-2 right-2 h-2.5 w-2.5 rounded-full ${critConfig.color}`} />

            <div className="flex items-start gap-2">
              <div className={`p-1.5 rounded-lg ${catConfig.bgColor} shrink-0`}>
                <Icon className={`h-3.5 w-3.5 ${catConfig.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold truncate pr-4">{entity.entity_name}</p>
                <p className="text-[9px] text-muted-foreground truncate mt-0.5">
                  {entity.description?.slice(0, 60) ?? "—"}
                </p>
              </div>
            </div>

            {/* Relation count badge */}
            {(relations.length > 0 || affectsEntities.length > 0) && (
              <div className="flex gap-1 mt-1.5">
                {relations.length > 0 && (
                  <Badge variant="outline" className="text-[8px] h-4 px-1 gap-0.5">
                    <Link2 className="h-2 w-2" />{relations.length}
                  </Badge>
                )}
                {affectsEntities.length > 0 && (
                  <Badge variant="secondary" className="text-[8px] h-4 px-1 gap-0.5">
                    <Zap className="h-2 w-2" />{affectsEntities.length}
                  </Badge>
                )}
              </div>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold text-xs">{entity.entity_name}</p>
            <p className="text-[10px] text-muted-foreground">{entity.description}</p>
            <div className="flex gap-2 text-[10px]">
              <span className={critConfig.text}>● {critConfig.label}</span>
              <span>{catConfig.label}</span>
            </div>
            {relations.length > 0 && (
              <p className="text-[10px]">সম্পর্ক: {relations.join(", ")}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function RelationPanel({ entity, allEntities, onNavigate }: {
  entity: KnowledgeEntity;
  allEntities: KnowledgeEntity[];
  onNavigate: (name: string) => void;
}) {
  const { lang } = useLanguage();
  const relations = (entity.metadata?.relations as string[]) ?? [];
  const affectsEntities = (entity.metadata?.affects_entities as string[]) ?? [];
  const relatedFlags = (entity.metadata?.related_feature_flags as string[]) ?? [];
  const criticality = (entity.metadata?.criticality as string) ?? "medium";
  const critConfig = CRITICALITY_CONFIG[criticality as keyof typeof CRITICALITY_CONFIG] ?? CRITICALITY_CONFIG.medium;

  return (
    <Card className={`${critConfig.border}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full ${critConfig.color}`} />
          {entity.entity_name}
          <Badge variant="outline" className="text-[9px] ml-auto">{entity.entity_category.replace(/_/g, " ")}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{entity.description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Relations */}
        {relations.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
              <Link2 className="h-3 w-3" /> {lang === "bn" ? "সম্পর্কিত এন্টিটি" : "Related Entities"}
            </p>
            <div className="flex flex-wrap gap-1">
              {relations.map((r) => (
                <button
                  key={r}
                  onClick={() => onNavigate(r)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
                >
                  <ArrowRight className="h-2.5 w-2.5" />{r}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Affects Entities (for feature flags) */}
        {affectsEntities.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
              <Zap className="h-3 w-3" /> {lang === "bn" ? "প্রভাবিত এন্টিটি" : "Affects Entities"}
            </p>
            <div className="flex flex-wrap gap-1">
              {affectsEntities.map((e) => (
                <button
                  key={e}
                  onClick={() => onNavigate(e)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 transition-colors"
                >
                  <ArrowRight className="h-2.5 w-2.5" />{e}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Related Feature Flags */}
        {relatedFlags.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
              <Flag className="h-3 w-3" /> {lang === "bn" ? "সম্পর্কিত ফিচার ফ্ল্যাগ" : "Related Feature Flags"}
            </p>
            <div className="flex flex-wrap gap-1">
              {relatedFlags.map((f) => (
                <button
                  key={f}
                  onClick={() => onNavigate(f)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                >
                  <Flag className="h-2.5 w-2.5" />{f}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="pt-2 border-t">
          <p className="text-[10px] font-semibold text-muted-foreground mb-1">মেটাডেটা</p>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <span>ক্রিটিক্যালিটি: <span className={critConfig.text}>{critConfig.label}</span></span>
            {entity.metadata?.is_enabled !== undefined && (
              <span>স্ট্যাটাস: {entity.metadata.is_enabled ? "✅ সক্রিয়" : "❌ নিষ্ক্রিয়"}</span>
            )}
            {entity.metadata?.enabled_for_role && (
              <span>রোল: {String(entity.metadata.enabled_for_role)}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AuditPanel({ entities }: { entities: KnowledgeEntity[] }) {
  const { lang } = useLanguage();

  const audit = useMemo(() => {
    const noRelations = entities.filter(
      (e) => e.entity_category !== "feature_flag" && (!(e.metadata?.relations as string[])?.length)
    );
    const noCriticality = entities.filter((e) => !e.metadata?.criticality);
    const duplicates = entities.filter(
      (e, i) => entities.findIndex((x) => x.entity_name === e.entity_name) !== i
    );

    // Check for circular: entity A relates to B and B relates to A
    const circularPairs: string[] = [];
    for (const e of entities) {
      const rels = (e.metadata?.relations as string[]) ?? [];
      for (const r of rels) {
        const target = entities.find((x) => x.entity_name === r);
        if (target) {
          const targetRels = (target.metadata?.relations as string[]) ?? [];
          if (targetRels.includes(e.entity_name)) {
            const pair = [e.entity_name, r].sort().join(" ↔ ");
            if (!circularPairs.includes(pair)) circularPairs.push(pair);
          }
        }
      }
    }

    return { noRelations, noCriticality, duplicates, circularPairs };
  }, [entities]);

  const hasIssues = audit.noRelations.length > 0 || audit.noCriticality.length > 0 || audit.duplicates.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {hasIssues ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          {lang === "bn" ? "অডিট রিপোর্ট" : "Audit Report"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span>{lang === "bn" ? "অরফ্যান (রিলেশন নেই)" : "Orphans"}</span>
          <Badge variant={audit.noRelations.length > 0 ? "destructive" : "default"} className="text-[10px]">
            {audit.noRelations.length}
          </Badge>
        </div>
        <div className="flex justify-between">
          <span>{lang === "bn" ? "ক্রিটিক্যালিটি নেই" : "No Criticality"}</span>
          <Badge variant={audit.noCriticality.length > 0 ? "destructive" : "default"} className="text-[10px]">
            {audit.noCriticality.length}
          </Badge>
        </div>
        <div className="flex justify-between">
          <span>{lang === "bn" ? "ডুপ্লিকেট" : "Duplicates"}</span>
          <Badge variant={audit.duplicates.length > 0 ? "destructive" : "default"} className="text-[10px]">
            {audit.duplicates.length}
          </Badge>
        </div>
        <div className="flex justify-between">
          <span>{lang === "bn" ? "সার্কুলার ডিপেন্ডেন্সি" : "Circular Deps"}</span>
          <Badge variant={audit.circularPairs.length > 0 ? "secondary" : "default"} className="text-[10px]">
            {audit.circularPairs.length}
          </Badge>
        </div>
        {audit.circularPairs.length > 0 && (
          <div className="pt-1 border-t space-y-0.5">
            {audit.circularPairs.slice(0, 5).map((p) => (
              <p key={p} className="text-[9px] text-amber-600 font-mono">{p}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function KnowledgeGraphVisualization() {
  const { lang } = useLanguage();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterCriticality, setFilterCriticality] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [showRelationsOnly, setShowRelationsOnly] = useState(false);

  const { data: entities = [], isLoading } = useQuery({
    queryKey: ["knowledge_graph_visualization"],
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

  // Get related entity names for the selected entity
  const relatedNames = useMemo(() => {
    if (!selectedEntity) return new Set<string>();
    const selected = entities.find((e) => e.entity_name === selectedEntity);
    if (!selected) return new Set<string>();

    const names = new Set<string>();
    const relations = (selected.metadata?.relations as string[]) ?? [];
    const affectsEntities = (selected.metadata?.affects_entities as string[]) ?? [];
    const relatedFlags = (selected.metadata?.related_feature_flags as string[]) ?? [];

    relations.forEach((r) => names.add(r));
    affectsEntities.forEach((r) => names.add(r));
    relatedFlags.forEach((r) => names.add(r));

    // Also find entities that have relations pointing to the selected entity
    entities.forEach((e) => {
      const rels = (e.metadata?.relations as string[]) ?? [];
      const affects = (e.metadata?.affects_entities as string[]) ?? [];
      if (rels.includes(selectedEntity) || affects.includes(selectedEntity)) {
        names.add(e.entity_name);
      }
    });

    return names;
  }, [selectedEntity, entities]);

  // Filter entities
  const filteredEntities = useMemo(() => {
    let result = entities;

    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.entity_name.toLowerCase().includes(lower) ||
          e.description?.toLowerCase().includes(lower)
      );
    }
    if (filterCategory) {
      result = result.filter((e) => e.entity_category === filterCategory);
    }
    if (filterCriticality) {
      result = result.filter((e) => (e.metadata?.criticality as string) === filterCriticality);
    }
    if (showRelationsOnly && selectedEntity) {
      result = result.filter(
        (e) => e.entity_name === selectedEntity || relatedNames.has(e.entity_name)
      );
    }

    return result;
  }, [entities, search, filterCategory, filterCriticality, showRelationsOnly, selectedEntity, relatedNames]);

  // Stats
  const stats = useMemo(() => {
    const byCategory: Record<string, number> = {};
    const byCriticality: Record<string, number> = {};
    entities.forEach((e) => {
      byCategory[e.entity_category] = (byCategory[e.entity_category] || 0) + 1;
      const crit = (e.metadata?.criticality as string) ?? "unknown";
      byCriticality[crit] = (byCriticality[crit] || 0) + 1;
    });
    return { byCategory, byCriticality, total: entities.length };
  }, [entities]);

  const handleNavigate = useCallback((name: string) => {
    setSelectedEntity(name);
    setSearch("");
    setFilterCategory(null);
    setFilterCriticality(null);
  }, []);

  const selectedEntityObj = entities.find((e) => e.entity_name === selectedEntity);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mr-3" />
        গ্রাফ লোড হচ্ছে...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            🕸️ {lang === "bn" ? "নলেজ গ্রাফ ভিজ্যুয়ালাইজেশন" : "Knowledge Graph Visualization"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {stats.total} {lang === "bn" ? "এন্টিটি" : "entities"} · ইন্টারেক্টিভ ম্যাপ
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="খুঁজুন..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Category filters */}
        <div className="flex gap-1 flex-wrap">
          <Badge
            variant={filterCategory === null ? "default" : "outline"}
            className="cursor-pointer text-[10px]"
            onClick={() => setFilterCategory(null)}
          >
            সব ({stats.total})
          </Badge>
          {Object.entries(stats.byCategory).map(([cat, count]) => {
            const cfg = CATEGORY_CONFIG[cat];
            return (
              <Badge
                key={cat}
                variant={filterCategory === cat ? "default" : "outline"}
                className="cursor-pointer text-[10px] gap-1"
                onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
              >
                {cfg?.label ?? cat} ({count})
              </Badge>
            );
          })}
        </div>

        {/* Criticality filters */}
        <div className="flex gap-1">
          {Object.entries(CRITICALITY_CONFIG).map(([key, cfg]) => {
            const count = stats.byCriticality[key] ?? 0;
            if (count === 0) return null;
            return (
              <Badge
                key={key}
                variant={filterCriticality === key ? "default" : "outline"}
                className="cursor-pointer text-[10px] gap-1"
                onClick={() => setFilterCriticality(filterCriticality === key ? null : key)}
              >
                <div className={`h-2 w-2 rounded-full ${cfg.color}`} />
                {count}
              </Badge>
            );
          })}
        </div>

        {/* Relations toggle */}
        {selectedEntity && (
          <Button
            variant={showRelationsOnly ? "default" : "outline"}
            size="sm"
            className="h-7 text-[10px] gap-1"
            onClick={() => setShowRelationsOnly(!showRelationsOnly)}
          >
            {showRelationsOnly ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {showRelationsOnly ? "সব দেখান" : "শুধু সম্পর্কিত"}
          </Button>
        )}

        {selectedEntity && (
          <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => { setSelectedEntity(null); setShowRelationsOnly(false); }}>
            <X className="h-3 w-3 mr-1" /> নির্বাচন বাতিল
          </Button>
        )}
      </div>

      {/* Main Layout: Graph + Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Graph Grid */}
        <div className="lg:col-span-2">
          <ScrollArea className="h-[600px] pr-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filteredEntities.map((entity) => (
                <EntityNode
                  key={entity.id}
                  entity={entity}
                  isSelected={entity.entity_name === selectedEntity}
                  isRelated={!!selectedEntity && relatedNames.has(entity.entity_name)}
                  isDimmed={!!selectedEntity && entity.entity_name !== selectedEntity && !relatedNames.has(entity.entity_name) && !showRelationsOnly}
                  onClick={() => setSelectedEntity(
                    selectedEntity === entity.entity_name ? null : entity.entity_name
                  )}
                />
              ))}
            </div>
            {filteredEntities.length === 0 && (
              <div className="text-center py-16 text-muted-foreground text-sm">
                <Info className="h-8 w-8 mx-auto mb-2 opacity-30" />
                কোনো এন্টিটি পাওয়া যায়নি
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right Panel: Detail + Audit */}
        <div className="space-y-4">
          {selectedEntityObj ? (
            <RelationPanel
              entity={selectedEntityObj}
              allEntities={entities}
              onNavigate={handleNavigate}
            />
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground text-sm">
                <Info className="h-8 w-8 mx-auto mb-2 opacity-30" />
                একটি নোডে ক্লিক করুন বিস্তারিত দেখতে
              </CardContent>
            </Card>
          )}

          <AuditPanel entities={entities} />

          {/* Legend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">লেজেন্ড</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground">ক্রিটিক্যালিটি</p>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(CRITICALITY_CONFIG).map(([key, cfg]) => (
                    <div key={key} className="flex items-center gap-1">
                      <div className={`h-2.5 w-2.5 rounded-full ${cfg.color}`} />
                      <span className="text-[9px]">{cfg.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground">ক্যাটাগরি</p>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <div key={key} className="flex items-center gap-1">
                        <Icon className={`h-2.5 w-2.5 ${cfg.color}`} />
                        <span className="text-[9px]">{cfg.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
