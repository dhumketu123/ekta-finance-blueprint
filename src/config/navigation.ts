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
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const navigationGroups: NavGroup[] = [
  {
    title: "CORE OPERATIONS",
    items: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard },
      { label: "Transactions", path: "/transactions", icon: ArrowLeftRight },
      { label: "Approvals", path: "/approvals", icon: CheckSquare },
      { label: "Day Close", path: "/day-close", icon: Moon },
      { label: "Commitments", path: "/commitments", icon: Handshake },
    ],
  },
  {
    title: "CUSTOMER & INVESTOR",
    items: [
      { label: "Clients", path: "/clients", icon: Users },
      { label: "Loans", path: "/loans", icon: Landmark },
      { label: "Savings", path: "/savings", icon: PiggyBank },
      { label: "Investors", path: "/investors", icon: TrendingUp },
    ],
  },
  {
    title: "RISK & CONTROL",
    items: [
      { label: "Risk Dashboard", path: "/risk", icon: ShieldAlert },
      { label: "Risk Heatmap", path: "/risk-heatmap", icon: AlertTriangle },
      { label: "Governance", path: "/governance", icon: Shield },
      { label: "Field Officers", path: "/field-officers", icon: Map },
    ],
  },
  {
    title: "INTELLIGENCE & REPORTING",
    items: [
      { label: "Reports", path: "/reports", icon: BarChart3 },
      { label: "Profit & Loss", path: "/profit-loss", icon: FileText },
      { label: "Balance Sheet", path: "/balance-sheet", icon: Scale },
      { label: "Ledger Audit", path: "/ledger-audit", icon: BookOpen },
      { label: "Trial Balance", path: "/trial-balance", icon: Calculator },
    ],
  },
  {
    title: "SYSTEM ADMINISTRATION",
    items: [
      { label: "Settings", path: "/settings", icon: Settings },
      { label: "Owners", path: "/owners", icon: Building2 },
      { label: "Notifications", path: "/notifications", icon: Bell },
      { label: "User Management", path: "/super-admin", icon: UserCog },
    ],
  },
];
