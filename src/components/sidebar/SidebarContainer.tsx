import { useMemo, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { navigationGroups } from "@/config/navigation";
import { usePermissions, type AppRole } from "@/hooks/usePermissions";
import { useSidebarState } from "@/contexts/SidebarContext";
import { useIsMobile } from "@/hooks/use-mobile";
import SidebarBrand from "./SidebarBrand";
import SidebarNavGroup from "./SidebarNavGroup";
import SidebarFooter from "./SidebarFooter";
import SidebarErrorBoundary from "./SidebarErrorBoundary";
import type { NavGroup } from "@/config/navigation";

function filterGroupsByRole(groups: NavGroup[], role: AppRole | null): NavGroup[] {
  if (!role) return [];
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}

/** Role-based left-border accent color */
function getRoleAccentColor(role: AppRole | null): string {
  switch (role) {
    case "admin":
      return "hsl(var(--sidebar-ring))";
    case "owner":
      return "hsl(var(--accent))";
    default:
      return "hsl(var(--sidebar-border))";
  }
}

const SidebarInner = ({ groups, accentColor }: { groups: NavGroup[]; accentColor: string }) => (
  <>
    <SidebarBrand />
    <div
      className="absolute left-0 top-0 bottom-0 w-[3px]"
      style={{ backgroundColor: accentColor }}
    />
    <ScrollArea className="flex-1 py-2">
      {groups.map((group) => (
        <SidebarNavGroup key={group.title} group={group} />
      ))}
    </ScrollArea>
    <SidebarFooter />
  </>
);

const SidebarContainer = () => {
  const { role } = usePermissions();
  const { isOpen, close } = useSidebarState();
  const isMobile = useIsMobile();
  const location = useLocation();

  useEffect(() => {
    if (isMobile) close();
  }, [location.pathname, isMobile, close]);

  const filteredGroups = useMemo(
    () => filterGroupsByRole(navigationGroups, role),
    [role]
  );

  const accentColor = useMemo(() => getRoleAccentColor(role), [role]);

  if (!role) return null;

  const sidebar = (
    <SidebarErrorBoundary>
      <SidebarInner groups={filteredGroups} accentColor={accentColor} />
    </SidebarErrorBoundary>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
        <SheetContent
          side="left"
          className="w-[280px] p-0 flex flex-col border-r-0 will-change-transform"
          style={{ backgroundColor: "hsl(var(--sidebar-background))" }}
        >
          {sidebar}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-[260px] md:border-r md:z-40 will-change-transform"
      style={{
        backgroundColor: "hsl(var(--sidebar-background))",
        borderColor: "hsl(var(--sidebar-border))",
      }}
    >
      {sidebar}
    </aside>
  );
};

export default SidebarContainer;
