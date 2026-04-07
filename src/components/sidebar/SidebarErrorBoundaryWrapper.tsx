import { useLocation } from "react-router-dom";
import SidebarErrorBoundary from "./SidebarErrorBoundary";
import { systemMonitor } from "@/core/systemMonitor";

const SidebarErrorBoundaryWrapper = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();

  return (
    <SidebarErrorBoundary
      key={location.pathname}
      onError={(error, stack) => {
        // Route error telemetry through systemMonitor pipeline
        systemMonitor["telemetryAdapter"]?.("error", {
          message: error.message,
          stack: stack ?? error.stack,
          source: "SidebarErrorBoundary",
        });
      }}
    >
      {children}
    </SidebarErrorBoundary>
  );
};

export default SidebarErrorBoundaryWrapper;
