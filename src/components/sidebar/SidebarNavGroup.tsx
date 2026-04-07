import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { NavGroup } from "@/config/navigation";
import SidebarNavItem from "./SidebarNavItem";

interface SidebarNavGroupProps {
  group: NavGroup;
  defaultOpen?: boolean;
}

const SidebarNavGroup = ({ group, defaultOpen = true }: SidebarNavGroupProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="px-3 py-1">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors duration-100"
      >
        <span>{group.title}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-150 ${
            isOpen ? "rotate-0" : "-rotate-90"
          }`}
        />
      </button>

      {isOpen && (
        <div className="mt-1 flex flex-col gap-0.5">
          {group.items.map((item) => (
            <SidebarNavItem key={item.path} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};

export default SidebarNavGroup;
