import { useLocation } from "react-router-dom";
import SidebarErrorBoundary from "./SidebarErrorBoundary";

const SidebarErrorBoundaryWrapper = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();

  return (
    <SidebarErrorBoundary key={location.pathname}>
      {children}
    </SidebarErrorBoundary>
  );
};

export default SidebarErrorBoundaryWrapper;
