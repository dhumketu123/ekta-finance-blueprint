import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { ROUTES } from "@/config/routes";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Deterministic Auth State Machine (Phase 1.1.1 — Hardened)
 * ─────────────────────────────────────────────────────────
 * IDLE             → initial boot, before any auth check
 * AUTH_LOADING     → bootstrapping session from storage / sign-in in flight
 * AUTHENTICATED    → user+session set, role fetch not yet started (transient)
 * ROLE_LOADING     → fetching user_roles row
 * AUTH_READY       → STRICT: user !== null AND session !== null AND role !== null
 * UNAUTHENTICATED  → no session OR role hydration failed → must show /auth
 *
 * RULE: AuthContext is STATE ONLY — it performs ZERO navigation side effects.
 * Navigation is owned exclusively by Auth.tsx (post-login) and ProtectedRoute (guarding).
 */
export type AuthStateName =
  | "IDLE"
  | "LOADING"
  | "AUTHENTICATED"
  | "ROLE_LOADING"
  | "READY"
  | "UNAUTHENTICATED";

/**
 * Backward-compat aliases: legacy state names used by older consumers map
 * 1:1 to the new canonical names. These exist ONLY to avoid breaking external
 * string comparisons; new code MUST use the canonical names above.
 */
const LEGACY_AUTH_LOADING = "AUTH_LOADING" as const;
const LEGACY_AUTH_READY = "AUTH_READY" as const;

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
  // STRICT RULE: AUTH_READY is set ONLY if role !== null.
  // If role is missing/unfetchable, fall back to UNAUTHENTICATED to avoid
  // any unstable intermediate state that downstream guards could misread.
  const fetchAndApplyRole = useCallback(
    async (user: User, session: Session) => {
      setAuthState({ state: "ROLE_LOADING", user, session, role: null });
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        const role = (data?.role as string | undefined) ?? null;

        if (error || !role) {
          // Role hydration failed → SAFE FALLBACK. Never promote to AUTH_READY with null role.
          setAuthState({
            state: "UNAUTHENTICATED",
            user: null,
            session: null,
            role: null,
          });
          return;
        }

        // RUNTIME INVARIANT: READY must NEVER be set with a null role.
        if (!user || !session || !role) {
          setAuthState({
            state: "UNAUTHENTICATED",
            user: null,
            session: null,
            role: null,
          });
          return;
        }
        setAuthState({ state: "READY", user, session, role });
        resetInactivityTimer();
      } catch {
        setAuthState({
          state: "UNAUTHENTICATED",
          user: null,
          session: null,
          role: null,
        });
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
      // CRITICAL: Recovery session is isolated — never promote to AUTH_READY
      if (event === "PASSWORD_RECOVERY") {
        setAuthState({
          state: "UNAUTHENTICATED",
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
        currentUserId = null;
        setAuthState({
          state: "UNAUTHENTICATED",
          user: null,
          session: null,
          role: null,
        });
      }

      if (event === "TOKEN_REFRESHED" && session) {
        // SAFE RULE:
        // - If same user identity AND already AUTH_READY → only refresh session/user refs.
        // - If user identity changed → revalidate role (fresh hydration).
        // - Otherwise → leave state untouched (don't manufacture AUTH_READY here).
        const refreshedUserId = session.user?.id ?? null;
        if (currentUserId && refreshedUserId && refreshedUserId !== currentUserId) {
          currentUserId = refreshedUserId;
          setAuthState({
            state: "AUTHENTICATED",
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
          prev.state === "READY"
            ? { ...prev, session, user: session.user }
            : prev
        );
      }
    });

    // Initial bootstrap
    setAuthState((prev) => (prev.state === "IDLE" ? { ...prev, state: "LOADING" } : prev));
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
        currentUserId = session.user.id;
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
      loading: authState.state === "IDLE" || authState.state === "LOADING",
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
