import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Eye, EyeOff, LogIn, UserPlus, Mail, Phone, ArrowLeft, KeyRound } from "lucide-react";

type AuthMode = "login" | "signup" | "forgot";
type LoginMethod = "email" | "phone";

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
  const { toast } = useToast();
  const { lang } = useLanguage();
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (loginMethod === "email") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { error } = await supabase.auth.signInWithPassword({ phone, password });
      if (error) throw error;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      const role = roleData?.role;
      if (role === "investor") navigate("/investors");
      else if (role === "field_officer") navigate("/clients");
      else navigate("/");
    }
  };

  const handleSignup = async () => {
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
      title: lang === "bn" ? "সফল!" : "Success!",
      description: lang === "bn"
        ? "আপনার ইমেইলে একটি নিশ্চিতকরণ লিংক পাঠানো হয়েছে।"
        : "A confirmation link has been sent to your email.",
    });
  };

  const handleForgotPassword = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
    toast({
      title: lang === "bn" ? "ইমেইল পাঠানো হয়েছে" : "Email Sent",
      description: lang === "bn"
        ? "পাসওয়ার্ড রিসেট লিংক আপনার ইমেইলে পাঠানো হয়েছে।"
        : "A password reset link has been sent to your email.",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") await handleLogin();
      else if (mode === "signup") await handleSignup();
      else await handleForgotPassword();
    } catch (error: any) {
      toast({
        title: lang === "bn" ? "ত্রুটি" : "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-orb auth-orb-3" />
      <div className="auth-grid" />

      <div className="relative z-10 w-full max-w-lg animate-fade-in">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl auth-logo-box mb-4 animate-scale-in">
            <span className="text-white font-bold text-2xl font-bangla">একতা</span>
          </div>
          <h1 className="auth-brand-title font-bangla">
            একতা ফাইন্যান্স গ্রুপ
          </h1>
          <p className="auth-brand-subtitle mt-2">
            {lang === "bn" ? "আপনার আর্থিক সেবায় নিবেদিত" : "Dedicated to Your Financial Services"}
          </p>
        </div>

        {/* Glass Card */}
        <Card className="auth-glass-card border-0">
          <CardHeader className="pb-4 pt-8 px-8">
            <h2 className="text-xl font-semibold text-white text-center font-bangla">
              {mode === "login" && (lang === "bn" ? "আপনার অ্যাকাউন্টে লগইন করুন" : "Sign in to your account")}
              {mode === "signup" && (lang === "bn" ? "নতুন অ্যাকাউন্ট তৈরি করুন" : "Create a new account")}
              {mode === "forgot" && (lang === "bn" ? "পাসওয়ার্ড রিসেট করুন" : "Reset your password")}
            </h2>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Login method toggle - only in login mode */}
              {mode === "login" && (
                <div className="flex rounded-xl overflow-hidden border border-white/20">
                  <button
                    type="button"
                    onClick={() => setLoginMethod("email")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all duration-300 ${
                      loginMethod === "email"
                        ? "bg-white/20 text-white"
                        : "bg-transparent text-white/50 hover:text-white/80"
                    }`}
                  >
                    <Mail size={15} />
                    {lang === "bn" ? "ইমেইল" : "Email"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoginMethod("phone")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all duration-300 ${
                      loginMethod === "phone"
                        ? "bg-white/20 text-white"
                        : "bg-transparent text-white/50 hover:text-white/80"
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
                    <label className="auth-label">{lang === "bn" ? "নাম (ইংরেজি)" : "Name (English)"}</label>
                    <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. John Doe" required maxLength={100} className="auth-input" />
                  </div>
                  <div>
                    <label className="auth-label font-bangla">{lang === "bn" ? "নাম (বাংলা)" : "Name (Bangla)"}</label>
                    <Input value={nameBn} onChange={(e) => setNameBn(e.target.value)} placeholder="যেমন: জন ডো" className="auth-input font-bangla" maxLength={100} />
                  </div>
                  <div>
                    <label className="auth-label">{lang === "bn" ? "ফোন" : "Phone"}</label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" maxLength={15} className="auth-input" />
                  </div>
                </>
              )}

              {/* Email or phone field */}
              {mode !== "forgot" && mode === "login" && loginMethod === "phone" ? (
                <div>
                  <label className="auth-label">{lang === "bn" ? "ফোন নম্বর" : "Phone Number"}</label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8801XXXXXXXXX" required maxLength={15} className="auth-input" />
                </div>
              ) : (
                <div>
                  <label className="auth-label">{lang === "bn" ? "ইমেইল" : "Email"}</label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required maxLength={255} className="auth-input" />
                </div>
              )}

              {/* Password field - not shown in forgot mode */}
              {mode !== "forgot" && (
                <div>
                  <label className="auth-label">{lang === "bn" ? "পাসওয়ার্ড" : "Password"}</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      maxLength={72}
                      className="auth-input pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Forgot password link */}
              {mode === "login" && (
                <div className="text-right">
                  <button type="button" onClick={() => setMode("forgot")} className="text-xs text-white/60 hover:text-white transition-colors font-bangla">
                    {lang === "bn" ? "পাসওয়ার্ড ভুলে গেছেন?" : "Forgot password?"}
                  </button>
                </div>
              )}

              {/* Submit button */}
              <Button type="submit" className="w-full auth-submit-btn" disabled={loading}>
                {loading ? (
                  <span className="animate-spin mr-2">⏳</span>
                ) : mode === "login" ? (
                  <LogIn size={16} className="mr-2" />
                ) : mode === "signup" ? (
                  <UserPlus size={16} className="mr-2" />
                ) : (
                  <KeyRound size={16} className="mr-2" />
                )}
                {mode === "login" && (lang === "bn" ? "লগইন" : "Sign In")}
                {mode === "signup" && (lang === "bn" ? "রেজিস্ট্রেশন" : "Sign Up")}
                {mode === "forgot" && (lang === "bn" ? "রিসেট লিংক পাঠান" : "Send Reset Link")}
              </Button>
            </form>

            {/* Mode switching */}
            <div className="mt-6 text-center space-y-2">
              {mode === "forgot" ? (
                <button type="button" onClick={() => setMode("login")} className="text-sm text-white/60 hover:text-white transition-colors font-bangla flex items-center justify-center gap-1 mx-auto">
                  <ArrowLeft size={14} />
                  {lang === "bn" ? "লগইনে ফিরে যান" : "Back to login"}
                </button>
              ) : (
                <button type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")} className="text-sm text-white/60 hover:text-white transition-colors font-bangla">
                  {mode === "login"
                    ? (lang === "bn" ? "অ্যাকাউন্ট নেই? রেজিস্ট্রেশন করুন" : "No account? Sign up")
                    : (lang === "bn" ? "অ্যাকাউন্ট আছে? লগইন করুন" : "Already have an account? Sign in")}
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-white/30 text-xs mt-6 font-bangla">
          © ২০২৫ একতা ফাইন্যান্স গ্রুপ। সর্বস্বত্ব সংরক্ষিত।
        </p>
      </div>
    </div>
  );
};

export default Auth;
