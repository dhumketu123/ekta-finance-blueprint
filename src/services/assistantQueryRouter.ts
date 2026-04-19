import type { RiskItem, TrendItem, TopClient, LoanKPIs } from "@/hooks/useAssistantDataBundle";
import { resolveModulesForQuery } from "@/core/ruleEngine";
import { systemMonitor } from "@/core/systemMonitor";

export interface AssistantContext {
  riskData?: RiskItem[];
  trendData?: TrendItem[];
  topClients?: TopClient[];
  loanKPIs?: LoanKPIs | null;
  period: number;
  collection30d?: { current30d: number; previous30d: number; growthPct: number } | null;
  knowledgeEntities?: KnowledgeEntry[];
}

export interface KnowledgeEntry {
  entity_category: string;
  entity_name: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
}

export interface RouterResult {
  answer: string | null;
  matched: boolean;
  actions?: SuggestedAction[];
}

export interface SuggestedAction {
  label: string;
  icon: "alert" | "chart" | "user" | "loan" | "info";
  query: string;
}

interface RouteMatch {
  pattern: RegExp;
  handler: (ctx: AssistantContext) => { answer: string; actions?: SuggestedAction[] };
}

const fmt = (n: number) => `৳${n.toLocaleString("bn-BD")}`;

const QUICK_ACTIONS: SuggestedAction[] = [
  { label: "রিস্ক রিপোর্ট চেক করুন", icon: "alert", query: "রিস্ক রিপোর্ট দেখান" },
  { label: "লোন পারফরম্যান্স দেখুন", icon: "loan", query: "লোন পারফরম্যান্স রিপোর্ট" },
  { label: "কালেকশন স্ট্যাটাস", icon: "chart", query: "কালেকশন স্ট্যাটাস দেখান" },
  { label: "অনুমোদন রিপোর্ট", icon: "info", query: "অনুমোদন রিপোর্ট দেখান" },
  { label: "AI বিশ্লেষণ চালান", icon: "chart", query: "AI বিশ্লেষণ চালান" },
];

