import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Wallet, PiggyBank, Menu } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSidebarState } from "@/contexts/SidebarContext";
import { usePermissions } from "@/hooks/usePermissions";

const BottomNav = () => {
  const location = useLocation();
  const { t } = useLanguage();
  const { open } = useSidebarState();
  const { role } = usePermissions();

  const isInvestor = role === "investor";

  const items = isInvestor
    ? [
        { path: "/wallet", icon: Wallet, label: t("nav.wallet") },
      ]
    : [
        { path: "/", icon: LayoutDashboard, label: t("nav.dashboard") },
        { path: "/clients", icon: Users, label: t("nav.clients") },
        { path: "/loans", icon: Wallet, label: t("nav.loans") },
        { path: "/savings", icon: PiggyBank, label: t("nav.savings") },
      ];

  return (
    <nav className="fixed bottom-0 left-0 w-full z-[100] bg-background border-t border-border md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around h-16">
        {items.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-full text-[10px] font-medium transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="truncate max-w-[64px]">{item.label}</span>
            </Link>
          );
        })}
        {/* More / Menu button to open sidebar */}
        <button
          onClick={open}
          className="flex flex-col items-center justify-center gap-1 flex-1 h-full text-[10px] font-medium text-muted-foreground"
        >
          <Menu className="w-5 h-5" />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;
