import { useEffect } from "react";
import { systemMonitor } from "@/core/systemMonitor";
import { useSidebarState } from "@/contexts/SidebarContext";

export function useSidebarTelemetry() {
  const { isOpen } = useSidebarState();

  useEffect(() => {
    systemMonitor.trackEvent("sidebar_toggle", { isOpen });
  }, [isOpen]);
}
