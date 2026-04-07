import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { systemMonitor } from "@/core/systemMonitor";
import { useSidebarState } from "@/contexts/SidebarContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";

export function useSidebarTelemetry() {
  const { isOpen } = useSidebarState();
  const timeoutRef = useRef<number | null>(null);
  const isMobile = useIsMobile();
  const location = useLocation();
  const { role } = usePermissions();

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      systemMonitor.trackEvent("sidebar_toggle", {
        isOpen,
        device: isMobile ? "mobile" : "desktop",
        route: location.pathname,
        role,
      });
    }, 50);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isOpen, isMobile, location.pathname, role]);
}
