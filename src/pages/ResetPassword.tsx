import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
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

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({
        title: lang === "bn" ? "ত্রুটি" : "Error",
        description: lang === "bn" ? "পাসওয়ার্ড মিলছে না।" : "Passwords do not match.",
        variant: "destructive",
      });
      return;
    }
    if (password.length < 6) {
      toast({
        title: lang === "bn" ? "ত্রুটি" : "Error",
        description: lang === "bn" ? "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।" : "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({
        title: lang === "bn" ? "সফল!" : "Success!",
        description: lang === "bn" ? "পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে।" : "Password updated successfully.",
      });
      navigate("/auth");
    } catch (error: any) {
      toast({ title: lang === "bn" ? "ত্রুটি" : "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!isRecovery) {
    return (
      <div className="auth-bg min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-grid" />
        <Card className="auth-glass-card border-0 w-full max-w-md relative z-10">
          <CardContent className="p-8 text-center">
            <p className="text-white/70 font-bangla">
              {lang === "bn" ? "অবৈধ বা মেয়াদোত্তীর্ণ রিসেট লিংক।" : "Invalid or expired reset link."}
            </p>
            <Button onClick={() => navigate("/auth")} className="mt-4 auth-submit-btn">
              {lang === "bn" ? "লগইনে ফিরে যান" : "Back to Login"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="auth-bg min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-grid" />
      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl auth-logo-box mb-4">
            <span className="text-white font-bold text-2xl font-bangla">একতা</span>
          </div>
          <h1 className="auth-brand-title font-bangla">নতুন পাসওয়ার্ড সেট করুন</h1>
        </div>
        <Card className="auth-glass-card border-0">
          <CardHeader className="pb-2 pt-8 px-8">
            <p className="text-white/60 text-sm text-center font-bangla">
              {lang === "bn" ? "আপনার নতুন পাসওয়ার্ড দিন" : "Enter your new password"}
            </p>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="auth-label">{lang === "bn" ? "নতুন পাসওয়ার্ড" : "New Password"}</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required minLength={6} maxLength={72}
                    className="auth-input pr-10"
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="auth-label">{lang === "bn" ? "পাসওয়ার্ড নিশ্চিত করুন" : "Confirm Password"}</label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required minLength={6} maxLength={72} className="auth-input" />
              </div>
              <Button type="submit" className="w-full auth-submit-btn" disabled={loading}>
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
