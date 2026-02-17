import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useMemo } from "react";
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
  ArrowLeft,
  Search,
  X,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const navItems = [
  { path: "/", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { path: "/clients", icon: Users, labelKey: "nav.clients" },
  { path: "/investors", icon: TrendingUp, labelKey: "nav.investors" },
  { path: "/owners", icon: Shield, labelKey: "nav.owners" },
  { path: "/field-officers", icon: UserCog, labelKey: "nav.fieldOfficers" },
  { path: "/loans", icon: Wallet, labelKey: "nav.loans" },
  { path: "/savings", icon: PiggyBank, labelKey: "nav.savings" },
  { path: "/notifications", icon: Bell, labelKey: "nav.notifications" },
  { path: "/settings", icon: Settings, labelKey: "nav.settings" },
];

// Fuzzy search: normalize text by removing symbols, extra spaces, and lowercasing
const normalize = (str: string): string =>
  str
    .toLowerCase()
    .replace(/[^\w\u0980-\u09FF\s]/g, "") // keep alphanumeric + bangla chars
    .replace(/\s+/g, " ")
    .trim();

// Check if query fuzzy-matches target (characters in order, not necessarily adjacent)
const fuzzyMatch = (query: string, target: string): boolean => {
  const nq = normalize(query);
  const nt = normalize(target);
  if (!nq) return true;
  
  // Direct substring match
  if (nt.includes(nq)) return true;
  
  // Character-by-character fuzzy match
  let qi = 0;
  for (let i = 0; i < nt.length && qi < nq.length; i++) {
    if (nt[i] === nq[qi]) qi++;
  }
  return qi === nq.length;
};

export const AppSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return navItems;
    return navItems.filter((item) => {
      const label = t(item.labelKey);
      return fuzzyMatch(searchQuery, label) || fuzzyMatch(searchQuery, item.path);
    });
  }, [searchQuery, t]);

  const isSubPage = location.pathname !== "/";

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar flex flex-col z-50 shadow-xl">
      {/* Brand */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center shadow-md">
            <Landmark className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold text-sidebar-foreground font-english tracking-tight">
              {t("brand.name")}
            </h1>
            <p className="text-xs text-sidebar-muted font-bangla">{t("brand.tagline")}</p>
          </div>
        </div>
      </div>

      {/* Back Button */}
      {isSubPage && (
        <button
          onClick={() => navigate(-1)}
          className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-all duration-200"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-[13px] font-medium">{t("back")}</span>
        </button>
      )}

      {/* Search */}
      <div className="px-3 pt-3 pb-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sidebar-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("search.placeholder")}
            className="w-full pl-9 pr-8 py-2 rounded-lg bg-sidebar-accent/40 text-sm text-sidebar-foreground placeholder:text-sidebar-muted border border-sidebar-border/50 focus:outline-none focus:border-accent focus:bg-sidebar-accent/60 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-sidebar-muted hover:text-sidebar-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-3 space-y-1 overflow-y-auto">
        {filteredItems.length === 0 ? (
          <p className="text-xs text-sidebar-muted text-center py-4 font-bangla">
            {t("search.noResults")}
          </p>
        ) : (
          filteredItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSearchQuery("")}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group ${
                  isActive
                    ? "bg-sidebar-accent text-accent shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-accent" />
                )}
                <item.icon className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? "text-accent" : ""}`} />
                <span className={`font-medium text-[13px] ${isActive ? "text-accent" : ""}`}>
                  {t(item.labelKey)}
                </span>
              </Link>
            );
          })
        )}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-accent-foreground shadow-sm">
            A
          </div>
          <div>
            <p className="text-xs font-medium text-sidebar-foreground">Admin User</p>
            <p className="text-[10px] text-sidebar-muted">{t("header.admin")}</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
