import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "admin" | "field_officer" | "owner" | "investor" | "treasurer" | "alumni" | "manager";

interface PermissionMatrix {
  canViewClients: boolean;
  canEditClients: boolean;
  canDeleteClients: boolean;
  canViewInvestors: boolean;
  canEditInvestors: boolean;
  canViewLoans: boolean;
  canEditLoans: boolean;
  canViewSavings: boolean;
  canEditSavings: boolean;
  canViewOwners: boolean;
  canViewOfficers: boolean;
  canEditOfficers: boolean;
  canViewNotifications: boolean;
  canViewSettings: boolean;
  canViewReports: boolean;
  canApproveTransactions: boolean;
  canRecordPayments: boolean;
  canDeleteMasterData: boolean;
  canViewOwnWallet: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  isTreasurer: boolean;
  isFieldOfficer: boolean;
  isInvestor: boolean;
}

const PERMISSION_MAP: Record<AppRole, PermissionMatrix> = {
  admin: {
    canViewClients: true, canEditClients: true, canDeleteClients: true,
    canViewInvestors: true, canEditInvestors: true,
    canViewLoans: true, canEditLoans: true,
    canViewSavings: true, canEditSavings: true,
    canViewOwners: true, canViewOfficers: true, canEditOfficers: true,
    canViewNotifications: true, canViewSettings: true, canViewReports: true,
    canApproveTransactions: true, canRecordPayments: true, canDeleteMasterData: true,
    canViewOwnWallet: false,
    isAdmin: true, isOwner: false, isTreasurer: false, isFieldOfficer: false, isInvestor: false,
  },
  owner: {
    canViewClients: true, canEditClients: false, canDeleteClients: false,
    canViewInvestors: true, canEditInvestors: false,
    canViewLoans: true, canEditLoans: false,
    canViewSavings: true, canEditSavings: false,
    canViewOwners: true, canViewOfficers: true, canEditOfficers: false,
    canViewNotifications: true, canViewSettings: true, canViewReports: true,
    canApproveTransactions: false, canRecordPayments: false, canDeleteMasterData: false,
    canViewOwnWallet: false,
    isAdmin: false, isOwner: true, isTreasurer: false, isFieldOfficer: false, isInvestor: false,
  },
  field_officer: {
    canViewClients: true, canEditClients: false, canDeleteClients: false,
    canViewInvestors: false, canEditInvestors: false,
    canViewLoans: true, canEditLoans: false,
    canViewSavings: true, canEditSavings: false,
    canViewOwners: false, canViewOfficers: false, canEditOfficers: false,
    canViewNotifications: false, canViewSettings: false, canViewReports: false,
    canApproveTransactions: false, canRecordPayments: true, canDeleteMasterData: false,
    canViewOwnWallet: false,
    isAdmin: false, isOwner: false, isTreasurer: false, isFieldOfficer: true, isInvestor: false,
  },
  investor: {
    canViewClients: false, canEditClients: false, canDeleteClients: false,
    canViewInvestors: false, canEditInvestors: false,
    canViewLoans: false, canEditLoans: false,
    canViewSavings: false, canEditSavings: false,
    canViewOwners: false, canViewOfficers: false, canEditOfficers: false,
    canViewNotifications: false, canViewSettings: false, canViewReports: false,
    canApproveTransactions: false, canRecordPayments: false, canDeleteMasterData: false,
    canViewOwnWallet: true,
    isAdmin: false, isOwner: false, isTreasurer: false, isFieldOfficer: false, isInvestor: true,
  },
  treasurer: {
    canViewClients: false, canEditClients: false, canDeleteClients: false,
    canViewInvestors: true, canEditInvestors: false,
    canViewLoans: false, canEditLoans: false,
    canViewSavings: true, canEditSavings: false,
    canViewOwners: false, canViewOfficers: false, canEditOfficers: false,
    canViewNotifications: false, canViewSettings: false, canViewReports: true,
    canApproveTransactions: false, canRecordPayments: false, canDeleteMasterData: false,
    canViewOwnWallet: false,
    isAdmin: false, isOwner: false, isTreasurer: true, isFieldOfficer: false, isInvestor: false,
  },
  alumni: {
    canViewClients: false, canEditClients: false, canDeleteClients: false,
    canViewInvestors: false, canEditInvestors: false,
    canViewLoans: false, canEditLoans: false,
    canViewSavings: false, canEditSavings: false,
    canViewOwners: false, canViewOfficers: false, canEditOfficers: false,
    canViewNotifications: false, canViewSettings: false, canViewReports: false,
    canApproveTransactions: false, canRecordPayments: false, canDeleteMasterData: false,
    canViewOwnWallet: false,
    isAdmin: false, isOwner: false, isTreasurer: false, isFieldOfficer: false, isInvestor: false,
  },
  manager: {
    canViewClients: true, canEditClients: true, canDeleteClients: false,
    canViewInvestors: true, canEditInvestors: false,
    canViewLoans: true, canEditLoans: true,
    canViewSavings: true, canEditSavings: true,
    canViewOwners: false, canViewOfficers: true, canEditOfficers: false,
    canViewNotifications: true, canViewSettings: false, canViewReports: true,
    canApproveTransactions: true, canRecordPayments: true, canDeleteMasterData: false,
    canViewOwnWallet: false,
    isAdmin: false, isOwner: false, isTreasurer: false, isFieldOfficer: false, isInvestor: false,
  },
};

// ====================================================
// 🔐 STRICT ROLE SECURITY POLICY (NO FALLBACK ALLOWED)
// Blueprint V2 — Part 7: Unknown role = Access Blocked
// ====================================================
const DENY_ALL_PERMS: PermissionMatrix = Object.keys(
  PERMISSION_MAP.field_officer
).reduce((acc, key) => {
  acc[key as keyof PermissionMatrix] = false;
  return acc;
}, {} as PermissionMatrix);

// ====================================================
// 🧠 SAFE ROLE RESOLUTION LOGIC
// ====================================================
export const getPermissionsByRole = (role?: AppRole | null): PermissionMatrix => {
  // 🚨 HARD FAIL-SECURE: Unknown / missing role = NO ACCESS
  if (!role || !PERMISSION_MAP[role]) {
    return DENY_ALL_PERMS;
  }
  return PERMISSION_MAP[role];
};

export const usePermissions = () => {
  const { role } = useAuth();
  // 🚀 PERF: Memoize to prevent new object reference on every render.
  // Sidebar/AppLayout re-render-cascade fix.
  return useMemo(() => {
    const permissions = getPermissionsByRole(role as AppRole | null);
    return {
      ...permissions,      // backward-compat: const { canViewClients } = usePermissions()
      permissions,         // structured access: const { permissions } = usePermissions()
      role: (role as AppRole) ?? null,
    };
  }, [role]);
};
