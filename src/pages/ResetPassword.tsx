import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import PasswordStrengthMeter, { validatePassword } from "@/components/PasswordStrengthMeter";
import { Eye, EyeOff, KeyRound } from "lucide-react";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const { toast } = useToast();
  const { lang } = useLanguage();
  const navigate = useNavigate();

  const passwordValidation = validatePassword(password);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) setIsRecovery(true);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setIsRecovery(true);
    });
    return () => subscription.unsubscribe();
  }, []);

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
      toast({ title: lang === "bn" ? "ত্রুটি" : "Error", description: lang === "bn" ? "পাসওয়ার্ড মিলছে না।" : "Passwords do not match.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: lang === "bn" ? "সফল! 🎉" : "Success! 🎉", description: lang === "bn" ? "পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে।" : "Password updated successfully." });
      navigate("/auth");
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "An unknown error occurred";
      toast({ title: lang === "bn" ? "ত্রুটি" : "Error", description: errorMsg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!isRecovery) {
    return (
      <div className="auth-bg min-h-screen flex items-center justify-center p-4 relative overflow-hidden" role="main">
        <div className="auth-orb auth-orb-1" aria-hidden="true" />
        <div className="auth-orb auth-orb-2" aria-hidden="true" />
        <div className="auth-grid" aria-hidden="true" />
        <Card className="auth-glass-card border-0 !bg-transparent w-full max-w-md relative z-20">
          <CardContent className="p-8 text-center">
            <p className="text-white/70 font-bangla">{lang === "bn" ? "অবৈধ বা মেয়াদোত্তীর্ণ রিসেট লিংক।" : "Invalid or expired reset link."}</p>
            <Button onClick={() => navigate("/auth")} className="mt-4 auth-submit-btn">{lang === "bn" ? "লগইনে ফিরে যান" : "Back to Login"}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          <h1 className="auth-brand-title font-bangla">{lang === "bn" ? "নতুন পাসওয়ার্ড সেট করুন" : "Set New Password"}</h1>
          <p className="auth-brand-subtitle mt-2 font-bangla">{lang === "bn" ? "শক্তিশালী পাসওয়ার্ড দিয়ে আপনার অ্যাকাউন্ট সুরক্ষিত করুন 🔒" : "Secure your account with a strong password 🔒"}</p>
        </div>
        <Card className="auth-glass-card border-0 !bg-transparent" role="form" aria-label="Reset password form">
          <CardContent className="px-8 py-8">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label htmlFor="newPassword" className="auth-label">{lang === "bn" ? "নতুন পাসওয়ার্ড" : "New Password"}</label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••"
                    required minLength={10} maxLength={72}
                    className="auth-input pr-10"
                    aria-required="true"
                    aria-describedby="reset-password-strength"
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div id="reset-password-strength">
                  <PasswordStrengthMeter password={password} showChecklist />
                </div>
              </div>
              <div>
                <label htmlFor="confirmPassword" className="auth-label">{lang === "bn" ? "পাসওয়ার্ড নিশ্চিত করুন" : "Confirm Password"}</label>
                <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••••" required minLength={10} maxLength={72} className="auth-input" aria-required="true" />
              </div>
              <Button type="submit" className="w-full auth-submit-btn" disabled={loading || !passwordValidation.isValid} aria-busy={loading}>
                {loading ? <span className="animate-spin mr-2">⏳</span> : <KeyRound size={16} className="mr-2" />}
                {lang === "bn" ? "পাসওয়ার্ড আপডেট করুন" : "Update Password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