const routes: RouteMatch[] = [
  {
    pattern: /high\s*risk|হাই\s*রিস্ক|ক্রিটিক|critical|ঝুঁকি/i,
    handler: (ctx) => {
      const risk = ctx.riskData ?? [];
      const critical = risk.find((r) => r.name === "critical")?.value ?? 0;
      const high = risk.find((r) => r.name === "high")?.value ?? 0;
      const medium = risk.find((r) => r.name === "medium")?.value ?? 0;
      const low = risk.find((r) => r.name === "low")?.value ?? 0;
      const total = risk.reduce((s, r) => s + r.value, 0);
      if (total === 0) return { answer: "কোনো রিস্ক ডেটা পাওয়া যায়নি।" };

      let answer = `🔴 ক্রিটিকাল: ${critical} জন\n🟠 হাই: ${high} জন\n🟡 মিডিয়াম: ${medium} জন\n🟢 লো: ${low} জন\nমোট স্কোরড: ${total} জন`;

      const actions: SuggestedAction[] = [];
      if (critical + high > 0) {
        answer += `\n\n⚠️ উচ্চ ঝুঁকিতে ${critical + high} জন ক্লায়েন্ট আছে।`;
        actions.push(
          { label: "কালেকশন ট্রেন্ড দেখুন", icon: "chart", query: "সংগ্রহ ট্রেন্ড" },
          { label: "টপ ক্লায়েন্ট দেখুন", icon: "user", query: "টপ ক্লায়েন্ট" }
        );
      } else {
        answer += "\n\n✅ সিস্টেম স্থিতিশীল।";
      }

      return { answer, actions };
    },
  },
  {
    pattern: /loan\s*summary|লোন\s*সারাং|kpi|কেপিআই|লোন\s*অবস্থা/i,
    handler: (ctx) => {
      const k = ctx.loanKPIs;
      if (!k) return { answer: "লোন ডেটা লোড হচ্ছে..." };

      const answer = `📊 লোন সারাংশ:\n• মোট লোন: ${k.totalLoans}টি\n• বকেয়া আসল: ${fmt(k.totalOutstanding)}\n• মোট জরিমানা: ${fmt(k.totalPenalty)}\n• সক্রিয় হার: ${k.activeRate}%\n• ডিফল্ট হার: ${k.defaultRate}%\n• গড় EMI: ${fmt(k.avgEmi)}`;

      const actions: SuggestedAction[] = [];
      if (k.defaultRate > 10) {
        actions.push({ label: "হাই রিস্ক ক্লায়েন্ট দেখুন", icon: "alert", query: "হাই রিস্ক ক্লায়েন্ট" });
      }
      actions.push({ label: "সংগ্রহ ট্রেন্ড", icon: "chart", query: "সংগ্রহ ট্রেন্ড" });

      return { answer, actions };
    },
  },
  {
    pattern: /collection|সংগ্রহ|trend|ট্রেন্ড|৭\s*দিন|7\s*day|৩০\s*দিন|30\s*day/i,
    handler: (ctx) => {
      const t = ctx.trendData ?? [];
      if (!t.length) return { answer: "এই সময়কালে কোনো সংগ্রহ ডেটা নেই।" };
      const total = t.reduce((s, d) => s + d.total, 0);
      const avg = Math.round(total / t.length);
      const txCount = t.reduce((s, d) => s + d.count, 0);
      const bestDay = t.reduce((max, d) => (d.total > max.total ? d : max), t[0]);

      let answer = `📈 ${ctx.period}-দিনের সংগ্রহ:\n• মোট: ${fmt(total)}\n• দৈনিক গড়: ${fmt(avg)}\n• ট্রানজেকশন: ${txCount}টি\n• ডেটা পয়েন্ট: ${t.length} দিন`;

      if (bestDay) {
        answer += `\n• সর্বোচ্চ দিন: ${bestDay.date} — ${fmt(bestDay.total)}`;
      }

      // 30-day comparison
      const c30 = ctx.collection30d;
      if (c30) {
        const arrow = c30.growthPct >= 0 ? "↑" : "↓";
        const emoji = c30.growthPct >= 0 ? "📈" : "📉";
        answer += `\n\n${emoji} ৩০-দিন তুলনা:\n• বর্তমান ৩০দিন: ${fmt(c30.current30d)}\n• আগের ৩০দিন: ${fmt(c30.previous30d)}\n• পরিবর্তন: ${arrow} ${Math.abs(c30.growthPct)}%`;
      }

      return {
        answer,
        actions: [
          { label: "টপ ক্লায়েন্ট", icon: "user", query: "টপ ক্লায়েন্ট" },
          { label: "লোন সারাংশ", icon: "loan", query: "লোন সারাংশ" },
        ],
      };
    },
  },
  {
    pattern: /top\s*client|টপ\s*ক্লায়েন্ট|ট্রেন্ডিং\s*ক্লায়েন্ট|best\s*client/i,
    handler: (ctx) => {
      const clients = ctx.topClients ?? [];
      if (!clients.length) return { answer: "এই সপ্তাহে উল্লেখযোগ্য সংগ্রহ হয়নি।" };
      const lines = clients.slice(0, 5).map((c, i) => `${i + 1}. ${c.name} — ${fmt(c.total)} (${c.count} TX)`);
      return {
        answer: `🏆 টপ ক্লায়েন্ট (${ctx.period} দিন):\n${lines.join("\n")}`,
        actions: [
          { label: "সংগ্রহ ট্রেন্ড", icon: "chart", query: "সংগ্রহ ট্রেন্ড" },
          { label: "রিস্ক চেক", icon: "alert", query: "হাই রিস্ক ক্লায়েন্ট" },
        ],
      };
    },
  },
  {
    pattern: /alert|অ্যালার্ট|সতর্ক/i,
    handler: (ctx) => {
      const risk = ctx.riskData ?? [];
      const critical = risk.find((r) => r.name === "critical")?.value ?? 0;
      const high = risk.find((r) => r.name === "high")?.value ?? 0;
      if (critical + high === 0) {
        return {
          answer: "✅ সিস্টেম স্থিতিশীল — কোনো উচ্চ ঝুঁকি নেই।",
          actions: [{ label: "সিস্টেম স্ট্যাটাস", icon: "info", query: "সিস্টেম স্ট্যাটাস" }],
        };
      }
      return {
        answer: `🚨 সক্রিয় অ্যালার্ট:\n• ক্রিটিকাল: ${critical}\n• হাই: ${high}\n⚡ মোট ${critical + high} জন ক্লায়েন্ট তাৎক্ষণিক মনোযোগ প্রয়োজন।`,
        actions: [
          { label: "রিস্ক বিশ্লেষণ", icon: "alert", query: "হাই রিস্ক ক্লায়েন্ট" },
          { label: "টপ ক্লায়েন্ট", icon: "user", query: "টপ ক্লায়েন্ট" },
        ],
      };
    },
  },
  {
    pattern: /pipeline|পাইপলাইন|ai\s*status/i,
    handler: () => ({
      answer: "🤖 AI Pipeline: সক্রিয় ✅\nরিস্ক ইঞ্জিন, KPI ইঞ্জিন, অ্যালার্ট ইঞ্জিন — সব অপারেশনাল।",
    }),
  },
  {
    pattern: /knowledge|নলেজ|গ্রাফ|graph|dna|ডিএনএ|entity|এন্টিটি/i,
    handler: (ctx) => {
      const entries = ctx.knowledgeEntities ?? [];
      if (!entries.length) return { answer: "নলেজ গ্রাফ ডেটা লোড হয়নি। মনিটরিং ড্যাশবোর্ড থেকে সিঙ্ক করুন।" };

      const byCategory: Record<string, number> = {};
      const byCriticality: Record<string, number> = {};
      entries.forEach((e) => {
        byCategory[e.entity_category] = (byCategory[e.entity_category] || 0) + 1;
        const crit = (e.metadata?.criticality as string) ?? "unknown";
        byCriticality[crit] = (byCriticality[crit] || 0) + 1;
      });

      let answer = `🧠 **নলেজ গ্রাফ সারাংশ:**\n• মোট এন্টিটি: ${entries.length}`;
      Object.entries(byCategory).forEach(([cat, count]) => {
        answer += `\n• ${cat.replace(/_/g, " ")}: ${count}`;
      });
      answer += "\n\n**ক্রিটিক্যালিটি:**";
      Object.entries(byCriticality).forEach(([crit, count]) => {
        const emoji = crit === "critical" ? "🔴" : crit === "high" ? "🟠" : crit === "medium" ? "🟡" : "🟢";
        answer += `\n${emoji} ${crit}: ${count}`;
      });

      return {
        answer,
        actions: [
          { label: "ক্রিটিকাল এন্টিটি", icon: "alert" as const, query: "ক্রিটিকাল এন্টিটি" },
          { label: "ফিচার ফ্ল্যাগ", icon: "info" as const, query: "ফিচার ফ্ল্যাগ স্ট্যাটাস" },
        ],
      };
    },
  },
  {
    pattern: /critical\s*entity|ক্রিটিকাল\s*এন্টিটি|critical\s*table|ক্রিটিকাল\s*টেবিল/i,
    handler: (ctx) => {
      const entries = ctx.knowledgeEntities ?? [];
      const criticals = entries.filter((e) => (e.metadata?.criticality as string) === "critical");
      if (!criticals.length) return { answer: "কোনো ক্রিটিকাল এন্টিটি পাওয়া যায়নি।" };

      const lines = criticals.map((e) => `• **${e.entity_name}** (${e.entity_category.replace(/_/g, " ")}) — ${e.description?.slice(0, 60) ?? ""}`);
      return {
        answer: `🔴 **ক্রিটিকাল এন্টিটি (${criticals.length}):**\n${lines.join("\n")}`,
        actions: [
          { label: "নলেজ গ্রাফ", icon: "info" as const, query: "নলেজ গ্রাফ" },
          { label: "সিস্টেম স্ট্যাটাস", icon: "info" as const, query: "সিস্টেম স্ট্যাটাস" },
        ],
      };
    },
  },
  {
    pattern: /feature\s*flag|ফিচার\s*ফ্ল্যাগ|ff\s*status/i,
    handler: (ctx) => {
      const entries = ctx.knowledgeEntities ?? [];
      const flags = entries.filter((e) => e.entity_category === "feature_flag");
      if (!flags.length) return { answer: "ফিচার ফ্ল্যাগ ডেটা নেই।" };

      const lines = flags.map((e) => {
        const enabled = e.metadata?.is_enabled;
        const role = e.metadata?.enabled_for_role ?? "all";
        return `• ${enabled ? "✅" : "❌"} **${e.entity_name}** — রোল: ${role}`;
      });
      return {
        answer: `🚩 **ফিচার ফ্ল্যাগ (${flags.length}):**\n${lines.join("\n")}`,
        actions: [
          { label: "নলেজ গ্রাফ", icon: "info" as const, query: "নলেজ গ্রাফ" },
        ],
      };
    },
  },
  {
    pattern: /impact|ইমপ্যাক্ট|predictive|প্রেডিক্টিভ|প্রভাব\s*বিশ্লেষণ|dependency\s*impact/i,
    handler: (ctx) => {
      const entries = ctx.knowledgeEntities ?? [];
      if (!entries.length) return { answer: "নলেজ গ্রাফ ডেটা লোড হয়নি।" };

      // Calculate impact scores based on graph connectivity
      const impactScores = entries.map((e) => {
        const relations = (e.metadata?.relations as string[]) ?? [];
        const affects = (e.metadata?.affects_entities as string[]) ?? [];
        const flags = (e.metadata?.related_feature_flags as string[]) ?? [];
        const crit = (e.metadata?.criticality as string) ?? "medium";
        const critWeight = crit === "critical" ? 4 : crit === "high" ? 3 : crit === "medium" ? 2 : 1;

        // Inbound connections: how many entities point TO this one
        const inbound = entries.filter((other) => {
          const otherRels = (other.metadata?.relations as string[]) ?? [];
          const otherAffects = (other.metadata?.affects_entities as string[]) ?? [];
          return otherRels.includes(e.entity_name) || otherAffects.includes(e.entity_name);
        }).length;

        const score = (relations.length * 2) + (affects.length * 3) + (flags.length * 2) + (inbound * 2) + (critWeight * 3);
        return { name: e.entity_name, category: e.entity_category, criticality: crit, score, relations: relations.length, affects: affects.length, inbound };
      }).sort((a, b) => b.score - a.score);

      const top10 = impactScores.slice(0, 10);
      let answer = `🔮 **প্রেডিক্টিভ ইমপ্যাক্ট বিশ্লেষণ:**\n\n**সর্বোচ্চ ইমপ্যাক্ট নোড (টপ ১০):**`;
      top10.forEach((item, i) => {
        const emoji = item.criticality === "critical" ? "🔴" : item.criticality === "high" ? "🟠" : item.criticality === "medium" ? "🟡" : "🟢";
        answer += `\n${i + 1}. ${emoji} **${item.name}** — স্কোর: ${item.score} (↗${item.relations} ↙${item.inbound} ⚡${item.affects})`;
      });

      // Risk summary
      const highImpact = impactScores.filter((s) => s.score >= 15);
      const avgScore = Math.round(impactScores.reduce((s, i) => s + i.score, 0) / impactScores.length);
      answer += `\n\n📊 **সারাংশ:**\n• গড় ইমপ্যাক্ট স্কোর: ${avgScore}\n• হাই-ইমপ্যাক্ট নোড: ${highImpact.length}\n• মোট নোড: ${impactScores.length}`;

      return {
        answer,
        actions: [
          { label: "ক্রিটিকাল এন্টিটি", icon: "alert" as const, query: "ক্রিটিকাল এন্টিটি" },
          { label: "নলেজ গ্রাফ", icon: "info" as const, query: "নলেজ গ্রাফ" },
        ],
      };
    },
  },
  {
    pattern: /orphan|অরফ্যান|isolated|বিচ্ছিন্ন|cyclic|সার্কুলার/i,
    handler: (ctx) => {
      const entries = ctx.knowledgeEntities ?? [];
      if (!entries.length) return { answer: "নলেজ গ্রাফ ডেটা লোড হয়নি।" };

      // Orphans
      const orphans = entries.filter((e) => {
        if (e.entity_category === "feature_flag") return false;
        const rels = (e.metadata?.relations as string[]) ?? [];
        return rels.length === 0;
      });

      // Circular dependencies
      const circularPairs: string[] = [];
      for (const e of entries) {
        const rels = (e.metadata?.relations as string[]) ?? [];
        for (const r of rels) {
          const target = entries.find((x) => x.entity_name === r);
          if (target) {
            const targetRels = (target.metadata?.relations as string[]) ?? [];
            if (targetRels.includes(e.entity_name)) {
              const pair = [e.entity_name, r].sort().join(" ↔ ");
              if (!circularPairs.includes(pair)) circularPairs.push(pair);
            }
          }
        }
      }

      let answer = `🔍 **গ্রাফ অডিট রিপোর্ট:**`;
      answer += `\n\n📌 **অরফ্যান নোড (${orphans.length}):**`;
      if (orphans.length === 0) {
        answer += "\n✅ কোনো অরফ্যান নেই!";
      } else {
        orphans.slice(0, 8).forEach((o) => { answer += `\n• ${o.entity_name} (${o.entity_category})`; });
        if (orphans.length > 8) answer += `\n• ...আরো ${orphans.length - 8}টি`;
      }

      answer += `\n\n🔄 **সার্কুলার ডিপেন্ডেন্সি (${circularPairs.length}):**`;
      if (circularPairs.length === 0) {
        answer += "\n✅ কোনো সার্কুলার নেই!";
      } else {
        circularPairs.slice(0, 5).forEach((p) => { answer += `\n• ${p}`; });
      }

      return {
        answer,
        actions: [
          { label: "ইমপ্যাক্ট বিশ্লেষণ", icon: "chart" as const, query: "প্রেডিক্টিভ ইমপ্যাক্ট" },
          { label: "নলেজ গ্রাফ", icon: "info" as const, query: "নলেজ গ্রাফ" },
        ],
      };
    },
  },
  {
    pattern: /edge\s*function|এজ\s*ফাংশন|backend\s*function/i,
    handler: (ctx) => {
      const entries = ctx.knowledgeEntities ?? [];
      const fns = entries.filter((e) => e.entity_category === "edge_function");
      if (!fns.length) return { answer: "এজ ফাংশন ডেটা নেই।" };

      const lines = fns.map((e) => {
        const crit = (e.metadata?.criticality as string) ?? "medium";
        const emoji = crit === "critical" ? "🔴" : crit === "high" ? "🟠" : "🟡";
        return `${emoji} **${e.entity_name}** — ${e.description?.slice(0, 50) ?? ""}`;
      });
      return {
        answer: `⚡ **এজ ফাংশন (${fns.length}):**\n${lines.join("\n")}`,
      };
    },
  },
  {
    pattern: /help|সাহায্য|কি করতে পার|কি জানো/i,
    handler: () => ({
      answer: `🤝 আমি আপনাকে যেসব বিষয়ে সাহায্য করতে পারি:\n\n📊 **ডেটা বিশ্লেষণ:**\n• রিস্ক রিপোর্ট ও ক্লায়েন্ট ঝুঁকি বিশ্লেষণ\n• সংগ্রহ ট্রেন্ড ও কালেকশন পারফরম্যান্স\n• লোন সারাংশ ও KPI মেট্রিক্স\n\n🧠 **নলেজ গ্রাফ:**\n• সিস্টেম এন্টিটি ও ডিপেন্ডেন্সি\n• ক্রিটিকাল টেবিল ও এজ ফাংশন\n• ফিচার ফ্ল্যাগ স্ট্যাটাস\n\n💡 **পরামর্শ:**\n• আর্থিক পরিকল্পনা ও কৌশল\n• ঝুঁকি ব্যবস্থাপনা\n\n🔍 বাংলায় বা ইংরেজিতে জিজ্ঞাসা করুন`,
      actions: QUICK_ACTIONS,
    }),
  },
  {
    pattern: /status|স্ট্যাটাস|overview|ওভারভিউ|সারসংক্ষেপ/i,
    handler: (ctx) => {
      const k = ctx.loanKPIs;
      const risk = ctx.riskData ?? [];
      const critical = risk.find((r) => r.name === "critical")?.value ?? 0;
      const high = risk.find((r) => r.name === "high")?.value ?? 0;
      const t = ctx.trendData ?? [];
      const total = t.reduce((s, d) => s + d.total, 0);
      const c30 = ctx.collection30d;
      let growthLine = "";
      if (c30) {
        const arrow = c30.growthPct >= 0 ? "↑" : "↓";
        growthLine = `\n• ৩০দিন পরিবর্তন: ${arrow} ${Math.abs(c30.growthPct)}%`;
      }

      const kgCount = ctx.knowledgeEntities?.length ?? 0;

      return {
        answer: `📋 সিস্টেম ওভারভিউ:\n• লোন: ${k?.totalLoans ?? "?"}টি | সক্রিয়: ${k?.activeRate ?? "?"}%\n• সংগ্রহ (${ctx.period}d): ${fmt(total)}${growthLine}\n• রিস্ক: ক্রিটিকাল ${critical}, হাই ${high}\n• বকেয়া: ${fmt(k?.totalOutstanding ?? 0)}\n• নলেজ গ্রাফ: ${kgCount} এন্টিটি\n• AI Pipeline: ✅ অপারেশনাল`,
        actions: QUICK_ACTIONS.slice(0, 3),
      };
    },
  },
];

