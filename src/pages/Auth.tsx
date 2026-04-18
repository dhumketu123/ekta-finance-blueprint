import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth, AUTH_STATES } from "@/contexts/AuthContext";
import { ROUTES } from "@/config/routes";
import PasswordStrengthMeter, { validatePassword } from "@/components/PasswordStrengthMeter";
import { Eye, EyeOff, LogIn, UserPlus, Mail, Phone, ArrowLeft, KeyRound } from "lucide-react";
import { lovable } from "@/integrations/lovable/index";

const ROLE_ROUTE_MAP: Record<string, string> = {
  investor: ROUTES.INVESTOR_WALLET,
  field_officer: ROUTES.CLIENTS,
  alumni: ROUTES.ALUMNI,
  admin: ROUTES.DASHBOARD,
  owner: ROUTES.DASHBOARD,
  treasurer: ROUTES.DASHBOARD,
  manager: ROUTES.DASHBOARD,
};

const routeForRole = (role: string | null): string => {
  const safeRole = role?.toLowerCase()?.trim() ?? "";
  // SAFE FALLBACK → unknown roles never get privileged access
  return ROLE_ROUTE_MAP[safeRole] ?? ROUTES.DASHBOARD;
};

type AuthMode = "login" | "signup" | "forgot";
type LoginMethod = "email" | "phone";

const LOGIN_COOLDOWN_MS = 3000;
const RESET_COOLDOWN_MS = 30000;

