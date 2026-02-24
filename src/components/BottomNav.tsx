import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Wallet, TrendingUp, Menu } from "lucide-react";
import { useSidebarState } from "@/contexts/SidebarContext";

const BottomNav = () => {
  const location = useLocation();
  const { open } = useSidebarState();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path;

  return (
    <nav
      className="fixed bottom-0 left-0 w-full z-[100] bg-background border-t border-border md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-end justify-around h-16 relative">
        {/* 1. Home */}
        <Link
          to="/"
          className={`flex flex-col items-center justify-center gap-0.5 min-w-12 min-h-12 flex-1 ${
            isActive("/") ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] leading-tight">হোম</span>
        </Link>

        {/* 2. Clients */}
        <Link
          to="/clients"
          className={`flex flex-col items-center justify-center gap-0.5 min-w-12 min-h-12 flex-1 ${
            isActive("/clients") ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px] leading-tight">গ্রাহক</span>
        </Link>

        {/* 3. Center FAB — Transactions/Loans */}
        <div className="flex-1 flex items-center justify-center relative">
          <Link
            to="/loans"
            className="absolute -top-6 flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg"
          >
            <Wallet className="w-6 h-6" />
          </Link>
        </div>

        {/* 4. Savings/Investors */}
        <Link
          to="/savings"
          className={`flex flex-col items-center justify-center gap-0.5 min-w-12 min-h-12 flex-1 ${
            isActive("/savings") ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <TrendingUp className="w-5 h-5" />
          <span className="text-[10px] leading-tight">সঞ্চয়</span>
        </Link>

        {/* 5. Menu */}
        <button
          onClick={open}
          className="flex flex-col items-center justify-center gap-0.5 min-w-12 min-h-12 flex-1 text-muted-foreground"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] leading-tight">মেনু</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;
