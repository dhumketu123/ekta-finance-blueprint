import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import type { NavGroup } from "@/config/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import SidebarNavItem from "./SidebarNavItem";

interface SidebarNavGroupProps {
  group: NavGroup;
  onItemClick?: () => void;
}

const SidebarNavGroup = React.memo(({ group, onItemClick }: SidebarNavGroupProps) => {
  const location = useLocation();
  const { lang } = useLanguage();

  const hasActiveChild = useMemo(
    () => group.items.some((item) =>
      item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path)
    ),
    [group.items, location.pathname]
  );

  const [isOpen, setIsOpen] = React.useState(hasActiveChild);

  // Auto-expand when navigating into this group
  React.useEffect(() => {
    if (hasActiveChild) setIsOpen(true);
  }, [hasActiveChild]);

  const title = lang === "bn" && group.titleBn ? group.titleBn : group.title;

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
          {group.items.map((item) => (
            <SidebarNavItem key={item.path} item={item} onClick={onItemClick} />
          ))}
        </div>
      )}
    </div>
  );
});

SidebarNavGroup.displayName = "SidebarNavGroup";

export default SidebarNavGroup;
