import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { ROUTES } from "@/config/routes";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Deterministic Auth State Machine — Single Source of Truth
 * ──────────────────────────────────────────────────────────────────────
 * IDLE             → initial boot, before any auth check
 * LOADING          → bootstrapping session from storage / sign-in in flight
 * AUTHENTICATED    → user+session set, role fetch not yet started (transient)
 * ROLE_LOADING     → fetching user_roles row (incl. retry window)
 * READY            → STRICT: user !== null AND session !== null AND role !== null (IMMUTABLE TERMINAL)
 * UNAUTHENTICATED  → no session OR role hydration failed (after retries exhausted)
 *
 * RULES:
 *   1. READY is IMMUTABLE — once set, never mutated until SIGNED_OUT or identity change
 *   2. AuthContext is STATE ONLY — performs ZERO navigation (except PASSWORD_RECOVERY)
 *   3. Navigation is owned exclusively by Auth.tsx and ProtectedRoute
 *   4. Role fetch lives ONLY in AuthContext — no other file may query user_roles
 *   5. On role fetch failure → exponential backoff (2s, 3s, 5s) → then UNAUTHENTICATED
 *   6. TOKEN_REFRESHED on READY state → only refresh session/user, never re-fetch role
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

// Exponential backoff schedule for role fetch retries
const RETRY_DELAYS_MS = [2000, 3000, 5000] as const;
const MAX_RETRIES = RETRY_DELAYS_MS.length;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authState, setAuthStateRaw] = useState<AuthState>(INITIAL_STATE);
  const navigate = useNavigate();

  // ── Inactivity timer ──
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signOutRef = useRef(async () => {});

  // ── Role fetch control refs ──
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // In-flight guard: prevents overlapping role fetches from concurrent retries
  const roleFetchInProgressRef = useRef(false);
  // Tracks the user.id whose role fetch is currently in-flight; guards against
  // stale retries firing after sign-out or identity switch.
  const activeFetchUserIdRef = useRef<string | null>(null);

  // ── READY INVARIANT GUARD ──
  // Final safety net: if ANY caller attempts to set state=READY without all three
  // (user, session, role) populated, the setter rejects the mutation and forces
  // UNAUTHENTICATED. Mathematically guarantees READY is always safe to consume.
  const setAuthState = useCallback(
    (next: AuthState | ((prev: AuthState) => AuthState)) => {
      setAuthStateRaw((prev) => {
        const candidate = typeof next === "function" ? next(prev) : next;
        if (
          candidate.state === AUTH_STATES.READY &&
          (!candidate.user || !candidate.session || !candidate.role)
        ) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn(
              "[AuthContext] READY invariant violated — forcing UNAUTHENTICATED",
              { user: !!candidate.user, session: !!candidate.session, role: candidate.role }
            );
          }
          return UNAUTHENTICATED_STATE;
        }
        return candidate;
      });
    },
    []
  );

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      signOutRef.current();
    }, SESSION_TIMEOUT_MS);
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  // ── Role fetch — SINGLE SOURCE OF TRUTH ──
  // STRICT RULE: READY is set ONLY after ALL three (user, session, role) are validated
  // in a single atomic state update. No post-READY corrections allowed.
  const fetchAndApplyRole = useCallback(
    async (user: User, session: Session) => {
      // Guard: refuse to start with missing inputs
      if (!user || !session?.user) {
        roleFetchInProgressRef.current = false;
        activeFetchUserIdRef.current = null;
        retryCountRef.current = 0;
        clearRetryTimer();
        setAuthState(UNAUTHENTICATED_STATE);
        return;
      }

      // ❗ IN-FLIGHT LOCK — prevents overlapping fetches from concurrent retries
      if (roleFetchInProgressRef.current) return;
      roleFetchInProgressRef.current = true;

      activeFetchUserIdRef.current = user.id;

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

        // Stale guard: identity changed or signed out during fetch
        if (activeFetchUserIdRef.current !== user.id) {
          roleFetchInProgressRef.current = false;
          return;
        }

        const role = (data?.role as string | undefined) ?? null;

        // ❗ FAILURE PATH — retry with exponential backoff, then give up
        if (error || !role) {
          roleFetchInProgressRef.current = false;

          if (retryCountRef.current >= MAX_RETRIES) {
            retryCountRef.current = 0;
            activeFetchUserIdRef.current = null;
            setAuthState(UNAUTHENTICATED_STATE);
            return;
          }

          const delay = RETRY_DELAYS_MS[retryCountRef.current];
          retryCountRef.current += 1;

          clearRetryTimer();
          retryTimerRef.current = setTimeout(() => {
            // Re-check stale guard before retrying
            if (activeFetchUserIdRef.current === user.id) {
              fetchAndApplyRole(user, session);
            }
          }, delay);

          return;
        }

        // ✅ SUCCESS — atomic READY assignment, all three guaranteed non-null
        retryCountRef.current = 0;
        roleFetchInProgressRef.current = false;
        clearRetryTimer();

        setAuthState({
          state: AUTH_STATES.READY,
          user,
          session,
          role,
        });
        resetInactivityTimer();
      } catch {
        // Stale guard
        if (activeFetchUserIdRef.current !== user.id) {
          roleFetchInProgressRef.current = false;
          return;
        }

        roleFetchInProgressRef.current = false;

        if (retryCountRef.current >= MAX_RETRIES) {
          retryCountRef.current = 0;
          activeFetchUserIdRef.current = null;
          setAuthState(UNAUTHENTICATED_STATE);
          return;
        }

        const delay = RETRY_DELAYS_MS[retryCountRef.current];
        retryCountRef.current += 1;

        clearRetryTimer();
        retryTimerRef.current = setTimeout(() => {
          if (activeFetchUserIdRef.current === user.id) {
            fetchAndApplyRole(user, session);
          }
        }, delay);
      }
    },
    [resetInactivityTimer, clearRetryTimer, setAuthState]
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
    let currentUserId: string | null = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // CRITICAL: Recovery session is isolated — never promote to READY
      if (event === "PASSWORD_RECOVERY") {
        retryCountRef.current = 0;
        activeFetchUserIdRef.current = null;
        clearRetryTimer();
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
        retryCountRef.current = 0;
        clearRetryTimer();
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
        clearRetryTimer();
        retryCountRef.current = 0;
        activeFetchUserIdRef.current = null;
        currentUserId = null;
        setAuthState(UNAUTHENTICATED_STATE);
      }

      if (event === "TOKEN_REFRESHED" && session) {
        const refreshedUserId = session.user?.id ?? null;

        // Identity changed → revalidate role from scratch
        if (currentUserId && refreshedUserId && refreshedUserId !== currentUserId) {
          currentUserId = refreshedUserId;
          retryCountRef.current = 0;
          clearRetryTimer();
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
        // Same identity: if READY, only refresh session/user refs — do NOT re-fetch role,
        // do NOT change state. Otherwise leave state untouched.
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
        retryCountRef.current = 0;
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
      clearRetryTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAndApplyRole]);

  const signOut = useCallback(async () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    clearRetryTimer();
    retryCountRef.current = 0;
    activeFetchUserIdRef.current = null;
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore errors (e.g. expired refresh token)
    }
    setAuthState(UNAUTHENTICATED_STATE);
  }, [clearRetryTimer]);

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
