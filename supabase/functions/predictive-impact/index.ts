import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entityName, entities } = await req.json();

    if (!entityName || !entities || !Array.isArray(entities)) {
      return new Response(
        JSON.stringify({ error: "entityName and entities array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build graph context for the target entity
    const target = entities.find((e: any) => e.entity_name === entityName);
    if (!target) {
      return new Response(
        JSON.stringify({ error: `Entity "${entityName}" not found` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const relations = target.metadata?.relations ?? [];
    const affects = target.metadata?.affects_entities ?? [];
    const relatedFlags = target.metadata?.related_feature_flags ?? [];

    // Gather related entities
    const relatedEntities = entities.filter((e: any) =>
      relations.includes(e.entity_name) ||
      affects.includes(e.entity_name) ||
      relatedFlags.includes(e.entity_name)
    );

    const graphContext = {
      target_entity: {
        name: target.entity_name,
        category: target.entity_category,
        criticality: target.metadata?.criticality ?? "medium",
        relations,
        affects_entities: affects,
        related_feature_flags: relatedFlags,
      },
      related_entities: relatedEntities.map((e: any) => ({
        name: e.entity_name,
        category: e.entity_category,
        criticality: e.metadata?.criticality ?? "medium",
      })),
      graph_summary: {
        total_entities: entities.length,
        critical_count: entities.filter((e: any) => e.metadata?.criticality === "critical").length,
      },
    };

    const systemPrompt = `তুমি একতা ফাইনান্স সিস্টেমের AI বিশ্লেষক। তোমাকে একটি সিস্টেম নলেজ গ্রাফের একটি নোডের ইমপ্যাক্ট বিশ্লেষণ করতে হবে।

নিয়ম:
- বাংলায় উত্তর দাও
- সংক্ষিপ্ত ও কার্যকর বিশ্লেষণ দাও
- ঝুঁকি মাত্রা (🔴🟠🟡🟢) দিয়ে চিহ্নিত করো
- কংক্রিট সুপারিশ দাও`;

    const userPrompt = `নিচের এন্টিটির ইমপ্যাক্ট বিশ্লেষণ করো:\n\n${JSON.stringify(graphContext, null, 2)}\n\nবিশ্লেষণ করো:
1. এই নোড পরিবর্তন/রিমুভ করলে কী প্রভাব পড়বে
2. সম্পর্কিত ক্রিটিকাল নোডগুলো
3. ঝুঁকি মাত্রা
4. সুপারিশ`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "রেট লিমিট। কিছুক্ষণ পরে চেষ্টা করুন।" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "AI ক্রেডিট শেষ।" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      return new Response(
        JSON.stringify({ error: "AI সার্ভিসে সমস্যা।" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("predictive-impact error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