/**
 * Deterministic query router — returns matched answer or null for LLM fallback
 */
export function assistantQueryRouter(message: string, ctx: AssistantContext): RouterResult {
  const trimmed = message.trim();
  if (!trimmed) return { answer: "আপনার প্রশ্ন লিখুন।", matched: true };

  for (const route of routes) {
    if (route.pattern.test(trimmed)) {
      const result = route.handler(ctx);
      return { answer: result.answer, matched: true, actions: result.actions };
    }
  }

  // No deterministic match → signal LLM fallback
  return { answer: null, matched: false };
}

/**
 * Get quick action suggestions for initial state
 */
export function getQuickActions(): SuggestedAction[] {
  return QUICK_ACTIONS;
}

/**
 * Gap detection — identifies missing/anomalous data & produces actionable alerts
 */
export function detectGaps(ctx: AssistantContext): string[] {
  const gaps: string[] = [];

  if (!ctx.trendData?.length) gaps.push("⚠️ সর্বশেষ সংগ্রহ ডেটা নেই — ট্রানজেকশন সিস্টেম যাচাই করুন।");
  if (!ctx.collection30d) gaps.push("⚠️ ৩০-দিন তুলনামূলক ডেটা অনুপস্থিত।");
  if (!ctx.loanKPIs) gaps.push("⚠️ লোন KPI ডেটা লোড হয়নি।");
  if (!ctx.riskData?.length) gaps.push("⚠️ রিস্ক ডিস্ট্রিবিউশন ডেটা পাওয়া যায়নি।");
  if (!ctx.topClients?.length) gaps.push("⚠️ টপ ক্লায়েন্ট ডেটা নেই।");

  return gaps;
}

