import type { SuggestedAction } from "@/services/assistantQueryRouter";

export interface AIUIState {
  open: boolean;
  mode: "chat" | "panel";
  thinking: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  actions?: SuggestedAction[];
  isStreaming?: boolean;
  easterEgg?: "creator";
}
