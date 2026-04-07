import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { ROUTES } from "@/config/routes";
import { useNavigate } from "react-router-dom";

const roleLabels: Record<string, { en: string; bn: string }> = {
  admin: { en: "Admin", bn: "অ্যাডমিন" },
  owner: { en: "Owner", bn: "মালিক" },
  field_officer: { en: "Field Officer", bn: "মাঠকর্মী" },
  investor: { en: "Investor", bn: "বিনিয়োগকারী" },
  treasurer: { en: "Treasurer", bn: "কোষাধ্যক্ষ" },
  alumni: { en: "Alumni", bn: "প্রাক্তন" },
};

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

  const handleLogout = async () => {
    await signOut();
    navigate(ROUTES.AUTH);
  };

  return (
    <div
      className="mt-auto p-4 flex flex-col justify-between gap-2 z-50 sticky bottom-0"
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
          {user?.email?.charAt(0).toUpperCase() ?? "U"}
        </div>
        <div className="min-w-0 flex-1">
          <span
            className="block truncate text-sm font-medium"
            style={{ color: "hsl(var(--sidebar-foreground))" }}
          >
            {user?.email?.split("@")[0] ?? "User"}
          </span>
          <span
            className="block text-xs truncate capitalize"
            style={{ color: "hsl(var(--sidebar-muted))" }}
          >
            {roleDisplay}
          </span>
        </div>
      </div>
      <button
        onClick={handleLogout}
        className="flex items-center gap-1.5 text-xs mt-1 transition-colors duration-100 hover:opacity-80"
        style={{ color: "hsl(var(--destructive))" }}
        aria-label="Logout"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span>{lang === "bn" ? "লগআউট" : "Logout"}</span>
      </button>
    </div>
  );
};

export default SidebarFooter;
