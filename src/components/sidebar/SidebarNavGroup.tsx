import React, { useMemo, useCallback } from "react";
import { useLocation, matchPath } from "react-router-dom";
import { ChevronDown } from "lucide-react";
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

  const title = lang === "bn" && group.titleBn ? group.titleBn : group.title;

  const renderItem = useCallback(
    (item: NavItem) => <SidebarNavItem key={item.path} item={item} />,
    []
  );

  return (
    <div className="px-3 py-1">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors duration-100"
      >
        <span>{title}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-150 ${
            isOpen ? "rotate-0" : "-rotate-90"
          }`}
        />
      </button>

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
