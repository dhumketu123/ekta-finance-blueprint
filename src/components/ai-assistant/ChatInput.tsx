import { memo } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
}

function ChatInputInner({ input, setInput, onSend, disabled, inputRef }: ChatInputProps) {
  return (
    <div
      className="shrink-0 flex gap-2 p-4 border-t border-border/40 bg-background"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 16px))" }}
    >
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="প্রশ্ন লিখুন... (বাংলা / English)"
        className="flex-1 h-10 rounded-xl border border-border bg-background px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        disabled={disabled}
      />
      <Button
        size="icon"
        className="h-10 w-10 rounded-xl shrink-0"
        onClick={onSend}
        disabled={!input.trim() || disabled}
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}

export const ChatInput = memo(ChatInputInner);
