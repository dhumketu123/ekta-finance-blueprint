import { ShieldX, ArrowLeft, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { ROUTES } from "@/config/routes";
import { getRoleHomeRoute } from "@/config/roleRoutes";

const Unauthorized = () => {
  const { lang } = useLanguage();
  const { role, signOut } = useAuth();
  const navigate = useNavigate();
  const bn = lang === "bn";

  // Send users back to a route they CAN access (their role's home).
  // For null / unknown roles this resolves to /unauthorized itself, so we
  // surface a Sign-Out action instead of a useless "back" link.
  const homeRoute = getRoleHomeRoute(role);
  const hasValidHome = !!role && homeRoute !== ROUTES.UNAUTHORIZED;

  const handleSignOut = async () => {
    await signOut();
    navigate(ROUTES.AUTH, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <ShieldX className="h-8 w-8 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            {bn ? "অ্যাক্সেস সীমাবদ্ধ" : "Access Restricted"}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {bn
              ? "আপনার এই পৃষ্ঠায় প্রবেশের অনুমতি নেই। আপনার যদি অ্যাক্সেস প্রয়োজন হয়, অনুগ্রহ করে প্রশাসকের সাথে যোগাযোগ করুন।"
              : "You do not have permission to access this page. If you believe this is an error, please contact your administrator."}
          </p>
          {role && (
            <p className="text-xs text-muted-foreground/80 pt-2">
              {bn ? "বর্তমান রোল: " : "Current role: "}
              <span className="font-semibold capitalize text-foreground">{role.replace("_", " ")}</span>
            </p>
          )}
        </div>

        {hasValidHome ? (
          <Button asChild variant="outline" className="gap-2">
            <Link to={homeRoute}>
              <ArrowLeft className="h-4 w-4" />
              {bn ? "আমার ড্যাশবোর্ডে ফিরুন" : "Back to My Dashboard"}
            </Link>
          </Button>
        ) : (
          <Button onClick={handleSignOut} variant="outline" className="gap-2">
            <LogOut className="h-4 w-4" />
            {bn ? "সাইন আউট" : "Sign Out"}
          </Button>
        )}
      </div>
    </div>
  );
};

export default Unauthorized;
