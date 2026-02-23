import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  LayoutDashboard, Users, Landmark, UserCog, Wallet, PiggyBank,
  Bell, Settings, Shield, TrendingUp, Search, X, LogOut, FlaskConical, ClipboardCheck, BarChart3, ShieldAlert, Monitor, Crown, Atom, Handshake,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSidebarState } from "@/contexts/SidebarContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions, type AppRole } from "@/hooks/usePermissions";

interface NavItem {
  path: string;
  icon: any;
  labelKey: string;
  roles?: AppRole[]; // undefined = all roles
}

const navItems: NavItem[] = [
  { path: "/", icon: LayoutDashboard, labelKey: "nav.dashboard", roles: ["admin", "owner", "field_officer", "treasurer"] },
  { path: "/wallet", icon: Wallet, labelKey: "nav.wallet", roles: ["investor"] },
  { path: "/clients", icon: Users, labelKey: "nav.clients", roles: ["admin", "owner", "field_officer"] },
  { path: "/investors", icon: TrendingUp, labelKey: "nav.investors", roles: ["admin", "owner", "treasurer"] },
  { path: "/owners", icon: Shield, labelKey: "nav.owners", roles: ["admin", "owner"] },
  { path: "/field-officers", icon: UserCog, labelKey: "nav.fieldOfficers", roles: ["admin", "owner"] },
  { path: "/loans", icon: Wallet, labelKey: "nav.loans", roles: ["admin", "owner", "field_officer"] },
  { path: "/savings", icon: PiggyBank, labelKey: "nav.savings", roles: ["admin", "owner", "field_officer", "treasurer"] },
  { path: "/commitments", icon: Handshake, labelKey: "nav.commitments", roles: ["admin", "owner", "field_officer"] },
  { path: "/transactions", icon: Landmark, labelKey: "nav.transactions", roles: ["admin", "owner", "treasurer", "field_officer"] },
  { path: "/approvals", icon: ClipboardCheck, labelKey: "nav.approvals", roles: ["admin", "owner", "treasurer", "field_officer"] },
  { path: "/reports", icon: BarChart3, labelKey: "nav.reports", roles: ["admin", "owner", "treasurer"] },
  { path: "/risk-dashboard", icon: ShieldAlert, labelKey: "nav.riskDashboard", roles: ["admin", "owner", "treasurer"] },
  { path: "/owner-profit", icon: Crown, labelKey: "nav.ownerProfit", roles: ["admin", "owner"] },
  { path: "/quantum-ledger", icon: Atom, labelKey: "nav.quantumLedger", roles: ["admin", "owner", "treasurer"] },
  { path: "/notifications", icon: Bell, labelKey: "nav.notifications", roles: ["admin", "owner"] },
  { path: "/monitoring", icon: Monitor, labelKey: "nav.monitoring", roles: ["admin", "owner"] },
  { path: "/settings", icon: Settings, labelKey: "nav.settings", roles: ["admin", "owner"] },
];

const normalize = (str: string): string =>
  str.toLowerCase().replace(/[^\w\u0980-\u09FF\s]/g, "").replace(/\s+/g, " ").trim();

const fuzzyMatch = (query: string, target: string): boolean => {
  const nq = normalize(query);
  const nt = normalize(target);
  if (!nq) return true;
  if (nt.includes(nq)) return true;
  let qi = 0;
  for (let i = 0; i < nt.length && qi < nq.length; i++) {
    if (nt[i] === nq[qi]) qi++;
  }
  return qi === nq.length;
};

export const AppSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const { isOpen, close } = useSidebarState();
  const { user, signOut } = useAuth();
  const { role } = usePermissions();
  const [searchQuery, setSearchQuery] = useState("");
  const sidebarRef = useRef<HTMLElement>(null);

  const handleLogout = async () => {
    close();
    await signOut();
    navigate("/auth");
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        const toggleBtn = (e.target as HTMLElement).closest('[aria-label="Toggle menu"]');
        if (!toggleBtn) close();
      }
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 10);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handleClickOutside); };
  }, [isOpen, close]);

  useEffect(() => { close(); }, [location.pathname, close]);

  // Filter nav items by role
  const roleFilteredItems = useMemo(() => {
    return navItems.filter((item) => {
      if (!item.roles) return true;
      if (!role) return true; // show all if role not loaded yet
      return item.roles.includes(role);
    });
  }, [role]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return roleFilteredItems;
    return roleFilteredItems.filter((item) => {
      const label = t(item.labelKey);
      return fuzzyMatch(searchQuery, label) || fuzzyMatch(searchQuery, item.path);
    });
  }, [searchQuery, t, roleFilteredItems]);

  const roleLabel = role
    ? { admin: "Admin", owner: "Owner", field_officer: "Field Officer", investor: "Investor", treasurer: "Treasurer" }[role] ?? role
    : "—";

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/30 z-40 transition-opacity duration-300" onClick={close} />}
      <aside
        ref={sidebarRef}
        className={`fixed left-0 top-0 h-screen w-64 bg-sidebar flex flex-col z-50 shadow-2xl transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Brand */}
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-md">
                <Landmark className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-sidebar-foreground font-english tracking-tight">{t("brand.name")}</h1>
                <p className="text-[10px] text-sidebar-muted font-bangla">{t("brand.tagline")}</p>
              </div>
            </div>
            <button onClick={close} className="p-1.5 rounded-lg text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 pt-3 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sidebar-muted" />
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("search.placeholder")}
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-sidebar-accent/40 text-sm text-sidebar-foreground placeholder:text-sidebar-muted border border-sidebar-border/50 focus:outline-none focus:border-accent focus:bg-sidebar-accent/60 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-sidebar-muted hover:text-sidebar-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 px-3 space-y-1 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <p className="text-xs text-sidebar-muted text-center py-4 font-bangla">{t("search.noResults")}</p>
          ) : (
            filteredItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path} to={item.path}
                  onClick={() => { setSearchQuery(""); close(); }}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group ${isActive ? "bg-sidebar-accent text-accent shadow-sm" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}
                >
                  {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-accent" />}
                  <item.icon className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? "text-accent" : ""}`} />
                  <span className={`font-medium text-[13px] ${isActive ? "text-accent" : ""}`}>{t(item.labelKey)}</span>
                </Link>
              );
            })
          )}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-accent-foreground shadow-sm">
              {user?.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.email || "User"}</p>
              <p className="text-[10px] text-sidebar-muted capitalize">{roleLabel}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            {lang === "bn" ? "লগআউট" : "Logout"}
          </button>
        </div>
      </aside>
    </>
  );
};
