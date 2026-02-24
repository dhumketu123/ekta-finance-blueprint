import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Wallet, TrendingUp, Menu } from "lucide-react";
import { useSidebarState } from "@/contexts/SidebarContext";

const navItemClass = "flex flex-col items-center justify-center gap-1 min-w-12 min-h-12 flex-1 transform-gpu transition-transform duration-200 ease-out active:scale-95 relative";

const ActiveDot = () => (
  <span className="absolute -bottom-1.5 w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.6)] transition-all duration-200 ease-out" />
);

const BottomNav = () => {
  const location = useLocation();
  const { open } = useSidebarState();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path;

  return (
    <nav
      className="fixed bottom-0 left-0 w-full z-[100] bg-background/90 backdrop-blur-xl border-t border-border/40 md:hidden transform-gpu overflow-visible"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
    >
      <div className="flex items-center justify-around h-[68px] pt-2 pb-1 relative overflow-visible">
        {/* 1. Home */}
        <Link
          to="/"
          className={`${navItemClass} ${isActive("/") ? "text-primary" : "text-muted-foreground"}`}
        >
          <LayoutDashboard className="w-6 h-6" />
          <span className="text-[11px] font-medium leading-tight">হোম</span>
          {isActive("/") && <ActiveDot />}
        </Link>

        {/* 2. Clients */}
        <Link
          to="/clients"
          className={`${navItemClass} ${isActive("/clients") ? "text-primary" : "text-muted-foreground"}`}
        >
          <Users className="w-6 h-6" />
          <span className="text-[11px] font-medium leading-tight">গ্রাহক</span>
          {isActive("/clients") && <ActiveDot />}
        </Link>

        {/* 3. Center FAB */}
        <div className="flex-1 flex items-center justify-center relative overflow-visible">
          <Link
            to="/loans"
            className="absolute -top-8 flex items-center justify-center w-16 h-16 rounded-full bg-primary text-primary-foreground shadow-xl transform-gpu transition-transform duration-200 ease-out active:scale-95 active:shadow-[0_0_14px_hsl(var(--primary)/0.5)]"
          >
            <Wallet className="w-7 h-7" />
          </Link>
        </div>

        {/* 4. Savings */}
        <Link
          to="/savings"
          className={`${navItemClass} ${isActive("/savings") ? "text-primary" : "text-muted-foreground"}`}
        >
          <TrendingUp className="w-6 h-6" />
          <span className="text-[11px] font-medium leading-tight">সঞ্চয়</span>
          {isActive("/savings") && <ActiveDot />}
        </Link>

        {/* 5. Menu */}
        <button
          onClick={open}
          className={`${navItemClass} text-muted-foreground`}
        >
          <Menu className="w-6 h-6" />
          <span className="text-[11px] font-medium leading-tight">মেনু</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;
