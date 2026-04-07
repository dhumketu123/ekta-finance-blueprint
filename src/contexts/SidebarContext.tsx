import { createContext, useContext, useState, useCallback, ReactNode } from "react";

const SIDEBAR_STATE_KEY = "ekta-sidebar-open";

function readPersistedState(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STATE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistState(open: boolean) {
  try {
    localStorage.setItem(SIDEBAR_STATE_KEY, String(open));
  } catch {}
}

interface SidebarContextType {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  open: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const SidebarStateProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(readPersistedState);

  const toggle = useCallback(() => {
    setIsOpen((p) => { const next = !p; persistState(next); return next; });
  }, []);
  const close = useCallback(() => { setIsOpen(false); persistState(false); }, []);
  const open = useCallback(() => { setIsOpen(true); persistState(true); }, []);

  return (
    <SidebarContext.Provider value={{ isOpen, toggle, close, open }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebarState = () => {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebarState must be used within SidebarStateProvider");
  return ctx;
};
