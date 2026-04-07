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
  AlertTriangle,
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
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/hooks/usePermissions";

export interface NavItem {
  label: string;
  labelBn?: string;
  path: string;
  icon: LucideIcon;
  roles: AppRole[];
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
      { label: "Dashboard", labelBn: "ড্যাশবোর্ড", path: "/", icon: LayoutDashboard, roles: ALL_OPS },
      { label: "Wallet", labelBn: "ওয়ালেট", path: "/wallet", icon: Wallet, roles: ["investor"] },
      { label: "Transactions", labelBn: "লেনদেন", path: "/transactions", icon: ArrowLeftRight, roles: ALL_OPS },
      { label: "Approvals", labelBn: "অনুমোদন", path: "/approvals", icon: CheckSquare, roles: ALL_OPS },
      { label: "Day Close", labelBn: "দিন বন্ধ", path: "/day-close", icon: Moon, roles: ALL_OPS },
      { label: "Commitments", labelBn: "প্রতিশ্রুতি", path: "/commitments", icon: Handshake, roles: ["admin", "owner", "field_officer"] },
    ],
  },
  {
    title: "CUSTOMER & INVESTOR",
    titleBn: "গ্রাহক ও বিনিয়োগকারী",
    items: [
      { label: "Clients", labelBn: "গ্রাহক", path: "/clients", icon: Users, roles: ["admin", "owner", "field_officer"] },
      { label: "Loans", labelBn: "ঋণ", path: "/loans", icon: Landmark, roles: ["admin", "owner", "field_officer"] },
      { label: "Savings", labelBn: "সঞ্চয়", path: "/savings", icon: PiggyBank, roles: ["admin", "owner", "field_officer", "treasurer"] },
      { label: "Investors", labelBn: "বিনিয়োগকারী", path: "/investors", icon: TrendingUp, roles: ["admin", "owner", "treasurer"] },
      { label: "Owners", labelBn: "মালিক", path: "/owners", icon: Building2, roles: MANAGEMENT },
      { label: "Field Officers", labelBn: "মাঠকর্মী", path: "/field-officers", icon: Map, roles: MANAGEMENT },
    ],
  },
  {
    title: "RISK & CONTROL",
    titleBn: "ঝুঁকি ও নিয়ন্ত্রণ",
    items: [
      { label: "Risk Dashboard", labelBn: "ঝুঁকি ড্যাশবোর্ড", path: "/risk-dashboard", icon: ShieldAlert, roles: ["admin", "owner", "treasurer"] },
      { label: "Risk Heatmap", labelBn: "ঝুঁকি হিটম্যাপ", path: "/risk-heatmap", icon: Flame, roles: ALL_OPS },
      { label: "Governance", labelBn: "গভর্ন্যান্স", path: "/governance", icon: Shield, roles: MANAGEMENT },
      { label: "Monitoring", labelBn: "মনিটরিং", path: "/monitoring", icon: Monitor, roles: MANAGEMENT },
    ],
  },
  {
    title: "INTELLIGENCE & REPORTING",
    titleBn: "বুদ্ধিমত্তা ও রিপোর্টিং",
    items: [
      { label: "Reports", labelBn: "রিপোর্ট", path: "/reports", icon: BarChart3, roles: ["admin", "owner", "treasurer"] },
      { label: "Profit & Loss", labelBn: "লাভ-ক্ষতি", path: "/profit-loss", icon: FileText, roles: MANAGEMENT },
      { label: "Balance Sheet", labelBn: "ব্যালেন্স শিট", path: "/balance-sheet", icon: Scale, roles: MANAGEMENT },
      { label: "Ledger Audit", labelBn: "লেজার অডিট", path: "/ledger-audit", icon: BookOpen, roles: ["admin", "owner", "treasurer"] },
      { label: "Trial Balance", labelBn: "ট্রায়াল ব্যালেন্স", path: "/trial-balance", icon: Calculator, roles: MANAGEMENT },
      { label: "Owner Profit", labelBn: "মালিক লাভ", path: "/owner-profit", icon: Crown, roles: MANAGEMENT },
      { label: "Quantum Ledger", labelBn: "কোয়ান্টাম লেজার", path: "/quantum-ledger", icon: Atom, roles: ["admin", "owner", "treasurer"] },
      { label: "Commitment Analytics", labelBn: "প্রতিশ্রুতি বিশ্লেষণ", path: "/commitment-analytics", icon: Activity, roles: ["admin", "owner", "treasurer"] },
    ],
  },
  {
    title: "SYSTEM ADMINISTRATION",
    titleBn: "সিস্টেম প্রশাসন",
    items: [
      { label: "Settings", labelBn: "সেটিংস", path: "/settings", icon: Settings, roles: MANAGEMENT },
      { label: "Notifications", labelBn: "বিজ্ঞপ্তি", path: "/notifications", icon: Bell, roles: MANAGEMENT },
      { label: "Super Admin", labelBn: "সুপার অ্যাডমিন", path: "/super-admin", icon: ShieldCheck, roles: ADMIN_ONLY },
    ],
  },
];
