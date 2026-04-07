import type { NavItem } from "@/config/navigation";

interface SidebarNavItemProps {
  item: NavItem;
  isActive?: boolean;
}

const SidebarNavItem = ({ item, isActive = false }: SidebarNavItemProps) => {
  const Icon = item.icon;

  return (
    <a
      href={item.path}
      className={`
        flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium
        transition-colors duration-100
        ${
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }
      `}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </a>
  );
};

export default SidebarNavItem;
