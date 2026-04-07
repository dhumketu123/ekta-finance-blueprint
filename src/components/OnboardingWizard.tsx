import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Users,
  TrendingUp,
  BarChart3,
  Shield,
  ArrowRight,
  Sparkles,
} from "lucide-react";

const WIZARD_DISMISSED_KEY = "ekta_onboarding_dismissed";

interface Step {
  icon: React.ElementType;
  title: string;
  titleBn: string;
  description: string;
  descriptionBn: string;
  action?: string;
  actionBn?: string;
  route?: string;
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Welcome to Ekta Finance!",
    titleBn: "একতা ফাইন্যান্সে স্বাগতম!",
    description: "Let's set up your workspace in 4 quick steps. You'll learn the key features and be ready to manage your operations.",
    descriptionBn: "চলুন ৪টি সহজ ধাপে আপনার ওয়ার্কস্পেস সেটআপ করি। আপনি মূল ফিচারগুলো জানবেন এবং অপারেশন পরিচালনায় প্রস্তুত হবেন।",
  },
  {
    icon: Users,
    title: "Manage Clients",
    titleBn: "গ্রাহক পরিচালনা",
    description: "Add clients individually or use Bulk Onboarding for mass import. Track their loans, savings, and payment history.",
    descriptionBn: "গ্রাহক একে একে বা বাল্ক অনবোর্ডিং ব্যবহার করে যোগ করুন। তাদের ঋণ, সঞ্চয়, এবং পেমেন্ট ইতিহাস ট্র্যাক করুন।",
    action: "Go to Clients",
    actionBn: "গ্রাহক পেজে যান",
    route: "/clients",
  },
  {
    icon: TrendingUp,
    title: "Investor Management",
    titleBn: "বিনিয়োগকারী ব্যবস্থাপনা",
    description: "Track investor capital, profit distribution, and weekly transactions with atomic precision.",
    descriptionBn: "বিনিয়োগকারীর মূলধন, লাভ বিতরণ, এবং সাপ্তাহিক লেনদেন atomic নিখুঁততায় ট্র্যাক করুন।",
    action: "View Investors",
    actionBn: "বিনিয়োগকারী দেখুন",
    route: "/investors",
  },
  {
    icon: BarChart3,
    title: "Reports & Analytics",
    titleBn: "রিপোর্ট ও বিশ্লেষণ",
    description: "Access Trial Balance, Profit & Loss, Balance Sheet, and Risk Dashboards for real-time financial insights.",
    descriptionBn: "ট্রায়াল ব্যালেন্স, লাভ-ক্ষতি, ব্যালেন্স শিট, এবং রিস্ক ড্যাশবোর্ড থেকে রিয়েল-টাইম আর্থিক তথ্য পান।",
    action: "View Reports",
    actionBn: "রিপোর্ট দেখুন",
    route: "/reports",
  },
  {
    icon: Shield,
    title: "You're All Set!",
    titleBn: "আপনি প্রস্তুত!",
    description: "Your workspace is ready. Bank-grade security, multi-tenant isolation, and real-time monitoring protect every transaction.",
    descriptionBn: "আপনার ওয়ার্কস্পেস প্রস্তুত। ব্যাংক-গ্রেড সিকিউরিটি, মাল্টি-টেন্যান্ট আইসোলেশন, এবং রিয়েল-টাইম মনিটরিং প্রতিটি লেনদেন সুরক্ষিত রাখে।",
    action: "Start Working",
    actionBn: "কাজ শুরু করুন",
  },
];

const OnboardingWizard = () => {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    const dismissed = localStorage.getItem(`${WIZARD_DISMISSED_KEY}_${user.id}`);
    if (!dismissed) {
      // Small delay so dashboard loads first
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [user?.id]);

  const handleDismiss = () => {
    if (user?.id) {
      localStorage.setItem(`${WIZARD_DISMISSED_KEY}_${user.id}`, "true");
    }
    setIsOpen(false);
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleDismiss();
    }
  };

  const handleAction = (route?: string) => {
    if (route) {
      handleDismiss();
      navigate(route);
    } else {
      handleDismiss();
    }
  };

  const currentStep = STEPS[step];
  const Icon = currentStep.icon;
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-0">
        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-6 text-center space-y-4">
          {/* Step indicator */}
          <div className="flex justify-center gap-1.5 mb-2">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i <= step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/20"
                }`}
              />
            ))}
          </div>

          {/* Icon */}
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Icon className="w-8 h-8 text-primary" />
          </div>

          {/* Content */}
          <div className="space-y-2">
            <h2 className="text-lg font-bold">
              {lang === "bn" ? currentStep.titleBn : currentStep.title}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {lang === "bn" ? currentStep.descriptionBn : currentStep.description}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            {currentStep.action && currentStep.route && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAction(currentStep.route)}
                className="gap-1.5"
              >
                {lang === "bn" ? currentStep.actionBn : currentStep.action}
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button onClick={handleNext} className="gap-1.5">
              {step === STEPS.length - 1 ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  {lang === "bn" ? "শুরু করুন" : "Get Started"}
                </>
              ) : (
                <>
                  {lang === "bn" ? "পরবর্তী" : "Next"}
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
            {step === 0 && (
              <button
                onClick={handleDismiss}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {lang === "bn" ? "পরে দেখবো" : "Skip for now"}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingWizard;
