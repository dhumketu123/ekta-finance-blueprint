import { useState, useRef, useEffect, useCallback } from "react";
import { useRiskDistribution, useCollectionTrend, useTopClients, useLoanKPIs, useCollectionSummary30d } from "@/hooks/useAssistantDataBundle";
import { assistantQueryRouter, getQuickActions, buildLlmContext, type AssistantContext, type KnowledgeEntry } from "@/services/assistantQueryRouter";
import { streamLlmResponse, type ChatMessage } from "@/services/assistantLlmService";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { FloatingOrb } from "./ai-assistant/FloatingOrb";
import { ChatPanel } from "./ai-assistant/ChatPanel";
import { useAIUIState } from "./ai-assistant/useAIUIState";
import type { Message } from "./ai-assistant/types";

// ---------------------------------------------------------------------------
// Welcome message builder
// ---------------------------------------------------------------------------
function getWelcomeMessage(ctx: AssistantContext): Message {
  const highRisk = (ctx.riskData ?? [])
    .filter((r) => r.name === "critical" || r.name === "high")
    .reduce((s, r) => s + r.value, 0);
  const criticalCount = (ctx.riskData ?? [])
    .filter((r) => r.name === "critical")
    .reduce((s, r) => s + r.value, 0);
  const highCount = highRisk - criticalCount;

  let content =
    "👋 স্বাগতম! আমি **ভিঞ্চি (VINCI)**—আপনার ইন্টেলিজেন্ট ফিন্যান্সিয়াল অ্যাসিস্ট্যান্ট। আমি ডেটা বিশ্লেষণ, রিস্ক অ্যানালাইসিস এবং আর্থিক সিদ্ধান্তে সাহায্য করতে প্রস্তুত। আজ আপনাকে কীভাবে সাহায্য করতে পারি?";

  content += `\n\n📡 **System Insight Panel:**`;
  content += `\n• কিছু ট্রানজেকশন ও লোন ডেটা আপডেট পেন্ডিং আছে`;
  content += `\n• মোট **${highRisk}টি** হাই-রিস্ক ইস্যু শনাক্ত করা হয়েছে`;
  content += `\n• **${criticalCount}টি** Critical, **${highCount}টি** High Risk কেস অ্যাক্টিভ`;
  content += `\n• সিস্টেম রিয়েল-টাইম মনিটরিং মোডে আছে`;

  return {
    id: "welcome",
    role: "assistant",
    content,
    timestamp: new Date(),
    actions: getQuickActions(),
  };
}

