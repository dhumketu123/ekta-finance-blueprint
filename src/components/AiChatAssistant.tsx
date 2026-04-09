import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Bot, User, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody, DrawerFooter,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRiskDistribution, useCollectionTrend, useTopClients, useLoanKPIs } from "@/hooks/useAssistantDataBundle";
import { assistantQueryRouter } from "@/services/assistantQueryRouter";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const WELCOME_MSG: Message = {
  id: "welcome",
  role: "assistant",
  content: "👋 আসসালামু আলাইকুম! আমি আপনার AI ফাইনান্সিয়াল অ্যাসিস্ট্যান্ট।\n\nআমাকে জিজ্ঞাসা করুন:\n• \"হাই রিস্ক ক্লায়েন্ট\"\n• \"লোন সারাংশ\"\n• \"সংগ্রহ ট্রেন্ড\"\n• \"টপ ক্লায়েন্ট\"\n• \"সিস্টেম স্ট্যাটাস\"",
  timestamp: new Date(),
};

function formatTime(d: Date) {
  return d.toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Dhaka" });
}

function ChatMessages({ messages, typing, scrollRef }: { messages: Message[]; typing: boolean; scrollRef: React.RefObject<HTMLDivElement> }) {
  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-3">
      {messages.map((msg) => (
        <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
          <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-1", msg.role === "user" ? "bg-primary/10" : "bg-accent/20")}>
            {msg.role === "user" ? <User className="h-3.5 w-3.5 text-primary" /> : <Bot className="h-3.5 w-3.5 text-accent-foreground" />}
          </div>
          <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm", msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-md" : "bg-muted text-foreground rounded-tl-md")}>
            <p className="whitespace-pre-line leading-relaxed">{msg.content}</p>
            <p className={cn("text-[10px] mt-1.5 opacity-60", msg.role === "user" ? "text-right" : "text-left")}>{formatTime(msg.timestamp)}</p>
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

function ChatInput({ input, setInput, onSend, typing, inputRef }: {
  input: string; setInput: (v: string) => void; onSend: () => void; typing: boolean; inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="flex gap-2 p-4 border-t border-border/40" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 16px))" }}>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
        placeholder="প্রশ্ন লিখুন..."
        className="flex-1 h-10 rounded-xl border border-border bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        disabled={typing}
      />
      <Button size="icon" className="h-10 w-10 rounded-xl shrink-0" onClick={onSend} disabled={!input.trim() || typing}>
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function AiChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const { data: riskData } = useRiskDistribution();
  const { data: trendData } = useCollectionTrend(7);
  const { data: topClients } = useTopClients(7);
  const { data: loanKPIs } = useLoanKPIs();

  const highRiskCount = (riskData ?? []).filter((r) => r.name === "critical" || r.name === "high").reduce((s, r) => s + r.value, 0);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: trimmed, timestamp: new Date() }]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      const response = assistantQueryRouter(trimmed, { riskData, trendData, topClients, loanKPIs, period: 7 });
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: response, timestamp: new Date() }]);
      setTyping(false);
    }, 400 + Math.random() * 300);
  }, [input, riskData, trendData, topClients, loanKPIs]);

  const headerContent = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <span className="font-semibold text-base">AI অ্যাসিস্ট্যান্ট</span>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed z-[100] rounded-full shadow-lg transition-all duration-300",
          "bg-primary text-primary-foreground hover:scale-105 active:scale-95",
          "flex items-center justify-center",
          isMobile ? "bottom-20 right-4 h-12 w-12" : "bottom-6 right-6 h-14 w-14",
          open && "scale-0 opacity-0"
        )}
        aria-label="AI অ্যাসিস্ট্যান্ট খুলুন"
      >
        <MessageCircle className="h-6 w-6" />
        {highRiskCount > 0 && (
          <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center animate-pulse">
            {highRiskCount > 99 ? "99+" : highRiskCount}
          </Badge>
        )}
      </button>

      {/* Desktop: Sheet, Mobile: Drawer */}
      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="max-h-[92dvh]">
            <DrawerHeader className="border-b border-border/40">{headerContent}</DrawerHeader>
            <DrawerBody>
              <ChatMessages messages={messages} typing={typing} scrollRef={scrollRef} />
            </DrawerBody>
            <DrawerFooter className="p-0">
              <ChatInput input={input} setInput={setInput} onSend={handleSend} typing={typing} inputRef={inputRef} />
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" className="w-[400px] max-w-[90vw] p-0 flex flex-col">
            <SheetHeader className="px-4 py-3 border-b border-border/40">
              <SheetTitle className="sr-only">AI অ্যাসিস্ট্যান্ট</SheetTitle>
              {headerContent}
            </SheetHeader>
            <ChatMessages messages={messages} typing={typing} scrollRef={scrollRef} />
            <ChatInput input={input} setInput={setInput} onSend={handleSend} typing={typing} inputRef={inputRef} />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
