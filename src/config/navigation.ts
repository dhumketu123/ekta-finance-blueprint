import {
  LayoutDashboard,
  ArrowLeftRight,
  CheckSquare,
  Moon,
  Handshake,
  Users,
  Landmark,
  PiggyBank,
  TrendingUp,
  ShieldAlert,
  Map,
  BarChart3,
  FileText,
  Scale,
  BookOpen,
  Calculator,
  Settings,
  UserCog,
  Building2,
  Shield,
  Bell,
  Wallet,
  Crown,
  Atom,
  Monitor,
  Activity,
  Flame,
  ShieldCheck,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/hooks/usePermissions";
import { ROUTES } from "@/config/routes";
import type { SystemModule } from "@/core/system-index";

export interface NavItem {
  label: string;
  labelBn?: string;
  path: string;
  icon: LucideIcon;
  roles: AppRole[];
  /**
   * Optional link to SYSTEM_INDEX module id.
   * Used by AI Assistant for context injection. Does NOT affect rendering.
   * Typed against SystemModule["id"] to prevent silent drift.
   */
  moduleId?: SystemModule["id"];
}

export interface NavGroup {
  title: string;
  titleBn?: string;
  items: NavItem[];
}

const ALL_OPS: AppRole[] = ["admin", "owner", "field_officer", "treasurer"];
const MANAGEMENT: AppRole[] = ["admin", "owner"];
const ADMIN_ONLY: AppRole[] = ["admin"];

export const navigationGroups: NavGroup[] = [
  {
    title: "CORE OPERATIONS",
    titleBn: "মূল কার্যক্রম",
    items: [
      { label: "Dashboard", labelBn: "ড্যাশবোর্ড", path: ROUTES.DASHBOARD, icon: LayoutDashboard, roles: ALL_OPS, moduleId: "dashboard" },
      { label: "Wallet", labelBn: "ওয়ালেট", path: ROUTES.INVESTOR_WALLET, icon: Wallet, roles: ["investor"], moduleId: "investor_wallet" },
      { label: "Transactions", labelBn: "লেনদেন", path: ROUTES.TRANSACTIONS, icon: ArrowLeftRight, roles: ALL_OPS, moduleId: "transactions" },
      { label: "Approvals", labelBn: "অনুমোদন", path: ROUTES.APPROVALS, icon: CheckSquare, roles: ALL_OPS, moduleId: "approvals" },
      { label: "Day Close", labelBn: "দিন বন্ধ", path: ROUTES.DAY_CLOSE, icon: Moon, roles: ALL_OPS, moduleId: "day_close" },
      { label: "Commitments", labelBn: "প্রতিশ্রুতি", path: ROUTES.COMMITMENTS, icon: Handshake, roles: ["admin", "owner", "field_officer"], moduleId: "commitments" },
    ],
  },
  {
    title: "CUSTOMER & INVESTOR",
    titleBn: "গ্রাহক ও বিনিয়োগকারী",
    items: [
      { label: "Clients", labelBn: "গ্রাহক", path: ROUTES.CLIENTS, icon: Users, roles: ["admin", "owner", "field_officer"], moduleId: "clients" },
      { label: "Loans", labelBn: "ঋণ", path: ROUTES.LOANS, icon: Landmark, roles: ["admin", "owner", "field_officer"], moduleId: "loans" },
      { label: "Savings", labelBn: "সঞ্চয়", path: ROUTES.SAVINGS, icon: PiggyBank, roles: ["admin", "owner", "field_officer", "treasurer"], moduleId: "savings" },
      { label: "Investors", labelBn: "বিনিয়োগকারী", path: ROUTES.INVESTORS, icon: TrendingUp, roles: ["admin", "owner", "treasurer"], moduleId: "investors" },
      { label: "Owners", labelBn: "মালিক", path: ROUTES.OWNERS, icon: Building2, roles: MANAGEMENT, moduleId: "owners" },
      { label: "Field Officers", labelBn: "মাঠকর্মী", path: ROUTES.FIELD_OFFICERS, icon: Map, roles: MANAGEMENT, moduleId: "field_officers" },
    ],
  },
  {
    title: "RISK & CONTROL",
    titleBn: "ঝুঁকি ও নিয়ন্ত্রণ",
    items: [
      { label: "Risk Dashboard", labelBn: "ঝুঁকি ড্যাশবোর্ড", path: ROUTES.RISK_DASHBOARD, icon: ShieldAlert, roles: ["admin", "owner", "treasurer"], moduleId: "risk_dashboard" },
      { label: "Risk Heatmap", labelBn: "ঝুঁকি হিটম্যাপ", path: ROUTES.RISK_HEATMAP, icon: Flame, roles: ALL_OPS, moduleId: "risk_heatmap" },
      { label: "Governance", labelBn: "গভর্ন্যান্স", path: ROUTES.GOVERNANCE, icon: Shield, roles: MANAGEMENT, moduleId: "governance" },
      { label: "Monitoring", labelBn: "মনিটরিং", path: ROUTES.MONITORING, icon: Monitor, roles: MANAGEMENT, moduleId: "monitoring" },
    ],
  },
  {
    title: "INTELLIGENCE & REPORTING",
    titleBn: "বুদ্ধিমত্তা ও রিপোর্টিং",
    items: [
      { label: "Reports", labelBn: "রিপোর্ট", path: ROUTES.REPORTS, icon: BarChart3, roles: ["admin", "owner", "treasurer"], moduleId: "reports" },
      { label: "Profit & Loss", labelBn: "লাভ-ক্ষতি", path: ROUTES.PROFIT_LOSS, icon: FileText, roles: MANAGEMENT, moduleId: "profit_loss" },
      { label: "Balance Sheet", labelBn: "ব্যালেন্স শিট", path: ROUTES.BALANCE_SHEET, icon: Scale, roles: MANAGEMENT, moduleId: "balance_sheet" },
      { label: "Ledger Audit", labelBn: "লেজার অডিট", path: ROUTES.LEDGER_AUDIT, icon: BookOpen, roles: ["admin", "owner", "treasurer"], moduleId: "ledger_audit" },
      { label: "Trial Balance", labelBn: "ট্রায়াল ব্যালেন্স", path: ROUTES.TRIAL_BALANCE, icon: Calculator, roles: MANAGEMENT, moduleId: "trial_balance" },
      { label: "Owner Profit", labelBn: "মালিক লাভ", path: ROUTES.OWNER_PROFIT, icon: Crown, roles: MANAGEMENT, moduleId: "owner_profit" },
      { label: "Quantum Ledger", labelBn: "কোয়ান্টাম লেজার", path: ROUTES.QUANTUM_LEDGER, icon: Atom, roles: ["admin", "owner", "treasurer"], moduleId: "quantum_ledger" },
      { label: "Commitment Analytics", labelBn: "প্রতিশ্রুতি বিশ্লেষণ", path: ROUTES.COMMITMENT_ANALYTICS, icon: Activity, roles: ["admin", "owner", "treasurer"], moduleId: "commitment_analytics" },
    ],
  },
  {
    title: "SYSTEM ADMINISTRATION",
    titleBn: "সিস্টেম প্রশাসন",
    items: [
      { label: "Bulk Onboarding", labelBn: "বাল্ক অনবোর্ডিং", path: ROUTES.BULK_ONBOARDING, icon: UserPlus, roles: MANAGEMENT, moduleId: "bulk_onboarding" },
      { label: "Settings", labelBn: "সেটিংস", path: ROUTES.SETTINGS, icon: Settings, roles: MANAGEMENT, moduleId: "settings" },
      { label: "Notifications", labelBn: "বিজ্ঞপ্তি", path: ROUTES.NOTIFICATIONS, icon: Bell, roles: MANAGEMENT, moduleId: "notifications" },
      { label: "Super Admin", labelBn: "সুপার অ্যাডমিন", path: ROUTES.SUPER_ADMIN, icon: ShieldCheck, roles: ADMIN_ONLY, moduleId: "super_admin" },
    ],
  },
];
