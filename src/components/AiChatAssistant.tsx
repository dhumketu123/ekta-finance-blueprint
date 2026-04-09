import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Bot, User, Sparkles, Zap, AlertTriangle, BarChart3, Users, Wallet, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody, DrawerFooter,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRiskDistribution, useCollectionTrend, useTopClients, useLoanKPIs, useCollectionSummary30d } from "@/hooks/useAssistantDataBundle";
import { assistantQueryRouter, getQuickActions, buildLlmContext, type SuggestedAction, type AssistantContext } from "@/services/assistantQueryRouter";
import { streamLlmResponse, type ChatMessage } from "@/services/assistantLlmService";
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

const WELCOME_MSG: Message = {
  id: "welcome",
  role: "assistant",
  content: "👋 আসসালামু আলাইকুম! আমি **একতা AI** — আপনার ফাইনান্সিয়াল অ্যাসিস্ট্যান্ট।\n\nআমি ডেটা বিশ্লেষণ, ঝুঁকি রিপোর্ট, এবং যেকোনো আর্থিক প্রশ্নের উত্তর দিতে পারি। নিচের বাটনগুলো ব্যবহার করুন অথবা নিজের প্রশ্ন লিখুন!",
  timestamp: new Date(),
  actions: getQuickActions(),
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
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-3">
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
    <div className="flex gap-2 p-4 border-t border-border/40" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 16px))" }}>
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
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isMobile = useIsMobile();

  const { data: riskData } = useRiskDistribution();
  const { data: trendData } = useCollectionTrend(7);
  const { data: topClients } = useTopClients(7);
  const { data: loanKPIs } = useLoanKPIs();
  const { data: collection30d } = useCollectionSummary30d();

  const highRiskCount = (riskData ?? []).filter((r) => r.name === "critical" || r.name === "high").reduce((s, r) => s + r.value, 0);

  const ctx: AssistantContext = { riskData, trendData, topClients, loanKPIs, period: 7, collection30d };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isProcessing]);

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

  return (
    <>
      {/* Floating Orb Button */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed z-[100] rounded-full shadow-lg transition-all duration-300",
          "bg-primary text-primary-foreground hover:scale-105 active:scale-95",
          "flex items-center justify-center",
          "hover:shadow-xl hover:shadow-primary/20",
          isMobile ? "bottom-20 right-4 h-12 w-12" : "bottom-6 right-6 h-14 w-14",
          open && "scale-0 opacity-0 pointer-events-none"
        )}
        aria-label="AI অ্যাসিস্ট্যান্ট খুলুন"
      >
        <MessageCircle className="h-6 w-6" />
        {highRiskCount > 0 && (
          <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center animate-pulse">
            {highRiskCount > 99 ? "99+" : highRiskCount}
          </Badge>
        )}
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping opacity-30 pointer-events-none" />
      </button>

      {/* Desktop: Sheet, Mobile: Drawer */}
      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="max-h-[92dvh]">
            <DrawerHeader className="border-b border-border/40">
              <DrawerTitle className="sr-only">একতা AI</DrawerTitle>
              {headerContent}
            </DrawerHeader>
            <DrawerBody className="p-0">
              <ChatMessages messages={messages} typing={isProcessing && !messages.some((m) => m.isStreaming)} scrollRef={scrollRef} onAction={handleSend} />
            </DrawerBody>
            <DrawerFooter className="p-0">
              <ChatInput input={input} setInput={setInput} onSend={() => handleSend()} disabled={isProcessing} inputRef={inputRef} />
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" className="w-[420px] max-w-[90vw] p-0 flex flex-col">
            <SheetHeader className="px-4 py-3 border-b border-border/40">
              <SheetTitle className="sr-only">একতা AI</SheetTitle>
              {headerContent}
            </SheetHeader>
            <ChatMessages messages={messages} typing={isProcessing && !messages.some((m) => m.isStreaming)} scrollRef={scrollRef} onAction={handleSend} />
            <ChatInput input={input} setInput={setInput} onSend={() => handleSend()} disabled={isProcessing} inputRef={inputRef} />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
