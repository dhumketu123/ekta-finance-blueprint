import React from "react";
import { NavLink } from "react-router-dom";
import type { NavItem } from "@/config/navigation";
import { useLanguage } from "@/contexts/LanguageContext";

interface SidebarNavItemProps {
  item: NavItem;
}

const SidebarNavItem = React.memo(({ item }: SidebarNavItemProps) => {
  const Icon = item.icon;
  const { lang } = useLanguage();
  const label = lang === "bn" ? item.labelBn ?? item.label : item.label;

  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-100 ${
          isActive
            ? "text-white"
            : "hover:text-white"
        }`
      }
      style={({ isActive }) => ({
        backgroundColor: isActive
          ? "hsl(var(--sidebar-accent))"
          : "transparent",
        color: isActive
          ? "hsl(var(--sidebar-primary-foreground))"
          : "hsl(var(--sidebar-foreground))",
      })}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </NavLink>
  );
});

SidebarNavItem.displayName = "SidebarNavItem";

export default SidebarNavItem;
