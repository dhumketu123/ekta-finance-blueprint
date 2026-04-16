import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { ROUTES } from "@/config/routes";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Deterministic Auth State Machine (Phase 1.1.2 — Final Stability Patch)
 * ──────────────────────────────────────────────────────────────────────
 * IDLE             → initial boot, before any auth check
 * LOADING          → bootstrapping session from storage / sign-in in flight
 * AUTHENTICATED    → user+session set, role fetch not yet started (transient)
 * ROLE_LOADING     → fetching user_roles row
 * READY            → STRICT: user !== null AND session !== null AND role !== null (IMMUTABLE TERMINAL)
 * UNAUTHENTICATED  → no session OR role hydration failed → must show /auth
 *
 * RULES:
 *   1. READY is IMMUTABLE — once set, never mutated until SIGNED_OUT or identity change
 *   2. AuthContext is STATE ONLY — performs ZERO navigation side effects
 *   3. Navigation is owned exclusively by Auth.tsx and ProtectedRoute
 *   4. ALL state names use AUTH_STATES constants — never raw strings
 */
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
  /** @deprecated Use `state` instead. Kept for backward compatibility. */
  loading: boolean;
  signOut: () => Promise<void>;
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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authState, setAuthState] = useState<AuthState>(INITIAL_STATE);
  const navigate = useNavigate();

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
  // STRICT RULE: READY is set ONLY after ALL three (user, session, role) are validated
  // in a single atomic state update. No post-READY corrections allowed.
  const fetchAndApplyRole = useCallback(
    async (user: User, session: Session) => {
      // Pre-validation: refuse to even start if inputs are missing
      if (!user || !session) return;

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

        const role = (data?.role as string | undefined) ?? null;

        // ✅ SAFE RULE: NEVER LOGOUT ON ROLE FAILURE — stay in ROLE_LOADING and retry with backoff
        if (error || !role) {
          setAuthState({
            state: AUTH_STATES.ROLE_LOADING,
            user,
            session,
            role: null,
          });
          setTimeout(() => {
            fetchAndApplyRole(user, session);
          }, 2000);
          return;
        }

        // ✅ ONLY VALID READY STATE — all three guaranteed non-null
        setAuthState({
          state: AUTH_STATES.READY,
          user,
          session,
          role,
        });
        resetInactivityTimer();
      } catch {
        setAuthState({
          state: AUTH_STATES.ROLE_LOADING,
          user,
          session,
          role: null,
        });
        setTimeout(() => {
          fetchAndApplyRole(user, session);
        }, 3000);
      }
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
    // Track current authenticated user id to detect identity changes on TOKEN_REFRESHED
    let currentUserId: string | null = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // CRITICAL: Recovery session is isolated — never promote to READY
      if (event === "PASSWORD_RECOVERY") {
        setAuthState({
          state: AUTH_STATES.UNAUTHENTICATED,
          user: session?.user ?? null,
          session: session ?? null,
          role: null,
        });
        // Recovery navigation is the ONE permitted exception (out-of-band auth flow).
        navigate(ROUTES.RESET_PASSWORD, { replace: true });
        return;
      }

      // On reset page: do not hydrate role / promote state
      if (window.location.pathname === ROUTES.RESET_PASSWORD) {
        return;
      }

      if (event === "SIGNED_IN" && session?.user) {
        currentUserId = session.user.id;
        setAuthState({
          state: AUTH_STATES.AUTHENTICATED,
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
        currentUserId = null;
        setAuthState(UNAUTHENTICATED_STATE);
      }

      if (event === "TOKEN_REFRESHED" && session) {
        // SAFE RULE:
        // - If same user identity AND already READY → only refresh session/user refs.
        // - If user identity changed → revalidate role (fresh hydration).
        // - Otherwise → leave state untouched (don't manufacture READY here).
        const refreshedUserId = session.user?.id ?? null;
        if (currentUserId && refreshedUserId && refreshedUserId !== currentUserId) {
          currentUserId = refreshedUserId;
          setAuthState({
            state: AUTH_STATES.AUTHENTICATED,
            user: session.user,
            session,
            role: null,
          });
          setTimeout(() => {
            if (!cancelled) fetchAndApplyRole(session.user, session);
          }, 0);
          return;
        }
        currentUserId = refreshedUserId;
        setAuthState((prev) =>
          prev.state === AUTH_STATES.READY
            ? { ...prev, session, user: session.user }
            : prev
        );
      }
    });

    // Initial bootstrap
    setAuthState((prev) =>
      prev.state === AUTH_STATES.IDLE ? { ...prev, state: AUTH_STATES.LOADING } : prev
    );
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (window.location.pathname === ROUTES.RESET_PASSWORD) {
        setAuthState({
          state: AUTH_STATES.UNAUTHENTICATED,
          user: session?.user ?? null,
          session: session ?? null,
          role: null,
        });
        return;
      }
      if (session?.user) {
        currentUserId = session.user.id;
        setAuthState({
          state: AUTH_STATES.AUTHENTICATED,
          user: session.user,
          session,
          role: null,
        });
        fetchAndApplyRole(session.user, session);
      } else {
        setAuthState(UNAUTHENTICATED_STATE);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAndApplyRole]);

  const signOut = useCallback(async () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore errors (e.g. expired refresh token)
    }
    setAuthState(UNAUTHENTICATED_STATE);
  }, []);

  // Keep ref in sync for inactivity timer callback
  useEffect(() => {
    signOutRef.current = signOut;
  }, [signOut]);

  const value = useMemo<AuthContextType>(
    () => ({
      ...authState,
      loading: authState.state === AUTH_STATES.IDLE || authState.state === AUTH_STATES.LOADING,
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
