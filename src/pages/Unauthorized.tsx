import { ShieldX, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { ROUTES } from "@/config/routes";

const Unauthorized = () => {
  const { lang } = useLanguage();
  const bn = lang === "bn";

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
        </div>

        <Button asChild variant="outline" className="gap-2">
          <Link to={ROUTES.DASHBOARD}>
            <ArrowLeft className="h-4 w-4" />
            {bn ? "ড্যাশবোর্ডে ফিরুন" : "Back to Dashboard"}
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default Unauthorized;
