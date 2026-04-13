import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import PasswordStrengthMeter, { validatePassword } from "@/components/PasswordStrengthMeter";
import { Eye, EyeOff, KeyRound, CheckCircle2, ArrowLeft } from "lucide-react";

const FAILSAFE_TIMEOUT_MS = 4000;

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();
  const { lang } = useLanguage();
  const navigate = useNavigate();

  // Tracks whether session was confirmed ready (used by failsafe)
  const sessionConfirmed = useRef(false);

  const passwordValidation = validatePassword(password);

  useEffect(() => {
    let active = true;

    // ── Step 1: URL-based recovery detection ──
    const url = new URL(window.location.href);
    const hasRecovery =
      url.hash.includes("type=recovery") ||
      url.searchParams.get("type") === "recovery" ||
      !!url.searchParams.get("access_token") ||
      !!url.searchParams.get("code");

    // ── Step 2: If URL has recovery tokens, show UI immediately ──
    if (hasRecovery) {
      if (active) setIsRecovery(true);
      // Trigger PKCE code exchange / session hydration (fire-and-forget)
      supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user) sessionConfirmed.current = true;
      });
    }

    // ── Step 3: Listen for PASSWORD_RECOVERY event (primary signal) ──
    // This catches BOTH cases:
    //   a) Direct link with ?code= (PKCE exchange fires event)
    //   b) AuthContext redirect (event already fired, session exists)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return;
        if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session?.user)) {
          sessionConfirmed.current = true;
          setIsRecovery(true);
        }
      }
    );

    // ── Step 4: For AuthContext-redirect case (no URL params) ──
    // Check existing session immediately
    if (!hasRecovery) {
      supabase.auth.getSession().then(({ data }) => {
        if (!active) return;
        if (data.session?.user) {
          sessionConfirmed.current = true;
          setIsRecovery(true);
        }
      });
    }

    // ── Step 5: Failsafe timeout — prevent stuck state ──
    const failsafe = setTimeout(() => {
      if (!active) return;
      // If recovery UI is already showing, user can proceed (session will be
      // checked again at submit time). Only redirect if UI never appeared.
      if (!sessionConfirmed.current && !isRecovery) {
        navigate("/auth?error=expired_recovery_link", { replace: true });
      }
    }, FAILSAFE_TIMEOUT_MS);

    return () => {
      active = false;
      subscription.unsubscribe();
      clearTimeout(failsafe);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!passwordValidation.isValid) {
      toast({
        title: lang === "bn" ? "দুর্বল পাসওয়ার্ড" : "Weak Password",
        description: lang === "bn"
          ? "পাসওয়ার্ডে কমপক্ষে ১০ অক্ষর, বড় হাতের, ছোট হাতের অক্ষর ও সংখ্যা থাকতে হবে।"
          : "Password must include at least 10 characters, uppercase, lowercase and a number.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: lang === "bn" ? "ত্রুটি" : "Error",
        description: lang === "bn" ? "পাসওয়ার্ড মিলছে না।" : "Passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Final session verification before update
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error(
          lang === "bn"
            ? "রিকভারি সেশন প্রস্তুত নয়। পুনরায় রিসেট লিংক ব্যবহার করুন।"
            : "Recovery session not ready. Please use the reset link again."
        );
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setIsSuccess(true);
      toast({
        title: lang === "bn" ? "সফল! 🎉" : "Success! 🎉",
        description: lang === "bn"
          ? "পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে। এখন নতুন পাসওয়ার্ড দিয়ে লগইন করুন।"
          : "Password updated successfully. You can now sign in with your new password.",
      });

      // Zero-Trust: destroy recovery session, force clean login
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate("/auth", { replace: true });
      }, 3000);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "An unknown error occurred";
      toast({
        title: lang === "bn" ? "ত্রুটি" : "Error",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Loading / Invalid state ──
  if (!isRecovery) {
    return (
      <div className="auth-bg min-h-screen flex items-center justify-center p-4 relative overflow-hidden" role="main">
        <div className="auth-orb auth-orb-1" aria-hidden="true" />
        <div className="auth-orb auth-orb-2" aria-hidden="true" />
        <div className="auth-grid" aria-hidden="true" />
        <Card className="auth-glass-card border-0 !bg-transparent w-full max-w-md relative z-20">
          <CardContent className="p-8 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center">
              <KeyRound className="w-7 h-7 text-amber-400" />
            </div>
            <p className="text-white/80 font-bangla font-medium">
              {lang === "bn" ? "রিকভারি সেশন যাচাই হচ্ছে..." : "Verifying recovery session..."}
            </p>
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-400" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Reset password form ──
  return (
    <div className="auth-bg min-h-screen flex items-center justify-center p-4 relative overflow-hidden" role="main">
      <div className="auth-orb auth-orb-1" aria-hidden="true" />
      <div className="auth-orb auth-orb-2" aria-hidden="true" />
      <div className="auth-grid" aria-hidden="true" />
      <div className="relative z-20 w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl auth-logo-box mb-4">
            <span className="text-white font-bold text-2xl font-bangla">একতা</span>
          </div>
          <h1 className="auth-brand-title font-bangla">
            {lang === "bn" ? "নতুন পাসওয়ার্ড সেট করুন" : "Set New Password"}
          </h1>
          <p className="auth-brand-subtitle mt-2 font-bangla">
            {lang === "bn"
              ? "শক্তিশালী পাসওয়ার্ড দিয়ে আপনার অ্যাকাউন্ট সুরক্ষিত করুন 🔒"
              : "Secure your account with a strong password 🔒"}
          </p>
        </div>
        <Card className="auth-glass-card border-0 !bg-transparent" role="form" aria-label="Reset password form">
          <CardContent className="px-8 py-8">
            {isSuccess ? (
              <div className="flex flex-col items-center gap-4 py-6 animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center animate-scale-in">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="text-white/90 font-semibold font-bangla text-lg">
                  {lang === "bn" ? "পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে!" : "Password updated successfully!"}
                </p>
                <p className="text-white/50 text-sm font-bangla">
                  {lang === "bn" ? "লগইন পেজে রিডাইরেক্ট হচ্ছে..." : "Redirecting to login..."}
                </p>
                <div className="w-32 h-1 rounded-full bg-white/10 overflow-hidden mt-2">
                  <div
                    className="h-full bg-emerald-400 rounded-full"
                    style={{ animation: "shrink-bar 3s linear forwards", width: "100%" }}
                  />
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div>
                  <label htmlFor="newPassword" className="auth-label">
                    {lang === "bn" ? "নতুন পাসওয়ার্ড" : "New Password"}
                  </label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••"
                      required
                      minLength={10}
                      maxLength={72}
                      className="auth-input pr-10"
                      aria-required="true"
                      aria-describedby="reset-password-strength"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <div id="reset-password-strength">
                    <PasswordStrengthMeter password={password} showChecklist />
                  </div>
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="auth-label">
                    {lang === "bn" ? "পাসওয়ার্ড নিশ্চিত করুন" : "Confirm Password"}
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••"
                    required
                    minLength={10}
                    maxLength={72}
                    className="auth-input"
                    aria-required="true"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full auth-submit-btn"
                  disabled={loading || !passwordValidation.isValid}
                  aria-busy={loading}
                >
                  {loading ? (
                    <span className="animate-spin mr-2">⏳</span>
                  ) : (
                    <KeyRound size={16} className="mr-2" />
                  )}
                  {lang === "bn" ? "পাসওয়ার্ড আপডেট করুন" : "Update Password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
