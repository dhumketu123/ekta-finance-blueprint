import { useMemo, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { navigationGroups } from "@/config/navigation";
import { usePermissions, type AppRole } from "@/hooks/usePermissions";
import { useSidebarState } from "@/contexts/SidebarContext";
import { useIsMobile } from "@/hooks/use-mobile";
import SidebarBrand from "./SidebarBrand";
import SidebarNavGroup from "./SidebarNavGroup";
import SidebarFooter from "./SidebarFooter";
import type { NavGroup } from "@/config/navigation";

function filterGroupsByRole(groups: NavGroup[], role: AppRole | null): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!role) return false;
        return item.roles.includes(role);
      }),
    }))
    .filter((group) => group.items.length > 0);
}

const SidebarContent = ({ groups, onItemClick }: { groups: NavGroup[]; onItemClick?: () => void }) => (
  <>
    <SidebarBrand />
    <ScrollArea className="flex-1 py-2">
      {groups.map((group) => (
        <SidebarNavGroup key={group.title} group={group} onItemClick={onItemClick} />
      ))}
    </ScrollArea>
    <SidebarFooter />
  </>
);

const SidebarContainer = () => {
  const { role } = usePermissions();
  const { isOpen, close } = useSidebarState();
  const isMobile = useIsMobile();

  const filteredGroups = useMemo(
    () => filterGroupsByRole(navigationGroups, role),
    [role]
  );

  const handleItemClick = useCallback(() => {
    if (isMobile) close();
  }, [isMobile, close]);

  // Mobile: Sheet drawer
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
        <SheetContent side="left" className="w-[280px] p-0 flex flex-col bg-card">
          <SidebarContent groups={filteredGroups} onItemClick={handleItemClick} />
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: Fixed sidebar
  return (
    <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-[260px] md:border-r md:border-border md:bg-card md:z-40">
      <SidebarContent groups={filteredGroups} onItemClick={handleItemClick} />
    </aside>
  );
};

export default SidebarContainer;