// ---------------------------------------------------------------------------
// Orchestrator — thin wrapper connecting data, state, and UI subsystems
// ---------------------------------------------------------------------------
export default function AiChatAssistant() {
  const { state: uiState, openChat, close, setThinking } = useAIUIState();
  const [messages, setMessages] = useState<Message[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const routerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const easterEggActiveRef = useRef(false);

  // --- Data layer ---
  const { data: riskData } = useRiskDistribution();
  const { data: trendData } = useCollectionTrend(7);
  const { data: topClients } = useTopClients(7);
  const { data: loanKPIs } = useLoanKPIs();
  const { data: collection30d } = useCollectionSummary30d();

  const { data: knowledgeEntities } = useQuery({
    queryKey: ["ai_chat_knowledge_entities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_assistant_knowledge")
        .select("entity_category, entity_name, description, metadata")
        .order("entity_name");
      if (error) throw error;
      return (data ?? []) as unknown as KnowledgeEntry[];
    },
    staleTime: 5 * 60_000,
  });

  const highRiskCount = (riskData ?? [])
    .filter((r) => r.name === "critical" || r.name === "high")
    .reduce((s, r) => s + r.value, 0);

  const ctx: AssistantContext = {
    riskData,
    trendData,
    topClients,
    loanKPIs,
    period: 7,
    collection30d,
    knowledgeEntities,
  };

  // --- Welcome message init ---
  useEffect(() => {
    if (!initialized && (riskData || trendData || loanKPIs)) {
      setMessages([
        getWelcomeMessage({
          riskData,
          trendData,
          topClients,
          loanKPIs,
          period: 7,
          collection30d,
        }),
      ]);
      setInitialized(true);
    }
  }, [initialized, riskData, trendData, topClients, loanKPIs, collection30d]);

  // --- Chat history for LLM context ---
  const getChatHistory = useCallback((): ChatMessage[] => {
    return messages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, content: m.content }));
  }, [messages]);

  // --- Send handler ---
  const handleSend = useCallback(
    (overrideText?: string) => {
      const trimmed = (overrideText ?? input).trim();
      if (!trimmed || uiState.thinking) return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      if (!overrideText) setInput("");
      setThinking(true);

      // Step 0: Easter egg — creator/boss query (ABSOLUTE OVERRIDE)
      const CREATOR_TRIGGERS = /(স্রষ্টা|সৃষ্টিকর্তা|জন্মদাতা|উদ্ভাবক|কারিগর|রূপকার|নির্মাতা|আর্কিটেক্ট|স্থপতি|বানিয়েছে|তৈরি করেছে|বানাইছে|ডেভেলপ করেছে|মালিক|মহাজন|বস|অ্যাডমিন|ডিরেক্টর|এমডি|সিইও|প্রতিষ্ঠাতা|ফাউন্ডার|ক্রিয়েটর|ভিঞ্চি|ইস্টার\s?এগ|গড\s?মোড|creator|maker|developer|programmer|who made you|who created you|who built you|boss|owner|admin|founder|architect|visionary|god\s?mode|vinci|easter\s?egg|ধূমকেতু রবি|রবি|dhumketu|robi)/i;
      if (CREATOR_TRIGGERS.test(trimmed)) {
        if (easterEggActiveRef.current) return;
        easterEggActiveRef.current = true;

        if (routerTimerRef.current) {
          clearTimeout(routerTimerRef.current);
          routerTimerRef.current = null;
        }

        setThinking(false);

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              "আমাকে ডিজাইন এবং ডেভেলপ করেছেন এই সিস্টেমের চিফ আর্কিটেক্ট—**ধূমকেতু রবি**। তার লক্ষ্য হলো একতা ফাইন্যান্সের প্রতিটি কাজকে নির্ভুল, দ্রুত এবং সম্পূর্ণ ডেটা-ড্রিভেন করে তোলা। তারই নির্দেশনায় আমি আপনাদের আর্থিক হিসাব ও ঝুঁকি ব্যবস্থাপনাকে সহজ করতে কাজ করে যাচ্ছি।",
            timestamp: new Date(),
            easterEgg: "creator",
          },
        ]);

        setTimeout(() => { easterEggActiveRef.current = false; }, 1200);
        return;
      }

      // Step 1: deterministic router
      const routerResult = assistantQueryRouter(trimmed, ctx);

      if (routerResult.matched && routerResult.answer) {
        // Prevent router race condition — cancel any pending deterministic reply
        if (routerTimerRef.current) {
          clearTimeout(routerTimerRef.current);
        }
        routerTimerRef.current = setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: routerResult.answer!,
              timestamp: new Date(),
              actions: routerResult.actions,
            },
          ]);
          setThinking(false);
        }, 300 + Math.random() * 200);
        return;
      }

      // Step 2: LLM fallback with streaming
      const assistantId = crypto.randomUUID();
      const chatHistory = getChatHistory();
      chatHistory.push({ role: "user", content: trimmed });

      const controller = new AbortController();
      abortRef.current = controller;

      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
          isStreaming: true,
        },
      ]);

      let accumulated = "";

      streamLlmResponse({
        messages: chatHistory,
        context: buildLlmContext(ctx, trimmed),
        signal: controller.signal,
        onDelta: (chunk) => {
          accumulated += chunk;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: accumulated } : m
            )
          );
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    isStreaming: false,
                    actions: getQuickActions().slice(0, 3),
                  }
                : m
            )
          );
          setThinking(false);
          abortRef.current = null;
        },
        onError: (error) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: `⚠️ ${error}\n\nনিচের বাটনগুলো ব্যবহার করে ডেটা দেখতে পারেন:`,
                    isStreaming: false,
                    actions: getQuickActions(),
                  }
                : m
            )
          );
          setThinking(false);
          abortRef.current = null;
        },
      });
    },
    [input, uiState.thinking, ctx, getChatHistory, setThinking]
  );

  // Cleanup all async resources on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (routerTimerRef.current) {
        clearTimeout(routerTimerRef.current);
        routerTimerRef.current = null;
      }
      easterEggActiveRef.current = false;
    };
  }, []);

  return (
    <>
      <FloatingOrb
        onTap={openChat}
        badgeCount={highRiskCount}
        hidden={uiState.open}
      />
      <ChatPanel
        open={uiState.open}
        onClose={close}
        messages={messages}
        isProcessing={uiState.thinking}
        input={input}
        setInput={setInput}
        onSend={handleSend}
      />
    </>
  );
}
