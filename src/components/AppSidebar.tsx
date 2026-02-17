import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Landmark,
  UserCog,
  Wallet,
  PiggyBank,
  Bell,
  Settings,
  Shield,
  TrendingUp,
} from "lucide-react";

const navItems = [
  { path: "/", icon: LayoutDashboard, labelEn: "Dashboard", labelBn: "ড্যাশবোর্ড" },
  { path: "/clients", icon: Users, labelEn: "Clients", labelBn: "গ্রাহক" },
  { path: "/investors", icon: TrendingUp, labelEn: "Investors", labelBn: "বিনিয়োগকারী" },
  { path: "/owners", icon: Shield, labelEn: "Owners", labelBn: "মালিক" },
  { path: "/field-officers", icon: UserCog, labelEn: "Field Officers", labelBn: "মাঠকর্মী" },
  { path: "/loans", icon: Wallet, labelEn: "Loans", labelBn: "ঋণ" },
  { path: "/savings", icon: PiggyBank, labelEn: "Savings", labelBn: "সঞ্চয়" },
  { path: "/notifications", icon: Bell, labelEn: "Notifications", labelBn: "বিজ্ঞপ্তি" },
  { path: "/settings", icon: Settings, labelEn: "Settings", labelBn: "সেটিংস" },
];

export const AppSidebar = () => {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar flex flex-col z-50">
      {/* Brand */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Landmark className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold text-sidebar-foreground font-english tracking-tight">
              Ekta Finance
            </h1>
            <p className="text-xs text-sidebar-muted font-bangla">একতা ফাইন্যান্স</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-sidebar-muted font-bangla">
          সমবায় ক্ষুদ্রঋণ ব্যবস্থাপনা
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 group ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <item.icon className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? "text-sidebar-primary" : ""}`} />
              <div className="flex flex-col leading-tight">
                <span className="font-english font-medium text-[13px]">{item.labelEn}</span>
                <span className="font-bangla text-[11px] opacity-60">{item.labelBn}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold text-sidebar-accent-foreground">
            A
          </div>
          <div>
            <p className="text-xs font-medium text-sidebar-foreground">Admin User</p>
            <p className="text-[10px] text-sidebar-muted">অ্যাডমিন</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
