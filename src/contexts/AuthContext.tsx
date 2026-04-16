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
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const retryCountRef = useRef(0);
  const executionLockRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

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
      executionLockRef.current = null;
      setAuthState(UNAUTHENTICATED_STATE);
      return;
    }

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    clearTimers();

    setAuthState({
      state: AUTH_STATES.ROLE_LOADING,
      user,
      session,
      role: null,
    });

    // 🔥 WATCHDOG (NO HANG GUARANTEE)
    watchdogRef.current = setTimeout(() => {
      setAuthState((prev) => {
        if (prev.state !== AUTH_STATES.ROLE_LOADING) return prev;

        executionLockRef.current = null;
        inFlightRef.current = false;

        return UNAUTHENTICATED_STATE;
      });
    }, 15000);

    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (executionLockRef.current !== user.id) {
        inFlightRef.current = false;
        return;
      }

      const role = (data?.role as string | undefined) ?? null;

      if (error || !role) {
        executionLockRef.current = null;
        inFlightRef.current = false;
        clearTimers();
        setAuthState(UNAUTHENTICATED_STATE);
        return;
      }

      retryCountRef.current = 0;
      executionLockRef.current = null;
      inFlightRef.current = false;
      clearTimers();

      setAuthState({
        state: AUTH_STATES.READY,
        user,
        session,
        role,
      });
    } catch {
      executionLockRef.current = null;
      inFlightRef.current = false;
      clearTimers();
      setAuthState(UNAUTHENTICATED_STATE);
    }
  };

  const triggerRoleFetchOnce = (user: User, session: Session) => {
    const key = user.id;

    if (executionLockRef.current === key) return;

    executionLockRef.current = key;
    fetchAndApplyRole(user, session);
  };

  const signOut = async () => {
    clearTimers();
    retryCountRef.current = 0;
    inFlightRef.current = false;
    executionLockRef.current = null;

    try {
      await supabase.auth.signOut();
    } catch {}

    setAuthState(UNAUTHENTICATED_STATE);
  };

  useEffect(() => {
    signOutRef.current = signOut;
  }, []);

  // ─────────────────────────────────────
  // AUTH STATE LISTENER
  // ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // PASSWORD RECOVERY FLOW
        if (event === "PASSWORD_RECOVERY") {
          setAuthState(UNAUTHENTICATED_STATE);
          if (typeof window !== "undefined") {
            window.location.replace("/reset-password");
          }
          return;
        }

        // SIGNED IN — route directly to ROLE_LOADING (no AUTHENTICATED flicker)
        if (event === "SIGNED_IN" && session?.user) {
          setTimeout(() => {
            if (!cancelled) triggerRoleFetchOnce(session.user, session);
          }, 0);
          return;
        }

        // SIGNED OUT
        if (event === "SIGNED_OUT") {
          clearTimers();
          retryCountRef.current = 0;
          inFlightRef.current = false;
          executionLockRef.current = null;
          setAuthState(UNAUTHENTICATED_STATE);
          return;
        }

        // TOKEN REFRESH — only refresh tokens on already-READY state
        if (event === "TOKEN_REFRESHED" && session?.user) {
          setAuthState((prev) =>
            prev.state === AUTH_STATES.READY
              ? { ...prev, session, user: session.user }
              : prev
          );
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // ─────────────────────────────────────
  // BOOTSTRAP SESSION ON LOAD
  // ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;

      if (session?.user) {
        triggerRoleFetchOnce(session.user, session);
      } else {
        setAuthState(UNAUTHENTICATED_STATE);
      }
    });

    return () => {
      cancelled = true;
    };
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