/**
 * Predictive suggestions — context-aware recommended next actions
 */
export function getPredictiveSuggestions(ctx: AssistantContext): SuggestedAction[] {
  const suggestions: SuggestedAction[] = [];
  const risk = ctx.riskData ?? [];
  const critical = risk.find((r) => r.name === "critical")?.value ?? 0;
  const high = risk.find((r) => r.name === "high")?.value ?? 0;

  if (critical + high > 5) {
    suggestions.push({ label: `🚨 ${critical + high} হাই রিস্ক দেখুন`, icon: "alert", query: "হাই রিস্ক ক্লায়েন্ট" });
  }

  const c30 = ctx.collection30d;
  if (c30 && c30.growthPct < -10) {
    suggestions.push({ label: `📉 সংগ্রহ ${Math.abs(c30.growthPct)}% কমেছে`, icon: "chart", query: "সংগ্রহ ট্রেন্ড" });
  }

  if (ctx.loanKPIs && ctx.loanKPIs.defaultRate > 10) {
    suggestions.push({ label: `⚠️ ডিফল্ট হার ${ctx.loanKPIs.defaultRate}%`, icon: "loan", query: "লোন সারাংশ" });
  }

  if (!suggestions.length) {
    suggestions.push({ label: "সিস্টেম স্ট্যাটাস", icon: "info", query: "সিস্টেম স্ট্যাটাস" });
  }

  return suggestions;
}

