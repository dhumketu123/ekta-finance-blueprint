import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Bot, User, Sparkles, Zap, AlertTriangle, BarChart3, Users, Wallet, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRiskDistribution, useCollectionTrend, useTopClients, useLoanKPIs, useCollectionSummary30d } from "@/hooks/useAssistantDataBundle";
import { assistantQueryRouter, getQuickActions, buildLlmContext, getPredictiveSuggestions, detectGaps, type SuggestedAction, type AssistantContext, type KnowledgeEntry } from "@/services/assistantQueryRouter";
import { streamLlmResponse, type ChatMessage } from "@/services/assistantLlmService";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  actions?: SuggestedAction[];
  isStreaming?: boolean;
}

const getWelcomeMessage = (ctx: AssistantContext): Message => {
  const predictive = getPredictiveSuggestions(ctx);
  const gaps = detectGaps(ctx);
  let content = "👋 আসসালামু আলাইকুম! আমি **একতা AI** — আপনার ফাইনান্সিয়াল অ্যাসিস্ট্যান্ট।\n\nআমি ডেটা বিশ্লেষণ, ঝুঁকি রিপোর্ট, এবং যেকোনো আর্থিক প্রশ্নের উত্তর দিতে পারি।";

  if (gaps.length > 0) {
    content += `\n\n🔍 **সিস্টেম গ্যাপ সনাক্ত:**\n${gaps.join("\n")}`;
  }

  if (predictive.length > 0 && predictive[0].icon !== "info") {
    content += "\n\n⚡ **প্রস্তাবিত অ্যাকশন:**";
  }

  return {
    id: "welcome",
    role: "assistant",
    content,
    timestamp: new Date(),
    actions: predictive.length > 0 && predictive[0].icon !== "info" ? predictive : getQuickActions(),
  };
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  alert: <AlertTriangle className="h-3 w-3" />,
  chart: <BarChart3 className="h-3 w-3" />,
  user: <Users className="h-3 w-3" />,
  loan: <Wallet className="h-3 w-3" />,
  info: <Info className="h-3 w-3" />,
};

function formatTime(d: Date) {
  return d.toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Dhaka" });
}

