import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  const fetchRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    setRole(data?.role ?? null);
  };

  // ── Session inactivity timeout (30 min) ──
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      signOutRef.current();
    }, SESSION_TIMEOUT_MS);
  }, []);

  const signOutRef = useRef(async () => {});

  useEffect(() => {
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    const handler = () => resetInactivityTimer();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [resetInactivityTimer]);

  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // CRITICAL: Isolate recovery session — no role fetch, no dashboard
        if (event === "PASSWORD_RECOVERY") {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
          navigate("/reset-password");
          return;
        }

        // Block recovery session from being promoted on reset page
        if (window.location.pathname === "/reset-password") {
          setLoading(false);
          return;
        }

        if (event === "SIGNED_IN") {
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            setTimeout(() => fetchRole(session.user.id), 0);
            resetInactivityTimer();
          }
        }

        if (event === "SIGNED_OUT") {
          setSession(null);
          setUser(null);
          setRole(null);
          if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        }

        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      // Don't promote session if on reset page
      if (window.location.pathname === "/reset-password") {
        setLoading(false);
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRole(session.user.id);
        resetInactivityTimer();
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [resetInactivityTimer]);

  const signOut = async () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore errors (e.g. expired refresh token)
    }
    setUser(null);
    setSession(null);
    setRole(null);
  };

  // Keep ref in sync for inactivity timer callback
  useEffect(() => {
    signOutRef.current = signOut;
  });

  return (
    <AuthContext.Provider value={{ user, session, loading, role, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
