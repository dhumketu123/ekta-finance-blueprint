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

export interface NavItem {
  label: string;
  labelBn?: string;
  path: string;
  icon: LucideIcon;
  roles: AppRole[];
  /**
   * Optional link to SYSTEM_INDEX module id.
   * Used by AI Assistant for context injection. Does NOT affect rendering.
   */
  moduleId?: string;
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
      { label: "Dashboard", labelBn: "ড্যাশবোর্ড", path: ROUTES.DASHBOARD, icon: LayoutDashboard, roles: ALL_OPS },
      { label: "Wallet", labelBn: "ওয়ালেট", path: ROUTES.INVESTOR_WALLET, icon: Wallet, roles: ["investor"] },
      { label: "Transactions", labelBn: "লেনদেন", path: ROUTES.TRANSACTIONS, icon: ArrowLeftRight, roles: ALL_OPS },
      { label: "Approvals", labelBn: "অনুমোদন", path: ROUTES.APPROVALS, icon: CheckSquare, roles: ALL_OPS },
      { label: "Day Close", labelBn: "দিন বন্ধ", path: ROUTES.DAY_CLOSE, icon: Moon, roles: ALL_OPS },
      { label: "Commitments", labelBn: "প্রতিশ্রুতি", path: ROUTES.COMMITMENTS, icon: Handshake, roles: ["admin", "owner", "field_officer"] },
    ],
  },
  {
    title: "CUSTOMER & INVESTOR",
    titleBn: "গ্রাহক ও বিনিয়োগকারী",
    items: [
      { label: "Clients", labelBn: "গ্রাহক", path: ROUTES.CLIENTS, icon: Users, roles: ["admin", "owner", "field_officer"] },
      { label: "Loans", labelBn: "ঋণ", path: ROUTES.LOANS, icon: Landmark, roles: ["admin", "owner", "field_officer"] },
      { label: "Savings", labelBn: "সঞ্চয়", path: ROUTES.SAVINGS, icon: PiggyBank, roles: ["admin", "owner", "field_officer", "treasurer"] },
      { label: "Investors", labelBn: "বিনিয়োগকারী", path: ROUTES.INVESTORS, icon: TrendingUp, roles: ["admin", "owner", "treasurer"] },
      { label: "Owners", labelBn: "মালিক", path: ROUTES.OWNERS, icon: Building2, roles: MANAGEMENT },
      { label: "Field Officers", labelBn: "মাঠকর্মী", path: ROUTES.FIELD_OFFICERS, icon: Map, roles: MANAGEMENT },
    ],
  },
  {
    title: "RISK & CONTROL",
    titleBn: "ঝুঁকি ও নিয়ন্ত্রণ",
    items: [
      { label: "Risk Dashboard", labelBn: "ঝুঁকি ড্যাশবোর্ড", path: ROUTES.RISK_DASHBOARD, icon: ShieldAlert, roles: ["admin", "owner", "treasurer"] },
      { label: "Risk Heatmap", labelBn: "ঝুঁকি হিটম্যাপ", path: ROUTES.RISK_HEATMAP, icon: Flame, roles: ALL_OPS },
      { label: "Governance", labelBn: "গভর্ন্যান্স", path: ROUTES.GOVERNANCE, icon: Shield, roles: MANAGEMENT },
      { label: "Monitoring", labelBn: "মনিটরিং", path: ROUTES.MONITORING, icon: Monitor, roles: MANAGEMENT },
    ],
  },
  {
    title: "INTELLIGENCE & REPORTING",
    titleBn: "বুদ্ধিমত্তা ও রিপোর্টিং",
    items: [
      { label: "Reports", labelBn: "রিপোর্ট", path: ROUTES.REPORTS, icon: BarChart3, roles: ["admin", "owner", "treasurer"] },
      { label: "Profit & Loss", labelBn: "লাভ-ক্ষতি", path: ROUTES.PROFIT_LOSS, icon: FileText, roles: MANAGEMENT },
      { label: "Balance Sheet", labelBn: "ব্যালেন্স শিট", path: ROUTES.BALANCE_SHEET, icon: Scale, roles: MANAGEMENT },
      { label: "Ledger Audit", labelBn: "লেজার অডিট", path: ROUTES.LEDGER_AUDIT, icon: BookOpen, roles: ["admin", "owner", "treasurer"] },
      { label: "Trial Balance", labelBn: "ট্রায়াল ব্যালেন্স", path: ROUTES.TRIAL_BALANCE, icon: Calculator, roles: MANAGEMENT },
      { label: "Owner Profit", labelBn: "মালিক লাভ", path: ROUTES.OWNER_PROFIT, icon: Crown, roles: MANAGEMENT },
      { label: "Quantum Ledger", labelBn: "কোয়ান্টাম লেজার", path: ROUTES.QUANTUM_LEDGER, icon: Atom, roles: ["admin", "owner", "treasurer"] },
      { label: "Commitment Analytics", labelBn: "প্রতিশ্রুতি বিশ্লেষণ", path: ROUTES.COMMITMENT_ANALYTICS, icon: Activity, roles: ["admin", "owner", "treasurer"] },
    ],
  },
  {
    title: "SYSTEM ADMINISTRATION",
    titleBn: "সিস্টেম প্রশাসন",
    items: [
      { label: "Bulk Onboarding", labelBn: "বাল্ক অনবোর্ডিং", path: ROUTES.BULK_ONBOARDING, icon: UserPlus, roles: MANAGEMENT },
      { label: "Settings", labelBn: "সেটিংস", path: ROUTES.SETTINGS, icon: Settings, roles: MANAGEMENT },
      { label: "Notifications", labelBn: "বিজ্ঞপ্তি", path: ROUTES.NOTIFICATIONS, icon: Bell, roles: MANAGEMENT },
      { label: "Super Admin", labelBn: "সুপার অ্যাডমিন", path: ROUTES.SUPER_ADMIN, icon: ShieldCheck, roles: ADMIN_ONLY },
    ],
  },
];