function ActionButtons({ actions, onAction }: { actions: SuggestedAction[]; onAction: (query: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {actions.map((a) => (
        <button
          key={a.query}
          onClick={() => onAction(a.query)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors active:scale-95"
        >
          {ACTION_ICONS[a.icon]}
          {a.label}
        </button>
      ))}
    </div>
  );
}

function ChatMessages({
  messages, typing, scrollRef, onAction,
}: {
  messages: Message[]; typing: boolean; scrollRef: React.RefObject<HTMLDivElement>; onAction: (query: string) => void;
}) {
  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-3 [overflow-anchor:none]" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehavior: "contain", contain: "layout" }}>
      {messages.map((msg) => (
        <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
          <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-1", msg.role === "user" ? "bg-primary/10" : "bg-accent/20")}>
            {msg.role === "user" ? <User className="h-3.5 w-3.5 text-primary" /> : <Bot className="h-3.5 w-3.5 text-accent-foreground" />}
          </div>
          <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm", msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-md" : "bg-muted text-foreground rounded-tl-md")}>
            <div className="prose prose-sm max-w-none dark:prose-invert [&>p]:mb-1 [&>p:last-child]:mb-0 [&>ul]:mt-1 [&>ul]:mb-1 leading-relaxed">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
            {msg.isStreaming && (
              <span className="inline-block h-4 w-1 bg-primary/60 animate-pulse ml-0.5 align-text-bottom rounded-full" />
            )}
            {msg.actions && !msg.isStreaming && (
              <ActionButtons actions={msg.actions} onAction={onAction} />
            )}
            <p className={cn("text-[10px] mt-1.5 opacity-60", msg.role === "user" ? "text-right" : "text-left")}>
              {formatTime(msg.timestamp)}
            </p>
          </div>
        </div>
      ))}
      {typing && (
        <div className="flex gap-2">
          <div className="h-7 w-7 rounded-full bg-accent/20 flex items-center justify-center shrink-0 mt-1">
            <Bot className="h-3.5 w-3.5 text-accent-foreground" />
          </div>
          <div className="bg-muted rounded-2xl rounded-tl-md px-4 py-3">
            <div className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatInput({ input, setInput, onSend, disabled, inputRef }: {
  input: string; setInput: (v: string) => void; onSend: () => void; disabled: boolean; inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="shrink-0 flex gap-2 p-4 border-t border-border/40 bg-background" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 16px))" }}>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
        placeholder="প্রশ্ন লিখুন... (বাংলা / English)"
        className="flex-1 h-10 rounded-xl border border-border bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        disabled={disabled}
      />
      <Button size="icon" className="h-10 w-10 rounded-xl shrink-0" onClick={onSend} disabled={!input.trim() || disabled}>
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function AiChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const isNearBottomRef = useRef(true);
  const isMobile = useIsMobile();

  // --- Draggable orb state ---
  const orbRef = useRef<HTMLDivElement>(null);
  const orbSize = isMobile ? 48 : 56;
  const [orbPos, setOrbPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem("ai-orb-pos");
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });
  const orbDragging = useRef(false);
  const orbOffset = useRef({ x: 0, y: 0 });
  const orbDidDrag = useRef(false);
  const dragStartTime = useRef(0);

  // Set default position on mount if null
  useEffect(() => {
    if (!orbPos) {
      setOrbPos({
        x: window.innerWidth - orbSize - 24,
        y: isMobile ? window.innerHeight - orbSize - 80 : window.innerHeight - orbSize - 24,
      });
    }
  }, [orbPos, orbSize, isMobile]);

  const onOrbPointerDown = useCallback((e: React.PointerEvent) => {
    orbDragging.current = true;
    orbDidDrag.current = false;
    dragStartTime.current = Date.now();
    const rect = orbRef.current?.getBoundingClientRect();
    if (!rect) return;
    orbOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!orbDragging.current) return;
      orbDidDrag.current = true;
      const x = Math.max(0, Math.min(window.innerWidth - orbSize, e.clientX - orbOffset.current.x));
      const y = Math.max(0, Math.min(window.innerHeight - orbSize, e.clientY - orbOffset.current.y));
      setOrbPos({ x, y });
    };
    const onUp = () => {
      if (!orbDragging.current) return;
      orbDragging.current = false;
      setOrbPos((prev) => {
        const centerX = prev.x + orbSize / 2;
        const snappedX = centerX < window.innerWidth / 2 ? 16 : window.innerWidth - orbSize - 16;
        const final = { x: snappedX, y: prev.y };
        localStorage.setItem("ai-orb-pos", JSON.stringify(final));
        return final;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [orbSize]);

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

  const highRiskCount = (riskData ?? []).filter((r) => r.name === "critical" || r.name === "high").reduce((s, r) => s + r.value, 0);

  const ctx: AssistantContext = { riskData, trendData, topClients, loanKPIs, period: 7, collection30d, knowledgeEntities };

  // Initialize welcome message with context-aware gap detection & predictive suggestions
  useEffect(() => {
    if (!initialized && (riskData || trendData || loanKPIs)) {
      setMessages([getWelcomeMessage({ riskData, trendData, topClients, loanKPIs, period: 7, collection30d })]);
      setInitialized(true);
    }
  }, [initialized, riskData, trendData, topClients, loanKPIs, collection30d]);

  // Track if user is near bottom (within 60px)
  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  // Streaming-safe scroll: only auto-scroll if user is near bottom
  const smartScroll = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const newHeight = el.scrollHeight;
      const delta = newHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = newHeight;
      if (isNearBottomRef.current && delta > 0) {
        el.scrollTo({ top: el.scrollHeight - el.clientHeight, behavior: "auto" });
      }
    });
  }, []);

  // Sync initial scroll height (prevents first-render jump)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    prevScrollHeightRef.current = el.scrollHeight;
  }, []);

  // Keep anchored on resize (mobile keyboard safe)
  useEffect(() => {
    const handleResize = () => {
      const el = scrollRef.current;
      if (!el) return;
      if (isNearBottomRef.current) {
        el.scrollTop = el.scrollHeight - el.clientHeight;
      }
      prevScrollHeightRef.current = el.scrollHeight;
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Listen to user scroll to update near-bottom tracker
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => checkNearBottom();
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [checkNearBottom]);

  // Auto-scroll on message/typing changes (respects user scroll position)
  useEffect(() => {
    smartScroll();
  }, [messages.length, isProcessing, smartScroll]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  // Build chat history for LLM context
  const getChatHistory = useCallback((): ChatMessage[] => {
    return messages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, content: m.content }));
  }, [messages]);

  const handleSend = useCallback((overrideText?: string) => {
    const trimmed = (overrideText ?? input).trim();
    // User just sent — force scroll to bottom for their own message
    isNearBottomRef.current = true;
    if (!trimmed || isProcessing) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!overrideText) setInput("");
    setIsProcessing(true);

    // Step 1: Try deterministic router
    const routerResult = assistantQueryRouter(trimmed, ctx);

    if (routerResult.matched && routerResult.answer) {
      // Deterministic answer found — show with slight delay for natural feel
      setTimeout(() => {
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
        setIsProcessing(false);
      }, 300 + Math.random() * 200);
      return;
    }

    // Step 2: LLM fallback with streaming
    const assistantId = crypto.randomUUID();
    const chatHistory = getChatHistory();
    chatHistory.push({ role: "user", content: trimmed });

    const controller = new AbortController();
    abortRef.current = controller;

    // Add empty assistant message for streaming
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
              ? { ...m, isStreaming: false, actions: getQuickActions().slice(0, 3) }
              : m
          )
        );
        setIsProcessing(false);
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
        setIsProcessing(false);
        abortRef.current = null;
      },
    });
  }, [input, isProcessing, ctx, getChatHistory]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const headerContent = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div>
          <span className="font-semibold text-base">একতা AI</span>
          <span className="ml-2 text-[10px] text-muted-foreground">
            {isProcessing ? "চিন্তা করছে..." : "অনলাইন"}
          </span>
        </div>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );

  if (!orbPos) {
    return null;
  }

  return (
    <>
      {/* Draggable Floating Orb */}
      <div
        ref={orbRef}
        onPointerDown={onOrbPointerDown}
        onClick={() => {
          const isClick = !orbDidDrag.current && Date.now() - dragStartTime.current < 250;
          if (isClick) setOpen(true);
        }}
        style={{
          position: "fixed",
          left: orbPos.x,
          top: orbPos.y,
          width: orbSize,
          height: orbSize,
          zIndex: 100,
          touchAction: "none",
          transition: orbDragging.current ? "none" : "left 0.3s ease, top 0.05s ease, transform 0.2s ease, opacity 0.2s ease",
        }}
        className={cn(
          "rounded-full shadow-lg cursor-grab active:cursor-grabbing",
          "bg-gradient-to-br from-primary via-primary/80 to-accent",
          "flex items-center justify-center",
          "shadow-xl shadow-primary/20",
          open && "scale-0 opacity-0 pointer-events-none"
        )}
        aria-label="AI অ্যাসিস্ট্যান্ট খুলুন"
      >
        <MessageCircle className="h-6 w-6 text-primary-foreground" />
        {highRiskCount > 0 && (
          <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center animate-pulse">
            {highRiskCount > 99 ? "99+" : highRiskCount}
          </Badge>
        )}
        <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping opacity-30 pointer-events-none" />
      </div>

      {/* Desktop: Sheet, Mobile: Drawer */}
      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="flex flex-col h-full min-h-0 overflow-hidden bg-destructive/5">
            {/* ZONE 1: HEADER — flex-none shrink-0, no scroll */}
            <DrawerHeader className="flex-none shrink-0 overflow-hidden border-b border-border/40">
              <DrawerTitle className="sr-only">একতা AI</DrawerTitle>
              {headerContent}
            </DrawerHeader>
            {/* ZONE 2: MAIN — flex-1 min-h-0, sole scroll source */}
            <ChatMessages messages={messages} typing={isProcessing && !messages.some((m) => m.isStreaming)} scrollRef={scrollRef} onAction={handleSend} />
            {/* ZONE 3: INPUT — flex-none shrink-0, docked bottom */}
            <DrawerFooter className="flex-none shrink-0 overflow-hidden p-0">
              <ChatInput input={input} setInput={setInput} onSend={() => handleSend()} disabled={isProcessing} inputRef={inputRef} />
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" className="flex flex-col h-[100dvh] w-[420px] max-w-[90vw] overflow-hidden p-0 bg-destructive/5">
            {/* ZONE 1: HEADER */}
            <SheetHeader className="flex-none shrink-0 overflow-hidden px-4 py-3 border-b border-border/40">
              <SheetTitle className="sr-only">একতা AI</SheetTitle>
              {headerContent}
            </SheetHeader>
            {/* ZONE 2: MAIN */}
            <ChatMessages messages={messages} typing={isProcessing && !messages.some((m) => m.isStreaming)} scrollRef={scrollRef} onAction={handleSend} />
            {/* ZONE 3: INPUT */}
            <ChatInput input={input} setInput={setInput} onSend={() => handleSend()} disabled={isProcessing} inputRef={inputRef} />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
