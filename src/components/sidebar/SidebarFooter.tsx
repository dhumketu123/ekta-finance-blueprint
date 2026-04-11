import { LogOut, Mail } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { ROUTES } from "@/config/routes";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const roleLabels: Record<string, { en: string; bn: string }> = {
  admin: { en: "Admin", bn: "অ্যাডমিন" },
  owner: { en: "Owner", bn: "মালিক" },
  field_officer: { en: "Field Officer", bn: "মাঠকর্মী" },
  investor: { en: "Investor", bn: "বিনিয়োগকারী" },
  treasurer: { en: "Treasurer", bn: "কোষাধ্যক্ষ" },
  alumni: { en: "Alumni", bn: "প্রাক্তন" },
};

const footerBtnClass =
  "flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] outline-none focus-visible:ring-2 focus-visible:ring-offset-1 active:scale-95";

const SidebarFooter = () => {
  const { user, signOut } = useAuth();
  const { role } = usePermissions();
  const { lang } = useLanguage();
  const navigate = useNavigate();

  const roleDisplay = role
    ? lang === "bn"
      ? roleLabels[role]?.bn ?? role
      : roleLabels[role]?.en ?? role
    : "—";

  const userEmail = user?.email ?? "";
  const userName = userEmail.split("@")[0] || "User";

  const handleLogout = async () => {
    await signOut();
    navigate(ROUTES.AUTH);
  };

  const handleMail = () => {
    if (userEmail) {
      window.open(`mailto:${userEmail}`, "_blank");
    } else {
      toast.error(lang === "bn" ? "ইমেইল পাওয়া যায়নি" : "Email not available");
    }
  };

  return (
    <div
      className="mt-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] flex flex-col gap-3 z-50 sticky bottom-0 shrink-0"
      style={{
        backgroundColor: "hsl(var(--sidebar-background))",
        borderTop: "1px solid hsl(var(--sidebar-border))",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{
            backgroundColor: "hsl(var(--sidebar-accent))",
            color: "hsl(var(--sidebar-primary-foreground))",
          }}
        >
          {userEmail.charAt(0).toUpperCase() || "U"}
        </div>
        <div className="min-w-0 flex-1">
          <span
            className="block truncate text-sm font-medium"
            style={{ color: "hsl(var(--sidebar-foreground))" }}
          >
            {userName}
          </span>
          <span
            className="block text-xs truncate capitalize"
            style={{ color: "hsl(var(--sidebar-muted))" }}
          >
            {roleDisplay}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleLogout}
          className={footerBtnClass}
          style={{
            color: "hsl(var(--destructive))",
            // @ts-expect-error CSS custom property
            "--tw-ring-color": "hsl(var(--destructive))",
          }}
          aria-label={lang === "bn" ? "লগআউট" : "Logout"}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "hsl(var(--destructive) / 0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>{lang === "bn" ? "লগআউট" : "Logout"}</span>
        </button>

        <button
          onClick={handleMail}
          className={`${footerBtnClass} ml-auto`}
          style={{
            color: "hsl(var(--sidebar-foreground))",
            // @ts-expect-error CSS custom property
            "--tw-ring-color": "hsl(var(--sidebar-ring))",
          }}
          aria-label={lang === "bn" ? "মেইল পাঠান" : "Send email"}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "hsl(var(--sidebar-accent) / 0.35)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <Mail className="h-3.5 w-3.5" />
          <span>{lang === "bn" ? "মেইল" : "Mail"}</span>
        </button>
      </div>
    </div>
  );
};

export default SidebarFooter;
