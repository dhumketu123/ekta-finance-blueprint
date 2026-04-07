import { LogOut, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { ROUTES } from "@/config/routes";
import { useNavigate } from "react-router-dom";

const SidebarFooter = () => {
  const { user, signOut } = useAuth();
  const { role } = usePermissions();
  const { lang } = useLanguage();
  const navigate = useNavigate();

  const roleLabels: Record<string, { en: string; bn: string }> = {
    admin: { en: "Admin", bn: "অ্যাডমিন" },
    owner: { en: "Owner", bn: "মালিক" },
    field_officer: { en: "Field Officer", bn: "মাঠকর্মী" },
    investor: { en: "Investor", bn: "বিনিয়োগকারী" },
    treasurer: { en: "Treasurer", bn: "কোষাধ্যক্ষ" },
    alumni: { en: "Alumni", bn: "প্রাক্তন" },
  };

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
      className="p-4"
      style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: "hsl(var(--sidebar-accent))" }}
        >
          <User className="h-4 w-4" style={{ color: "hsl(var(--sidebar-muted))" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-medium truncate"
            style={{ color: "hsl(var(--sidebar-foreground))" }}
          >
            {user?.email?.split("@")[0] ?? "User"}
          </p>
          <p
            className="text-xs truncate capitalize"
            style={{ color: "hsl(var(--sidebar-muted))" }}
          >
            {roleDisplay}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-100 hover:bg-destructive/20"
          style={{ color: "hsl(var(--sidebar-muted))" }}
          aria-label="Logout"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default SidebarFooter;
