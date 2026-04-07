import { useEffect, useRef } from "react";
import { systemMonitor } from "@/core/systemMonitor";
import { useSidebarState } from "@/contexts/SidebarContext";

export function useSidebarTelemetry() {
  const { isOpen } = useSidebarState();
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      systemMonitor.trackEvent("sidebar_toggle", { isOpen });
    }, 50);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isOpen]);
}
