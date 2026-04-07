import { ScrollArea } from "@/components/ui/scroll-area";
import { navigationGroups } from "@/config/navigation";
import SidebarBrand from "./SidebarBrand";
import SidebarNavGroup from "./SidebarNavGroup";
import SidebarFooter from "./SidebarFooter";

const SidebarContainer = () => {
  return (
    <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-[260px] md:border-r md:border-border md:bg-card md:z-40">
      <SidebarBrand />

      <ScrollArea className="flex-1 py-2">
        {navigationGroups.map((group) => (
          <SidebarNavGroup key={group.title} group={group} />
        ))}
      </ScrollArea>

      <SidebarFooter />
    </aside>
  );
};

export default SidebarContainer;