/**
 * Build context summary for LLM
 *
 * @param ctx     Assistant data bundle
 * @param userQuery Optional latest user input — used to inject SYSTEM_INDEX
 *                  module hints so the LLM understands which app area is in scope.
 */
export function buildLlmContext(
  ctx: AssistantContext,
  userQuery?: string,
): Record<string, unknown> {
  const risk = ctx.riskData ?? [];
  const t = ctx.trendData ?? [];
  const k = ctx.loanKPIs;
  const kg = ctx.knowledgeEntities ?? [];

  // Build knowledge graph summary for LLM
  const kgByCategory: Record<string, number> = {};
  const kgByCriticality: Record<string, number> = {};
  const criticalEntities: string[] = [];
  const activeFlags: string[] = [];

  kg.forEach((e) => {
    kgByCategory[e.entity_category] = (kgByCategory[e.entity_category] || 0) + 1;
    const crit = (e.metadata?.criticality as string) ?? "unknown";
    kgByCriticality[crit] = (kgByCriticality[crit] || 0) + 1;
    if (crit === "critical") criticalEntities.push(e.entity_name);
    if (e.entity_category === "feature_flag" && e.metadata?.is_enabled) {
      activeFlags.push(e.entity_name);
    }
  });

  // SYSTEM_INDEX module hints — routed through RULE_ENGINE (single decision layer).
  // Direct SYSTEM_INDEX scanning is forbidden by SYSTEM CONSTITUTION v1.0.
  const decision = resolveModulesForQuery(userQuery);
  const system_modules = decision.modules;

  // OBSERVABILITY BRIDGE (Governance Patch — Part 2):
  // Forward RULE_ENGINE traceId into systemMonitor (passive log only).
  // RULE_ENGINE remains pure; consumer owns the telemetry side-effect.
  systemMonitor.trackEvent("rule_engine_decision", {
    traceId: decision.traceId,
    decision: decision.decision,
    source: decision.source,
    moduleCount: decision.modules.length,
  });

  return {
    risk_summary: {
      critical: risk.find((r) => r.name === "critical")?.value ?? 0,
      high: risk.find((r) => r.name === "high")?.value ?? 0,
      medium: risk.find((r) => r.name === "medium")?.value ?? 0,
      low: risk.find((r) => r.name === "low")?.value ?? 0,
      total_scored: risk.reduce((s, r) => s + r.value, 0),
    },
    collection: {
      period_days: ctx.period,
      total: t.reduce((s, d) => s + d.total, 0),
      daily_avg: t.length ? Math.round(t.reduce((s, d) => s + d.total, 0) / t.length) : 0,
      tx_count: t.reduce((s, d) => s + d.count, 0),
      thirty_day_comparison: ctx.collection30d ?? null,
    },
    loan_kpis: k
      ? {
          total_loans: k.totalLoans,
          outstanding: k.totalOutstanding,
          penalty: k.totalPenalty,
          active_rate: k.activeRate,
          default_rate: k.defaultRate,
          avg_emi: k.avgEmi,
        }
      : null,
    top_clients: (ctx.topClients ?? []).slice(0, 5).map((c) => ({
      name: c.name,
      total: c.total,
      count: c.count,
    })),
    knowledge_graph: {
      total_entities: kg.length,
      by_category: kgByCategory,
      by_criticality: kgByCriticality,
      critical_entities: criticalEntities,
      active_feature_flags: activeFlags,
    },
    system_modules,
    data_gaps: detectGaps(ctx),
  };
}
