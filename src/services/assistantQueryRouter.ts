import type { RiskItem, TrendItem, TopClient, LoanKPIs } from "@/hooks/useAssistantDataBundle";

export interface AssistantContext {
  riskData?: RiskItem[];
  trendData?: TrendItem[];
  topClients?: TopClient[];
  loanKPIs?: LoanKPIs | null;
  period: number;
}

interface RouteMatch {
  pattern: RegExp;
  handler: (ctx: AssistantContext) => string;
}

const fmt = (n: number) => `৳${n.toLocaleString("bn-BD")}`;

const routes: RouteMatch[] = [
  {
    pattern: /high\s*risk|হাই\s*রিস্ক|ক্রিটিক|critical|ঝুঁকি/i,
    handler: (ctx) => {
      const risk = ctx.riskData ?? [];
      const critical = risk.find((r) => r.name === "critical")?.value ?? 0;
      const high = risk.find((r) => r.name === "high")?.value ?? 0;
      const total = risk.reduce((s, r) => s + r.value, 0);
      if (total === 0) return "কোনো রিস্ক ডেটা পাওয়া যায়নি।";
      return `🔴 ক্রিটিকাল: ${critical} জন\n🟠 হাই: ${high} জন\nমোট স্কোরড: ${total} জন\n${critical + high > 0 ? "⚠️ উচ্চ ঝুঁকিতে " + (critical + high) + " জন ক্লায়েন্ট আছে।" : "✅ সিস্টেম স্থিতিশীল।"}`;
    },
  },
  {
    pattern: /loan\s*summary|লোন\s*সারাং|kpi|কেপিআই/i,
    handler: (ctx) => {
      const k = ctx.loanKPIs;
      if (!k) return "লোন ডেটা লোড হচ্ছে...";
      return `📊 লোন সারাংশ:\n• মোট লোন: ${k.totalLoans}টি\n• বকেয়া আসল: ${fmt(k.totalOutstanding)}\n• মোট জরিমানা: ${fmt(k.totalPenalty)}\n• সক্রিয় হার: ${k.activeRate}%\n• ডিফল্ট হার: ${k.defaultRate}%\n• গড় EMI: ${fmt(k.avgEmi)}`;
    },
  },
  {
    pattern: /collection|সংগ্রহ|trend|ট্রেন্ড|৭\s*দিন|7\s*day|৩০\s*দিন|30\s*day/i,
    handler: (ctx) => {
      const t = ctx.trendData ?? [];
      if (!t.length) return "এই সময়কালে কোনো সংগ্রহ ডেটা নেই।";
      const total = t.reduce((s, d) => s + d.total, 0);
      const avg = Math.round(total / t.length);
      const txCount = t.reduce((s, d) => s + d.count, 0);
      return `📈 ${ctx.period}-দিনের সংগ্রহ:\n• মোট: ${fmt(total)}\n• দৈনিক গড়: ${fmt(avg)}\n• ট্রানজেকশন: ${txCount}টি\n• ডেটা পয়েন্ট: ${t.length} দিন`;
    },
  },
  {
    pattern: /top\s*client|টপ\s*ক্লায়েন্ট|ট্রেন্ডিং\s*ক্লায়েন্ট|best\s*client/i,
    handler: (ctx) => {
      const clients = ctx.topClients ?? [];
      if (!clients.length) return "এই সপ্তাহে উল্লেখযোগ্য সংগ্রহ হয়নি।";
      const lines = clients.slice(0, 5).map((c, i) => `${i + 1}. ${c.name} — ${fmt(c.total)} (${c.count} TX)`);
      return `🏆 টপ ক্লায়েন্ট (${ctx.period} দিন):\n${lines.join("\n")}`;
    },
  },
  {
    pattern: /alert|অ্যালার্ট|সতর্ক/i,
    handler: (ctx) => {
      const risk = ctx.riskData ?? [];
      const critical = risk.find((r) => r.name === "critical")?.value ?? 0;
      const high = risk.find((r) => r.name === "high")?.value ?? 0;
      if (critical + high === 0) return "✅ সিস্টেম স্থিতিশীল — কোনো উচ্চ ঝুঁকি নেই।";
      return `🚨 সক্রিয় অ্যালার্ট:\n• ক্রিটিকাল: ${critical}\n• হাই: ${high}\n⚡ মোট ${critical + high} জন ক্লায়েন্ট তাৎক্ষণিক মনোযোগ প্রয়োজন।`;
    },
  },
  {
    pattern: /pipeline|পাইপলাইন|ai\s*status/i,
    handler: () => "🤖 AI Pipeline: সক্রিয় ✅\nরিস্ক ইঞ্জিন, KPI ইঞ্জিন, অ্যালার্ট ইঞ্জিন — সব অপারেশনাল।",
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
      return `📋 সিস্টেম ওভারভিউ:\n• লোন: ${k?.totalLoans ?? "?"}টি | সক্রিয়: ${k?.activeRate ?? "?"}%\n• সংগ্রহ (${ctx.period}d): ${fmt(total)}\n• রিস্ক: ক্রিটিকাল ${critical}, হাই ${high}\n• বকেয়া: ${fmt(k?.totalOutstanding ?? 0)}\n• AI Pipeline: ✅ অপারেশনাল`;
    },
  },
];

export function assistantQueryRouter(message: string, ctx: AssistantContext): string {
  const trimmed = message.trim();
  if (!trimmed) return "আপনার প্রশ্ন লিখুন।";

  for (const route of routes) {
    if (route.pattern.test(trimmed)) {
      return route.handler(ctx);
    }
  }

  return `🤔 দুঃখিত, এই প্রশ্নের উত্তর দিতে পারছি না।\n\nআপনি জিজ্ঞাসা করতে পারেন:\n• "হাই রিস্ক ক্লায়েন্ট"\n• "লোন সারাংশ"\n• "সংগ্রহ ট্রেন্ড"\n• "টপ ক্লায়েন্ট"\n• "সিস্টেম স্ট্যাটাস"\n• "অ্যালার্ট"`;
}
