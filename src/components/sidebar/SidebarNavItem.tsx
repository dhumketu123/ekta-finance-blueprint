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
  const label = lang === "bn" ? item.labelBn ?? item.label : item.label ?? "";

  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      className={({ isActive }) =>
        [
          "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium",
          "transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
          "outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
          isActive ? "" : "active:scale-95",
        ].join(" ")
      }
      style={({ isActive }) => ({
        backgroundColor: isActive
          ? "hsl(var(--sidebar-accent))"
          : "transparent",
        color: isActive
          ? "hsl(var(--sidebar-primary-foreground))"
          : "hsl(var(--sidebar-foreground))",
      })}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        if (!el.classList.contains("active")) {
          el.style.backgroundColor = "hsl(var(--sidebar-accent) / 0.35)";
          el.style.color = "hsl(var(--sidebar-primary-foreground))";
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        const isActive = el.getAttribute("aria-current") === "page";
        if (!isActive) {
          el.style.backgroundColor = "transparent";
          el.style.color = "hsl(var(--sidebar-foreground))";
        }
      }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </NavLink>
  );
});

SidebarNavItem.displayName = "SidebarNavItem";

export default SidebarNavItem;
