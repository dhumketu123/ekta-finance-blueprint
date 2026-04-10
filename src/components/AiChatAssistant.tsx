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
  const routerTimerRef = useRef<ReturnType<typeof setTimeout>>();

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
        context: buildLlmContext(ctx),
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
      if (routerTimerRef.current) clearTimeout(routerTimerRef.current);
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
