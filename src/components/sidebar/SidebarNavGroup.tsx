import React, { useMemo, useCallback } from "react";
import { useLocation, matchPath } from "react-router-dom";
import type { NavGroup, NavItem } from "@/config/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import SidebarNavItem from "./SidebarNavItem";

interface SidebarNavGroupProps {
  group: NavGroup;
}

const SidebarNavGroup = React.memo(({ group }: SidebarNavGroupProps) => {
  const location = useLocation();
  const { lang } = useLanguage();

  const hasActiveChild = useMemo(
    () =>
      group.items.some((item) =>
        matchPath({ path: item.path, end: item.path === "/" }, location.pathname)
      ),
    [group.items, location.pathname]
  );

  const [isOpen, setIsOpen] = React.useState(hasActiveChild);

  React.useEffect(() => {
    if (hasActiveChild) setIsOpen(true);
  }, [hasActiveChild]);

  const title = lang === "bn" ? group.titleBn ?? group.title : group.title ?? "";

  const renderItem = useCallback(
    (item: NavItem) => <SidebarNavItem key={item.path} item={item} />,
    []
  );

  return (
    <div className="px-3 py-1">
      <div
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-2 py-2 text-[11px] font-semibold uppercase tracking-wider cursor-pointer transition-colors duration-100 select-none"
        style={{ color: "hsl(var(--sidebar-muted))" }}
      >
        <span>{title}</span>
        <span className="text-[10px]">{isOpen ? "▾" : "▸"}</span>
      </div>

      {isOpen && (
        <div className="mt-1 flex flex-col gap-0.5">
          {group.items.map(renderItem)}
        </div>
      )}
    </div>
  );
});

SidebarNavGroup.displayName = "SidebarNavGroup";

export default SidebarNavGroup;
