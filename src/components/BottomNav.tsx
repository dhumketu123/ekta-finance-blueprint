import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Wallet, TrendingUp, Menu } from "lucide-react";
import { useSidebarState } from "@/contexts/SidebarContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useMemo } from "react";

const navItemClass = "flex flex-col items-center justify-center gap-1 min-w-12 min-h-12 flex-1 transform-gpu transition-transform duration-200 ease-out active:scale-95 relative";

const ActiveDot = () => (
  <span className="absolute -bottom-1.5 w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.6)] transition-all duration-200 ease-out" />
);

interface BottomNavItem {
  path: string;
  icon: typeof LayoutDashboard;
  labelEn: string;
  labelBn: string;
  roles: string[];
  isFab?: boolean;
}

const allBottomItems: BottomNavItem[] = [
  { path: "/", icon: LayoutDashboard, labelEn: "Home", labelBn: "হোম", roles: ["admin", "owner", "field_officer", "treasurer"] },
  { path: "/wallet", icon: Wallet, labelEn: "Wallet", labelBn: "ওয়ালেট", roles: ["investor"] },
  { path: "/clients", icon: Users, labelEn: "Clients", labelBn: "গ্রাহক", roles: ["admin", "owner", "field_officer"] },
  { path: "/transactions", icon: Wallet, labelEn: "", labelBn: "", roles: ["admin", "owner", "field_officer", "treasurer"], isFab: true },
  { path: "/savings", icon: TrendingUp, labelEn: "Savings", labelBn: "সঞ্চয়", roles: ["admin", "owner", "field_officer", "treasurer"] },
];

const BottomNav = () => {
  const location = useLocation();
  const { open } = useSidebarState();
  const { lang } = useLanguage();
  const { role } = usePermissions();
  const bn = lang === "bn";
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path;

  const visibleItems = useMemo(() => {
    if (!role) return [];
    return allBottomItems.filter((item) => item.roles.includes(role));
  }, [role]);

  return (
    <nav
      className="fixed bottom-0 left-0 w-full z-[100] bg-background/90 backdrop-blur-xl border-t border-border/40 md:hidden transform-gpu overflow-visible"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
    >
      <div className="flex items-center justify-around h-[68px] pt-2 pb-1 relative overflow-visible">
        {visibleItems.map((item) => {
          if (item.isFab) {
            return (
              <div key={item.path} className="flex-1 flex items-center justify-center relative overflow-visible">
                <Link
                  to={item.path}
                  className="absolute -top-8 flex items-center justify-center w-16 h-16 rounded-full bg-primary text-primary-foreground shadow-xl transform-gpu transition-transform duration-200 ease-out active:scale-95"
                >
                  <item.icon className="w-7 h-7" />
                </Link>
              </div>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`${navItemClass} ${isActive(item.path) ? "text-primary" : "text-muted-foreground"}`}
            >
              <item.icon className="w-6 h-6" />
              <span className="text-[11px] font-medium leading-tight">
                {bn ? item.labelBn : item.labelEn}
              </span>
              {isActive(item.path) && <ActiveDot />}
            </Link>
          );
        })}

        {/* Menu button — always visible */}
        <button
          onClick={open}
          className={`${navItemClass} text-muted-foreground`}
        >
          <Menu className="w-6 h-6" />
          <span className="text-[11px] font-medium leading-tight">{bn ? "মেনু" : "Menu"}</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;
