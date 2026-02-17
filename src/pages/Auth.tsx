import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameBn, setNameBn] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Fetch role and redirect
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();

          const role = roleData?.role;
          if (role === "investor") {
            navigate("/investors");
          } else if (role === "field_officer") {
            navigate("/clients");
          } else {
            navigate("/");
          }
        }
      } else {
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
      }
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md card-elevated">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-2">
            <span className="text-primary-foreground font-bold text-lg font-bangla">একতা</span>
          </div>
          <CardTitle className="text-2xl font-bangla">
            {lang === "bn" ? "একতা ফাইন্যান্স" : "Ekta Finance"}
          </CardTitle>
          <CardDescription className="font-bangla">
            {isLogin
              ? (lang === "bn" ? "আপনার অ্যাকাউন্টে লগইন করুন" : "Sign in to your account")
              : (lang === "bn" ? "নতুন অ্যাকাউন্ট তৈরি করুন" : "Create a new account")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">
                    {lang === "bn" ? "নাম (ইংরেজি)" : "Name (English)"}
                  </label>
                  <Input
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="e.g. John Doe"
                    required
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block font-bangla">
                    {lang === "bn" ? "নাম (বাংলা)" : "Name (Bangla)"}
                  </label>
                  <Input
                    value={nameBn}
                    onChange={(e) => setNameBn(e.target.value)}
                    placeholder="যেমন: জন ডো"
                    className="font-bangla"
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">
                    {lang === "bn" ? "ফোন" : "Phone"}
                  </label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    maxLength={15}
                  />
                </div>
              </>
            )}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                {lang === "bn" ? "ইমেইল" : "Email"}
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                maxLength={255}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                {lang === "bn" ? "পাসওয়ার্ড" : "Password"}
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  maxLength={72}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full btn-depth" disabled={loading}>
              {loading ? (
                <span className="animate-spin mr-2">⏳</span>
              ) : isLogin ? (
                <LogIn size={16} className="mr-2" />
              ) : (
                <UserPlus size={16} className="mr-2" />
              )}
              {isLogin
                ? (lang === "bn" ? "লগইন" : "Sign In")
                : (lang === "bn" ? "রেজিস্ট্রেশন" : "Sign Up")}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-primary hover:underline font-bangla"
            >
              {isLogin
                ? (lang === "bn" ? "অ্যাকাউন্ট নেই? রেজিস্ট্রেশন করুন" : "No account? Sign up")
                : (lang === "bn" ? "অ্যাকাউন্ট আছে? লগইন করুন" : "Already have an account? Sign in")}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
