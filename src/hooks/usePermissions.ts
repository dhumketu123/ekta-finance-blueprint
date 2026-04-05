import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "admin" | "field_officer" | "owner" | "investor" | "treasurer" | "alumni";

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
};

const DEFAULT_PERMS: PermissionMatrix = PERMISSION_MAP.field_officer;

export const usePermissions = (): PermissionMatrix & { role: AppRole | null } => {
  const { role } = useAuth();
  const perms = role ? PERMISSION_MAP[role as AppRole] ?? DEFAULT_PERMS : DEFAULT_PERMS;
  return { ...perms, role: (role as AppRole) ?? null };
};
