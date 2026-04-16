import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export const AUTH_STATES = {
  IDLE: "IDLE",
  LOADING: "LOADING",
  AUTHENTICATED: "AUTHENTICATED",
  ROLE_LOADING: "ROLE_LOADING",
  READY: "READY",
  UNAUTHENTICATED: "UNAUTHENTICATED",
} as const;

export type AuthStateName = typeof AUTH_STATES[keyof typeof AUTH_STATES];

export interface AuthState {
  state: AuthStateName;
  user: User | null;
  session: Session | null;
  role: string | null;
}

interface AuthContextType extends AuthState {
  signOut: () => Promise<void> | void;
}

const INITIAL_STATE: AuthState = {
  state: AUTH_STATES.IDLE,
  user: null,
  session: null,
  role: null,
};

const UNAUTHENTICATED_STATE: AuthState = {
  state: AUTH_STATES.UNAUTHENTICATED,
  user: null,
  session: null,
  role: null,
};

const RETRY_DELAYS_MS = [2000, 3000, 5000] as const;
const MAX_RETRIES = RETRY_DELAYS_MS.length;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authState, setAuthStateRaw] = useState<AuthState>(INITIAL_STATE);

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const retryCountRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signOutRef = useRef<() => void>(() => {});

  const setAuthState = (next: AuthState | ((prev: AuthState) => AuthState)) => {
    setAuthStateRaw((prev) => {
      const candidate = typeof next === "function" ? next(prev) : next;

      if (
        candidate.state === AUTH_STATES.READY &&
        (!candidate.user || !candidate.session || !candidate.role)
      ) {
        return UNAUTHENTICATED_STATE;
      }

      return candidate;
    });
  };

  const clearTimers = () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
  };

  const fetchAndApplyRole = async (user: User, session: Session) => {
    if (!user || !session?.user) {
      setAuthState(UNAUTHENTICATED_STATE);
      return;
    }

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    activeUserIdRef.current = user.id;

    clearTimers();

    // 🔥 WATCHDOG (NO HANG GUARANTEE)
    watchdogRef.current = setTimeout(() => {
      if (authState.state === AUTH_STATES.ROLE_LOADING) {
        setAuthState(UNAUTHENTICATED_STATE);
      }
    }, 15000);

    setAuthState({
      state: AUTH_STATES.ROLE_LOADING,
      user,
      session,
      role: null,
    });

    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (activeUserIdRef.current !== user.id) {
        inFlightRef.current = false;
        return;
      }

      const role = (data?.role as string | undefined) ?? null;

      if (error || !role) {
        inFlightRef.current = false;

        if (retryCountRef.current >= MAX_RETRIES) {
          retryCountRef.current = 0;
          setAuthState(UNAUTHENTICATED_STATE);
          return;
        }

        const delay = RETRY_DELAYS_MS[retryCountRef.current];
        retryCountRef.current += 1;

        retryTimerRef.current = setTimeout(() => {
          fetchAndApplyRole(user, session);
        }, delay);

        return;
      }

      retryCountRef.current = 0;
      inFlightRef.current = false;

      clearTimers();

      setAuthState({
        state: AUTH_STATES.READY,
        user,
        session,
        role,
      });
    } catch {
      inFlightRef.current = false;
      setAuthState(UNAUTHENTICATED_STATE);
    }
  };

  const signOut = async () => {
    clearTimers();
    retryCountRef.current = 0;
    inFlightRef.current = false;
    activeUserIdRef.current = null;

    try {
      await supabase.auth.signOut();
    } catch {}

    setAuthState(UNAUTHENTICATED_STATE);
  };

  useEffect(() => {
    signOutRef.current = signOut;
  }, []);

  useEffect(() => {
    const events = ["mousedown", "keydown", "touchstart", "scroll"];

    const reset = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);

      inactivityTimer.current = setTimeout(() => {
        signOutRef.current();
      }, 20 * 60 * 1000);
    };

    events.forEach((e) => window.addEventListener(e, reset));

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      clearTimers();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ ...authState, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
