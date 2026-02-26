import { useSubscription } from "@/hooks/useSubscription";
import { ShieldAlert, Clock, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

/** Full-screen overlay when subscription is locked */
const SubscriptionLockOverlay = () => {
  const { isLocked, isExpiringSoon, daysRemaining, subscription, isLoading } = useSubscription();
  const { role } = useAuth();

  // Don't block super_admin
  if (role === "super_admin") return null;
  if (isLoading || !subscription) return null;

  // Expiry warning badge (non-blocking)
  if (isExpiringSoon && !isLocked) {
    return (
      <div className="fixed top-20 right-4 z-50 animate-in slide-in-from-right-5">
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 shadow-lg backdrop-blur-sm">
          <Clock className="h-4 w-4 text-warning" />
          <span className="text-sm font-medium text-warning-foreground">
            সাবস্ক্রিপশন মেয়াদ শেষ হতে {daysRemaining} দিন বাকি ⚠️
          </span>
        </div>
      </div>
    );
  }

  // Lock overlay (blocking)
  if (isLocked) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-md">
        <div className="mx-4 max-w-md rounded-2xl border border-destructive/20 bg-card p-8 shadow-2xl text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <Lock className="h-8 w-8 text-destructive" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">
              সাবস্ক্রিপশন লক হয়েছে 🔒
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              আপনার সাবস্ক্রিপশনের মেয়াদ শেষ হয়ে গেছে। সকল ফিচার আনলক করতে এখনই রিনিউ করুন।
            </p>
          </div>

          <Badge variant="destructive" className="text-xs">
            প্ল্যান: {subscription.plan} — মেয়াদোত্তীর্ণ
          </Badge>

          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                // Navigate to renewal/contact — can be customized per tenant
                window.location.href = "/settings";
              }}
            >
              <ShieldAlert className="mr-2 h-4 w-4" />
              এখনই রিনিউ করুন
            </Button>
            <p className="text-xs text-muted-foreground">
              সমস্যা হলে অ্যাডমিনের সাথে যোগাযোগ করুন
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default SubscriptionLockOverlay;
