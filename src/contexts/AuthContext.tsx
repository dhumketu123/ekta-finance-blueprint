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
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const retryCountRef = useRef(0);

  // SINGLE SOURCE LOCK (only this exists now)
  const currentUserRef = useRef<string | null>(null);

  const signOutRef = useRef<() => void>(() => {});

  // ── SAFE STATE SETTER ──
  const setAuthState = (next: AuthState | ((p: AuthState) => AuthState)) => {
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

  const clearAllTimers = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  };

  // ── CORE ROLE FETCH ──
  const fetchAndApplyRole = async (user: User, session: Session) => {
    if (!user || !session?.user) {
      currentUserRef.current = null;
      retryCountRef.current = 0;
      setAuthState(UNAUTHENTICATED_STATE);
      return;
    }

    // HARD GATE (prevents duplicate + race)
    if (currentUserRef.current === user.id) return;
    currentUserRef.current = user.id;

    clearAllTimers();

    setAuthState({
      state: AUTH_STATES.ROLE_LOADING,
      user,
      session,
      role: null,
    });

    // ── WATCHDOG ──
    watchdogRef.current = setTimeout(() => {
      setAuthState((prev) => {
        if (prev.state !== AUTH_STATES.ROLE_LOADING) return prev;

        currentUserRef.current = null;
        retryCountRef.current = 0;

        return UNAUTHENTICATED_STATE;
      });
    }, 15000);

    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (currentUserRef.current !== user.id) return;

      const role = (data?.role as string | undefined) ?? null;

      if (error || !role) {
        currentUserRef.current = null;
        retryCountRef.current = 0;
        clearAllTimers();
        setAuthState(UNAUTHENTICATED_STATE);
        return;
      }

      retryCountRef.current = 0;
      currentUserRef.current = null;
      clearAllTimers();

      setAuthState({
        state: AUTH_STATES.READY,
        user,
        session,
        role,
      });
    } catch {
      currentUserRef.current = null;
      retryCountRef.current = 0;
      clearAllTimers();
      setAuthState(UNAUTHENTICATED_STATE);
    }
  };

  const triggerRoleFetchOnce = (user: User, session: Session) => {
    fetchAndApplyRole(user, session);
  };

  // ── SIGN OUT ──
  const signOut = async () => {
    clearAllTimers();
    retryCountRef.current = 0;
    currentUserRef.current = null;

    try {
      await supabase.auth.signOut();
    } catch {}

    setAuthState(UNAUTHENTICATED_STATE);
  };

  useEffect(() => {
    signOutRef.current = signOut;
  }, [signOut]);

  // ── INACTIVITY ──
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
      clearAllTimers();
    };
  }, []);

  // ── AUTH LISTENER ──
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setTimeout(() => {
          triggerRoleFetchOnce(session.user, session);
        }, 0);
      }

      if (event === "SIGNED_OUT") {
        clearAllTimers();
        currentUserRef.current = null;
        retryCountRef.current = 0;
        setAuthState(UNAUTHENTICATED_STATE);
      }

      if (event === "TOKEN_REFRESHED" && session?.user) {
        setAuthState((prev) =>
          prev.state === AUTH_STATES.READY
            ? { ...prev, session, user: session.user }
            : prev
        );
      }

      if (event === "PASSWORD_RECOVERY") {
        setAuthState(UNAUTHENTICATED_STATE);
        window.location.replace("/reset-password");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── BOOTSTRAP ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        triggerRoleFetchOnce(session.user, session);
      } else {
        setAuthState(UNAUTHENTICATED_STATE);
      }
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...authState, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
