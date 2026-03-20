import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6">
      <div className="text-center max-w-sm space-y-6">
        {/* Branded 404 */}
        <div className="space-y-2">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-4">
            <Search className="w-10 h-10 text-primary opacity-60" />
          </div>
          <h1 className="text-7xl font-extrabold text-primary tracking-tight">৪০৪</h1>
          <p className="text-lg font-semibold text-foreground">এই পেজটি খুঁজে পাওয়া যায়নি</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            আপনি যে পেজটি খুঁজছেন সেটি সরানো হয়েছে, মুছে ফেলা হয়েছে, অথবা এর ঠিকানা পরিবর্তন হয়েছে।
          </p>
        </div>

        <Button asChild size="lg" className="gap-2 rounded-xl shadow-lg">
          <Link to="/">
            <Home className="w-4 h-4" />
            ড্যাশবোর্ডে ফিরে যান
          </Link>
        </Button>

        <p className="text-[11px] text-muted-foreground/60 font-medium tracking-wide">
          EKTA FINANCE — একতা ফাইন্যান্স
        </p>
      </div>
    </div>
  );
};

export default NotFound;
