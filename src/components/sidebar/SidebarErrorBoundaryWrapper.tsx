import { useLocation } from "react-router-dom";
import SidebarErrorBoundary from "./SidebarErrorBoundary";
import { telemetryAdapter } from "@/core/telemetryAdapter";

const SidebarErrorBoundaryWrapper = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();

  return (
    <SidebarErrorBoundary
      key={location.pathname}
      onError={(error, stack) => {
        telemetryAdapter("error", {
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
