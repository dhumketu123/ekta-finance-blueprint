import { useCallback, useReducer } from "react";
import type { AIUIState } from "./types";

type Action =
  | { type: "OPEN_CHAT" }
  | { type: "OPEN_PANEL" }
  | { type: "CLOSE" }
  | { type: "SET_THINKING"; payload: boolean };

function reducer(state: AIUIState, action: Action): AIUIState {
  switch (action.type) {
    case "OPEN_CHAT":
      return { ...state, open: true, mode: "chat" };
    case "OPEN_PANEL":
      return { ...state, open: true, mode: "panel" };
    case "CLOSE":
      return { ...state, open: false };
    case "SET_THINKING":
      return { ...state, thinking: action.payload };
    default:
      return state;
  }
}

const INITIAL: AIUIState = { open: false, mode: "chat", thinking: false };

export function useAIUIState() {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const openChat = useCallback(() => dispatch({ type: "OPEN_CHAT" }), []);
  const close = useCallback(() => dispatch({ type: "CLOSE" }), []);
  const setThinking = useCallback(
    (v: boolean) => dispatch({ type: "SET_THINKING", payload: v }),
    []
  );

  return { state, openChat, close, setThinking };
}