const Auth = () => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameBn, setNameBn] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shakeError, setShakeError] = useState(false);
  const [loginCooldown, setLoginCooldown] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(false);
  const failCountRef = useRef(0);
  const { toast } = useToast();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state: authStateName, role } = useAuth();

  // ── SINGLE NAVIGATION AUTHORITY (post-login) ──
  // AuthContext is state-only and performs no navigation. Auth.tsx routes the user
  // exactly once, when the state machine reaches READY (role guaranteed non-null).
  const hasNavigatedRef = useRef(false);
  useEffect(() => {
    if (authStateName !== AUTH_STATES.READY) {
      hasNavigatedRef.current = false;
      return;
    }
    if (!role || hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    navigate(routeForRole(role), { replace: true });
  }, [authStateName, role, navigate]);

  // Show expired recovery link message if redirected from ResetPassword
  useEffect(() => {
    if (searchParams.get("error") === "expired_recovery_link") {
      toast({
        title: lang === "bn" ? "লিংক মেয়াদোত্তীর্ণ" : "Reset Link Expired",
        description: lang === "bn"
          ? "রিসেট লিংকের মেয়াদ শেষ হয়ে গেছে। অনুগ্রহ করে পুনরায় পাসওয়ার্ড রিসেট অনুরোধ করুন।"
          : "Your password reset link has expired. Please request a new one.",
        variant: "destructive",
      });
      navigate("/auth", { replace: true });
    }
  }, [searchParams, toast, lang, navigate]);

  const triggerShake = () => {
    setShakeError(true);
    setTimeout(() => setShakeError(false), 600);
  };

  const startLoginCooldown = useCallback(() => {
    failCountRef.current += 1;
    const delay = failCountRef.current >= 3
      ? Math.min(LOGIN_COOLDOWN_MS * failCountRef.current, 15000)
      : LOGIN_COOLDOWN_MS;
    setLoginCooldown(true);
    setTimeout(() => setLoginCooldown(false), delay);
  }, []);

  const passwordValidation = validatePassword(password);

  const isSignupDisabled = mode === "signup" && !passwordValidation.isValid;

  // ── UNIFIED OAUTH HANDLER (Lovable Cloud Managed) ──
  const signInWithProvider = useCallback(
    async (provider: "google" | "apple") => {
      try {
        const result = await lovable.auth.signInWithOAuth(provider, {
          redirect_uri: window.location.origin,
        });
        if (result.error) {
          const message =
            result.error instanceof Error ? result.error.message : String(result.error);
          toast({
            title: lang === "bn" ? "ত্রুটি" : "Error",
            description: message,
            variant: "destructive",
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        toast({
          title: lang === "bn" ? "ত্রুটি" : "Error",
          description: message,
          variant: "destructive",
        });
      }
    },
    [toast, lang]
  );

  const handleLogin = async () => {
    if (loginMethod === "email") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { error } = await supabase.auth.signInWithPassword({ phone, password });
      if (error) throw error;
    }

    failCountRef.current = 0;
    // Navigation is handled by the AUTH_READY effect above (single navigation authority).
  };

  const handleSignup = async () => {
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

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { name_en: nameEn, name_bn: nameBn, phone },
      },
    });
    if (error) throw error;
    toast({
      title: lang === "bn" ? "সফল! 🎉" : "Success! 🎉",
      description: lang === "bn"
        ? "আপনার ইমেইলে একটি নিশ্চিতকরণ লিংক পাঠানো হয়েছে।"
        : "A confirmation link has been sent to your email.",
    });
  };

  const handleForgotPassword = async () => {
    if (resetCooldown) return;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;

    setResetCooldown(true);
    setTimeout(() => setResetCooldown(false), RESET_COOLDOWN_MS);

    toast({
      title: lang === "bn" ? "লিংক পাঠানো হয়েছে ✉️" : "Link Sent ✉️",
      description: lang === "bn"
        ? "পাসওয়ার্ড রিসেট লিংক আপনার ইমেইলে পাঠানো হয়েছে। অনুগ্রহ করে ইমেইল চেক করুন।"
        : "A password reset link has been sent to your email. Please check your inbox.",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginCooldown || loading) return;
    setLoading(true);
    try {
      if (mode === "login") await handleLogin();
      else if (mode === "signup") await handleSignup();
      else await handleForgotPassword();
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "An unknown error occurred";
      triggerShake();
      if (mode === "login") startLoginCooldown();
      toast({
        title: lang === "bn" ? "ত্রুটি" : "Error",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isSubmitDisabled =
    loading ||
    loginCooldown ||
    (mode === "signup" && isSignupDisabled) ||
    (mode === "forgot" && resetCooldown);

  const friendlyCopy: Record<AuthMode, string> = {
    login: lang === "bn" ? "স্বাগতম! আপনার ফাইন্যান্স ওয়ার্ল্ডে প্রবেশ করুন ✨" : "Welcome back, your finance world awaits ✨",
    signup: lang === "bn" ? "আজই যোগ দিন এবং আর্থিক সুরক্ষা নিশ্চিত করুন 🚀" : "Join today and secure your financial future 🚀",
    forgot: lang === "bn" ? "চিন্তা নেই! আমরা আপনাকে সাহায্য করবো 🔐" : "No worries! We'll help you get back in 🔐",
  };

  return (
    <div
      className="auth-bg relative min-h-[100dvh] w-full flex items-center justify-center px-4 py-4 sm:px-6 sm:py-8 overflow-x-hidden overscroll-contain"
      style={{ WebkitOverflowScrolling: "touch" }}
      role="main"
    >
      {/* Background Decorative Layer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="auth-orb auth-orb-1" aria-hidden="true" />
        <div className="auth-orb auth-orb-2" aria-hidden="true" />
        <div className="auth-orb auth-orb-3" aria-hidden="true" />
        <div className="auth-grid" aria-hidden="true" />
      </div>

      <div className={`relative z-10 w-full max-w-md mx-auto animate-fade-in ${shakeError ? "auth-shake" : ""}`}>
        {/* Branding */}
        <div className="text-center mb-4 md:mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-2xl auth-logo-box mb-2 md:mb-4 animate-scale-in">
            <span className="text-white font-bold text-2xl font-bangla">একতা</span>
          </div>
          <h1 className="auth-brand-title font-bangla">একতা ফাইন্যান্স গ্রুপ</h1>
          <p className="auth-brand-subtitle mt-1 md:mt-2 font-bangla">{friendlyCopy[mode]}</p>
        </div>

        {/* Glass Card */}
        <Card className="auth-glass-card border-0 !bg-transparent" role="form" aria-label={mode === "login" ? "Login form" : mode === "signup" ? "Signup form" : "Password recovery form"}>
          <CardHeader className="pb-3 pt-5 md:pt-8 px-5 md:px-8">
            <h2 className="text-lg sm:text-xl font-semibold text-white text-center font-bangla">
              {mode === "login" && (lang === "bn" ? "আপনার অ্যাকাউন্টে লগইন করুন" : "Sign in to your account")}
              {mode === "signup" && (lang === "bn" ? "নতুন অ্যাকাউন্ট তৈরি করুন" : "Create a new account")}
              {mode === "forgot" && (lang === "bn" ? "পাসওয়ার্ড রিসেট করুন" : "Reset your password")}
            </h2>
          </CardHeader>
          <CardContent className="px-5 sm:px-8 pb-6 sm:pb-8">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Login method toggle */}
              {mode === "login" && (
                <div className="flex rounded-xl overflow-hidden border border-white/20" role="tablist" aria-label="Login method">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={loginMethod === "email"}
                    onClick={() => setLoginMethod("email")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all duration-300 ${
                      loginMethod === "email" ? "bg-white/20 text-white" : "bg-transparent text-white/50 hover:text-white/80"
                    }`}
                  >
                    <Mail size={15} />
                    {lang === "bn" ? "ইমেইল" : "Email"}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={loginMethod === "phone"}
                    onClick={() => setLoginMethod("phone")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all duration-300 ${
                      loginMethod === "phone" ? "bg-white/20 text-white" : "bg-transparent text-white/50 hover:text-white/80"
                    }`}
                  >
                    <Phone size={15} />
                    {lang === "bn" ? "ফোন" : "Phone"}
                  </button>
                </div>
              )}

              {/* Signup fields */}
              {mode === "signup" && (
                <>
                  <div>
                    <label htmlFor="nameEn" className="auth-label">{lang === "bn" ? "নাম (ইংরেজি)" : "Name (English)"}</label>
                    <Input id="nameEn" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. John Doe" required maxLength={100} className="auth-input" aria-required="true" />
                  </div>
                  <div>
                    <label htmlFor="nameBn" className="auth-label font-bangla">{lang === "bn" ? "নাম (বাংলা)" : "Name (Bangla)"}</label>
                    <Input id="nameBn" value={nameBn} onChange={(e) => setNameBn(e.target.value)} placeholder="যেমন: জন ডো" className="auth-input font-bangla" maxLength={100} />
                  </div>
                  <div>
                    <label htmlFor="signupPhone" className="auth-label">{lang === "bn" ? "ফোন" : "Phone"}</label>
                    <Input id="signupPhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" maxLength={15} className="auth-input" />
                  </div>
                </>
              )}

              {/* Email or phone */}
              {mode !== "forgot" && mode === "login" && loginMethod === "phone" ? (
                <div>
                  <label htmlFor="loginPhone" className="auth-label">{lang === "bn" ? "ফোন নম্বর" : "Phone Number"}</label>
                  <Input id="loginPhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8801XXXXXXXXX" required maxLength={15} className="auth-input" aria-required="true" />
                </div>
              ) : (
                <div>
                  <label htmlFor="email" className="auth-label">{lang === "bn" ? "ইমেইল" : "Email"}</label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required maxLength={255} className="auth-input" aria-required="true" />
                </div>
              )}

              {/* Password */}
              {mode !== "forgot" && (
                <div>
                  <label htmlFor="password" className="auth-label">{lang === "bn" ? "পাসওয়ার্ড" : "Password"}</label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••"
                      required
                      minLength={10}
                      maxLength={72}
                      className="auth-input pr-10"
                      aria-required="true"
                      aria-describedby={mode === "signup" ? "password-strength" : undefined}
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
                  {mode === "signup" && (
                    <div id="password-strength">
                      <PasswordStrengthMeter password={password} showChecklist />
                    </div>
                  )}
                </div>
              )}

              {/* Forgot password link */}
              {mode === "login" && (
                <div className="flex items-center justify-end">
                  <button type="button" onClick={() => setMode("forgot")} className="text-xs text-white/60 hover:text-white transition-colors font-bangla focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded">
                    {lang === "bn" ? "পাসওয়ার্ড ভুলে গেছেন?" : "Forgot password?"}
                  </button>
                </div>
              )}

              {/* Submit */}
              <Button type="submit" className="w-full auth-submit-btn group" disabled={isSubmitDisabled} aria-busy={loading}>
                {loading ? (
                  <span className="animate-spin mr-2">⏳</span>
                ) : loginCooldown ? (
                  <span className="mr-2">🔒</span>
                ) : mode === "login" ? (
                  <LogIn size={16} className="mr-2 group-hover:translate-x-0.5 transition-transform" />
                ) : mode === "signup" ? (
                  <UserPlus size={16} className="mr-2 group-hover:scale-110 transition-transform" />
                ) : (
                  <KeyRound size={16} className="mr-2" />
                )}
                {loginCooldown
                  ? (lang === "bn" ? "অপেক্ষা করুন..." : "Please wait...")
                  : mode === "login"
                    ? (lang === "bn" ? "লগইন" : "Sign In")
                    : mode === "signup"
                      ? (lang === "bn" ? "রেজিস্ট্রেশন" : "Sign Up")
                      : resetCooldown
                        ? (lang === "bn" ? "ইতিমধ্যে পাঠানো হয়েছে" : "Already sent")
                        : (lang === "bn" ? "রিসেট লিংক পাঠান" : "Send Reset Link")}
              </Button>
            </form>

            {/* Google Sign In */}
            {mode !== "forgot" && (
              <>
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/15" /></div>
                  <div className="relative flex justify-center text-xs"><span className="bg-white/5 backdrop-blur-sm px-3 text-white/40 rounded-full">{lang === "bn" ? "অথবা" : "or"}</span></div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white h-11 rounded-xl font-medium transition-all duration-300"
                  onClick={() => signInWithProvider("google")}
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  {lang === "bn" ? "Google দিয়ে সাইন ইন" : "Sign in with Google"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white h-11 rounded-xl font-medium transition-all duration-300 mt-3"
                  onClick={() => signInWithProvider("apple")}
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                  {lang === "bn" ? "Apple দিয়ে সাইন ইন" : "Sign in with Apple"}
                </Button>
              </>
            )}

            {/* Mode switch */}
            <div className="mt-6 text-center space-y-2">
              {mode === "forgot" ? (
                <button type="button" onClick={() => setMode("login")} className="text-sm text-white/60 hover:text-white transition-colors font-bangla flex items-center justify-center gap-1 mx-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded px-2 py-1">
                  <ArrowLeft size={14} />
                  {lang === "bn" ? "লগইনে ফিরে যান" : "Back to login"}
                </button>
              ) : (
                <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setPassword(""); }} className="text-sm text-white/60 hover:text-white transition-colors font-bangla focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded px-2 py-1">
                  {mode === "login"
                    ? (lang === "bn" ? "অ্যাকাউন্ট নেই? রেজিস্ট্রেশন করুন" : "No account? Sign up")
                    : (lang === "bn" ? "অ্যাকাউন্ট আছে? লগইন করুন" : "Already have an account? Sign in")}
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-white/30 text-xs mt-6 font-bangla" aria-hidden="true">
          © ২০২৫ একতা ফাইন্যান্স গ্রুপ। সর্বস্বত্ব সংরক্ষিত।
        </p>
      </div>
    </div>
  );
};

export default Auth;
