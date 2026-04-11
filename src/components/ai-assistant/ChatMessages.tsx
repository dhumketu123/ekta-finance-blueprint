import { memo } from "react";
import { Bot, User, AlertTriangle, BarChart3, Users, Wallet, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import type { Message } from "./types";
import type { SuggestedAction } from "@/services/assistantQueryRouter";
import { CreatorCard } from "./CreatorCard";

const ACTION_ICONS: Record<string, React.ReactNode> = {
  alert: <AlertTriangle className="h-3 w-3" />,
  chart: <BarChart3 className="h-3 w-3" />,
  user: <Users className="h-3 w-3" />,
  loan: <Wallet className="h-3 w-3" />,
  info: <Info className="h-3 w-3" />,
};

function formatTime(d: Date) {
  return d.toLocaleTimeString("bn-BD", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Dhaka",
  });
}

function ActionButtons({
  actions,
  onAction,
}: {
  actions: SuggestedAction[];
  onAction: (query: string) => void;
}) {
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

interface ChatMessagesProps {
  messages: Message[];
  typing: boolean;
  scrollRef: React.RefObject<HTMLDivElement>;
  onAction: (query: string) => void;
}

function ChatMessagesInner({ messages, typing, scrollRef, onAction }: ChatMessagesProps) {
  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-3 [overflow-anchor:none]"
      style={{
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
        overscrollBehavior: "contain",
        contain: "layout",
      }}
    >
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            "flex gap-2",
            msg.role === "user" ? "flex-row-reverse" : "flex-row"
          )}
        >
          <div
            className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-1",
              msg.role === "user" ? "bg-primary/10" : "bg-accent/20"
            )}
          >
            {msg.role === "user" ? (
              <User className="h-3.5 w-3.5 text-primary" />
            ) : (
              <Bot className="h-3.5 w-3.5 text-accent-foreground" />
            )}
          </div>
          <div
            className={cn(
              "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm",
              msg.role === "user"
                ? "bg-primary text-primary-foreground rounded-tr-md"
                : "bg-muted text-foreground rounded-tl-md"
            )}
          >
            <div className="prose prose-sm max-w-none dark:prose-invert [&>p]:mb-1 [&>p:last-child]:mb-0 [&>ul]:mt-1 [&>ul]:mb-1 leading-relaxed">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
            {msg.isStreaming && (
              <span className="inline-block h-4 w-1 bg-primary/60 animate-pulse ml-0.5 align-text-bottom rounded-full" />
            )}
            {msg.easterEgg === "creator" && !msg.isStreaming && (
              <CreatorCard />
            )}
            {msg.actions && !msg.isStreaming && (
              <ActionButtons actions={msg.actions} onAction={onAction} />
            )}
            <p
              className={cn(
                "text-[10px] mt-1.5 opacity-60",
                msg.role === "user" ? "text-right" : "text-left"
              )}
            >
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
              <span
                className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const ChatMessages = memo(ChatMessagesInner);
