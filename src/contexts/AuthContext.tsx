import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { ROUTES } from "@/config/routes";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Deterministic Auth State Machine
 * ─────────────────────────────────
 * IDLE             → initial boot, before any auth check
 * AUTH_LOADING     → bootstrapping session from storage / sign-in in flight
 * AUTHENTICATED    → user+session set, role fetch not yet complete (transient)
 * ROLE_LOADING     → fetching user_roles row
 * AUTH_READY       → user + session + role all hydrated → safe to render protected UI
 * UNAUTHENTICATED  → no session → must show /auth
 */
export type AuthStateName =
  | "IDLE"
  | "AUTH_LOADING"
  | "AUTHENTICATED"
  | "ROLE_LOADING"
  | "AUTH_READY"
  | "UNAUTHENTICATED";

export interface AuthState {
  state: AuthStateName;
  user: User | null;
  session: Session | null;
  role: string | null;
}

interface AuthContextType extends AuthState {
  /** @deprecated Use `state` instead. Kept for backward compatibility. */
  loading: boolean;
  signOut: () => Promise<void>;
}

const INITIAL_STATE: AuthState = {
  state: "IDLE",
  user: null,
  session: null,
  role: null,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Routes that the state-machine navigator must NOT touch
const NAV_BLOCKLIST = new Set<string>([ROUTES.RESET_PASSWORD]);

const routeForRole = (role: string | null): string => {
  switch (role) {
    case "investor":
      return ROUTES.INVESTOR_WALLET;
    case "field_officer":
      return ROUTES.CLIENTS;
    case "alumni":
      return ROUTES.ALUMNI;
    default:
      return ROUTES.DASHBOARD;
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authState, setAuthState] = useState<AuthState>(INITIAL_STATE);
  const navigate = useNavigate();
  const location = useLocation();

  // ── Inactivity timer ──
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signOutRef = useRef(async () => {});

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      signOutRef.current();
    }, SESSION_TIMEOUT_MS);
  }, []);

  // ── Role fetch — SINGLE SOURCE OF TRUTH ──
  const fetchAndApplyRole = useCallback(
    async (user: User, session: Session) => {
      setAuthState({ state: "ROLE_LOADING", user, session, role: null });
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      const role = (data?.role as string | undefined) ?? null;
      setAuthState({ state: "AUTH_READY", user, session, role });
      resetInactivityTimer();
    },
    [resetInactivityTimer]
  );

  // ── Activity listeners for inactivity timeout ──
  useEffect(() => {
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    const handler = () => resetInactivityTimer();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [resetInactivityTimer]);

  // ── Auth bootstrap + state machine driver ──
  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // CRITICAL: Recovery session is isolated — never promote to AUTH_READY
      if (event === "PASSWORD_RECOVERY") {
        setAuthState({
          state: "UNAUTHENTICATED",
          user: session?.user ?? null,
          session: session ?? null,
          role: null,
        });
        navigate(ROUTES.RESET_PASSWORD, { replace: true });
        return;
      }

      // On reset page: do not hydrate role / promote state
      if (window.location.pathname === ROUTES.RESET_PASSWORD) {
        return;
      }

      if (event === "SIGNED_IN" && session?.user) {
        setAuthState({
          state: "AUTHENTICATED",
          user: session.user,
          session,
          role: null,
        });
        // Defer role fetch to next tick to avoid Supabase deadlock inside callback
        setTimeout(() => {
          if (!cancelled) fetchAndApplyRole(session.user, session);
        }, 0);
      }

      if (event === "SIGNED_OUT") {
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        setAuthState({
          state: "UNAUTHENTICATED",
          user: null,
          session: null,
          role: null,
        });
      }

      if (event === "TOKEN_REFRESHED" && session) {
        // Keep the existing role; only refresh session/user references.
        setAuthState((prev) =>
          prev.state === "AUTH_READY"
            ? { ...prev, session, user: session.user }
            : prev
        );
      }
    });

    // Initial bootstrap
    setAuthState((prev) => (prev.state === "IDLE" ? { ...prev, state: "AUTH_LOADING" } : prev));
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (window.location.pathname === ROUTES.RESET_PASSWORD) {
        setAuthState({
          state: "UNAUTHENTICATED",
          user: session?.user ?? null,
          session: session ?? null,
          role: null,
        });
        return;
      }
      if (session?.user) {
        setAuthState({
          state: "AUTHENTICATED",
          user: session.user,
          session,
          role: null,
        });
        fetchAndApplyRole(session.user, session);
      } else {
        setAuthState({
          state: "UNAUTHENTICATED",
          user: null,
          session: null,
          role: null,
        });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAndApplyRole]);

  // ── Centralized navigation: only fires on AUTH_READY transitions from /auth ──
  const lastNavigatedFor = useRef<string | null>(null);
  useEffect(() => {
    if (authState.state !== "AUTH_READY") {
      lastNavigatedFor.current = null;
      return;
    }
    if (NAV_BLOCKLIST.has(location.pathname)) return;
    // Only auto-navigate away from the auth page; respect user's current location otherwise.
    if (location.pathname !== ROUTES.AUTH) return;

    const userKey = authState.user?.id ?? "anon";
    if (lastNavigatedFor.current === userKey) return;
    lastNavigatedFor.current = userKey;

    navigate(routeForRole(authState.role), { replace: true });
  }, [authState.state, authState.role, authState.user?.id, location.pathname, navigate]);

  const signOut = useCallback(async () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore errors (e.g. expired refresh token)
    }
    setAuthState({
      state: "UNAUTHENTICATED",
      user: null,
      session: null,
      role: null,
    });
  }, []);

  // Keep ref in sync for inactivity timer callback
  useEffect(() => {
    signOutRef.current = signOut;
  }, [signOut]);

  const value = useMemo<AuthContextType>(
    () => ({
      ...authState,
      loading: authState.state === "IDLE" || authState.state === "AUTH_LOADING",
      signOut,
    }),
    [authState, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
