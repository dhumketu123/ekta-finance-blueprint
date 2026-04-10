import { useRef, useEffect, useCallback } from "react";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import type { Message } from "./types";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  messages: Message[];
  isProcessing: boolean;
  input: string;
  setInput: (v: string) => void;
  onSend: (text?: string) => void;
}

export function ChatPanel({
  open,
  onClose,
  messages,
  isProcessing,
  input,
  setInput,
  onSend,
}: ChatPanelProps) {
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const isNearBottomRef = useRef(true);
  const smartScrollRafRef = useRef(0);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // --- Streaming-safe scroll anchor system ---
  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  const smartScroll = useCallback(() => {
    cancelAnimationFrame(smartScrollRafRef.current);
    smartScrollRafRef.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const newHeight = el.scrollHeight;
      const delta = newHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = newHeight;
      if (isNearBottomRef.current && delta > 0) {
        el.scrollTo({
          top: el.scrollHeight - el.clientHeight,
          behavior: "auto",
        });
      }
    });
  }, []);

  // Sync initial scroll height
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    prevScrollHeightRef.current = el.scrollHeight;
  }, []);

  // Resize anchor — uses visualViewport on mobile for keyboard safety
  useEffect(() => {
    const handleResize = () => {
      const el = scrollRef.current;
      if (!el) return;
      if (isNearBottomRef.current) {
        el.scrollTop = el.scrollHeight - el.clientHeight;
      }
      prevScrollHeightRef.current = el.scrollHeight;
    };

    // Prefer visualViewport for mobile keyboard events
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", handleResize);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      if (vv) vv.removeEventListener("resize", handleResize);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Listen to user scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => checkNearBottom();
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [checkNearBottom]);

  // Auto-scroll on message changes
  useEffect(() => {
    smartScroll();
  }, [messages.length, isProcessing, smartScroll]);

  // Focus input on open — with cleanup
  useEffect(() => {
    if (open) {
      focusTimerRef.current = setTimeout(
        () => inputRef.current?.focus(),
        300
      );
    }
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    };
  }, [open]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(smartScrollRafRef.current);
    };
  }, []);

  const typing = isProcessing && !messages.some((m) => m.isStreaming);

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
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onClose}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );

  const handleSend = useCallback(() => {
    isNearBottomRef.current = true;
    onSend();
  }, [onSend]);

  const handleAction = useCallback(
    (query: string) => {
      isNearBottomRef.current = true;
      onSend(query);
    },
    [onSend]
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
        <DrawerContent className="flex flex-col h-full min-h-0 overflow-hidden bg-destructive/5">
          <DrawerHeader className="flex-none shrink-0 overflow-hidden border-b border-border/40">
            <DrawerTitle className="sr-only">একতা AI</DrawerTitle>
            {headerContent}
          </DrawerHeader>
          <ChatMessages
            messages={messages}
            typing={typing}
            scrollRef={scrollRef}
            onAction={handleAction}
          />
          <DrawerFooter className="flex-none shrink-0 overflow-hidden p-0">
            <ChatInput
              input={input}
              setInput={setInput}
              onSend={handleSend}
              disabled={isProcessing}
              inputRef={inputRef}
            />
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="flex flex-col h-[100dvh] w-[420px] max-w-[90vw] overflow-hidden p-0 bg-destructive/5"
      >
        <SheetHeader className="flex-none shrink-0 overflow-hidden px-4 py-3 border-b border-border/40">
          <SheetTitle className="sr-only">একতা AI</SheetTitle>
          {headerContent}
        </SheetHeader>
        <ChatMessages
          messages={messages}
          typing={typing}
          scrollRef={scrollRef}
          onAction={handleAction}
        />
        <ChatInput
          input={input}
          setInput={setInput}
          onSend={handleSend}
          disabled={isProcessing}
          inputRef={inputRef}
        />
      </SheetContent>
    </Sheet>
  );
}
