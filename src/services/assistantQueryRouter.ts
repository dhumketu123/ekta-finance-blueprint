import type { RiskItem, TrendItem, TopClient, LoanKPIs } from "@/hooks/useAssistantDataBundle";

export interface AssistantContext {
  riskData?: RiskItem[];
  trendData?: TrendItem[];
  topClients?: TopClient[];
  loanKPIs?: LoanKPIs | null;
  period: number;
  collection30d?: { current30d: number; previous30d: number; growthPct: number } | null;
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
  { label: "হাই রিস্ক", icon: "alert", query: "হাই রিস্ক ক্লায়েন্ট" },
  { label: "লোন সারাংশ", icon: "loan", query: "লোন সারাংশ" },
  { label: "সংগ্রহ ট্রেন্ড", icon: "chart", query: "সংগ্রহ ট্রেন্ড" },
  { label: "টপ ক্লায়েন্ট", icon: "user", query: "টপ ক্লায়েন্ট" },
  { label: "সিস্টেম স্ট্যাটাস", icon: "info", query: "সিস্টেম স্ট্যাটাস" },
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
    pattern: /help|সাহায্য|কি করতে পার|কি জানো/i,
    handler: () => ({
      answer: `🤝 আমি আপনাকে যেসব বিষয়ে সাহায্য করতে পারি:\n\n📊 **ডেটা বিশ্লেষণ:**\n• রিস্ক রিপোর্ট ও ক্লায়েন্ট ঝুঁকি বিশ্লেষণ\n• সংগ্রহ ট্রেন্ড ও কালেকশন পারফরম্যান্স\n• লোন সারাংশ ও KPI মেট্রিক্স\n\n💡 **পরামর্শ:**\n• আর্থিক পরিকল্পনা ও কৌশল\n• ঝুঁকি ব্যবস্থাপনা\n• কালেকশন অপ্টিমাইজেশন\n\n🔍 **যেকোনো প্রশ্ন:**\n• বাংলায় বা ইংরেজিতে জিজ্ঞাসা করুন\n• আমি AI ব্যবহার করে উত্তর দিতে পারি`,
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
      return {
        answer: `📋 সিস্টেম ওভারভিউ:\n• লোন: ${k?.totalLoans ?? "?"}টি | সক্রিয়: ${k?.activeRate ?? "?"}%\n• সংগ্রহ (${ctx.period}d): ${fmt(total)}\n• রিস্ক: ক্রিটিকাল ${critical}, হাই ${high}\n• বকেয়া: ${fmt(k?.totalOutstanding ?? 0)}\n• AI Pipeline: ✅ অপারেশনাল`,
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
 * Build context summary for LLM
 */
export function buildLlmContext(ctx: AssistantContext): Record<string, unknown> {
  const risk = ctx.riskData ?? [];
  const t = ctx.trendData ?? [];
  const k = ctx.loanKPIs;

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
  };
}
